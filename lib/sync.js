const db = require('./db');
const { transactionsSync, accountsBalanceGet } = require('./fetch');
const log = require('./logger');

let syncInProgress = false;
let syncStartedAt = null;

const upsertAccount = db.prepare(`
  INSERT INTO accounts (account_id, item_id, name, official_name, type, subtype, mask, current_balance, available_balance, iso_currency_code, updated_at)
  VALUES (@account_id, @item_id, @name, @official_name, @type, @subtype, @mask, @current_balance, @available_balance, @iso_currency_code, datetime('now'))
  ON CONFLICT(account_id) DO UPDATE SET
    name=excluded.name,
    official_name=excluded.official_name,
    type=excluded.type,
    subtype=excluded.subtype,
    mask=excluded.mask,
    current_balance=excluded.current_balance,
    available_balance=excluded.available_balance,
    iso_currency_code=excluded.iso_currency_code,
    updated_at=datetime('now')
`);

const upsertTransaction = db.prepare(`
  INSERT INTO transactions (transaction_id, account_id, amount, date, name, merchant_name, category, category_detailed, pending, iso_currency_code)
  VALUES (@transaction_id, @account_id, @amount, @date, @name, @merchant_name, @category, @category_detailed, @pending, @iso_currency_code)
  ON CONFLICT(transaction_id) DO UPDATE SET
    amount=excluded.amount,
    date=excluded.date,
    name=excluded.name,
    merchant_name=excluded.merchant_name,
    category=excluded.category,
    category_detailed=excluded.category_detailed,
    pending=excluded.pending,
    iso_currency_code=excluded.iso_currency_code
`);

const deleteTransaction = db.prepare(`DELETE FROM transactions WHERE transaction_id = ?`);

const insertSnapshot = db.prepare(`
  INSERT INTO balance_snapshots (account_id, current_balance, available_balance)
  VALUES (?, ?, ?)
`);

const updateCursor = db.prepare(`UPDATE plaid_items SET cursor = ?, last_synced_at = datetime('now') WHERE item_id = ?`);

const updateItemStatus = db.prepare(`
  UPDATE plaid_items SET status = ?, error_code = ?, error_message = ? WHERE item_id = ?
`);

// Plaid error codes that indicate the user must re-authenticate
const REAUTH_CODES = new Set([
  'ITEM_LOGIN_REQUIRED',
  'ITEM_LOCKED',
  'INVALID_CREDENTIALS',
  'INVALID_MFA',
  'ITEM_NOT_SUPPORTED',
  'MFA_NOT_SUPPORTED',
  'INSUFFICIENT_CREDENTIALS',
  'NO_ACCOUNTS',
  'ITEM_NO_ERROR', // sometimes sent after re-auth to clear
]);

function getPlaidError(err) {
  const data = err?.response?.data;
  if (!data?.error_code) return null;
  return {
    code: data.error_code,
    message: data.error_message || data.display_message || err.message,
    type: data.error_type,
  };
}

function parseCategory(txn) {
  const pfc = txn.personal_finance_category;
  if (pfc) {
    return { category: pfc.primary, category_detailed: pfc.detailed };
  }
  const legacy = txn.category;
  if (legacy && legacy.length > 0) {
    return { category: legacy[0], category_detailed: legacy.join(' > ') };
  }
  return { category: null, category_detailed: null };
}

async function syncItem(item) {
  const label = item.alias || item.item_id;
  log.info({ item: label }, 'Syncing item');

  // Skip items that require re-authentication
  if (item.status === 'login_required') {
    log.warn({ item: label }, 'Skipping item: login required. Re-link this account via POST /api/link/token');
    return { skipped: true, reason: 'login_required' };
  }

  try {
    // Fetch all data from Plaid before writing anything to DB
    const accounts = await accountsBalanceGet(item.access_token);
    const result = await transactionsSync(item.access_token, item.cursor);

    // Apply all changes in a single atomic transaction
    const applyAll = db.transaction(() => {
      // Upsert accounts and capture balance snapshots
      for (const acct of accounts) {
        upsertAccount.run({
          account_id: acct.account_id,
          item_id: item.item_id,
          name: acct.name,
          official_name: acct.official_name || null,
          type: acct.type,
          subtype: acct.subtype || null,
          mask: acct.mask || null,
          current_balance: acct.balances.current,
          available_balance: acct.balances.available,
          iso_currency_code: acct.balances.iso_currency_code || null,
        });
        insertSnapshot.run(acct.account_id, acct.balances.current, acct.balances.available);
      }

      // Apply transaction changes
      for (const txn of result.added) {
        const cat = parseCategory(txn);
        upsertTransaction.run({
          transaction_id: txn.transaction_id,
          account_id: txn.account_id,
          amount: txn.amount,
          date: txn.date,
          name: txn.name,
          merchant_name: txn.merchant_name || null,
          category: cat.category,
          category_detailed: cat.category_detailed,
          pending: txn.pending ? 1 : 0,
          iso_currency_code: txn.iso_currency_code || null,
        });
      }

      for (const txn of result.modified) {
        const cat = parseCategory(txn);
        upsertTransaction.run({
          transaction_id: txn.transaction_id,
          account_id: txn.account_id,
          amount: txn.amount,
          date: txn.date,
          name: txn.name,
          merchant_name: txn.merchant_name || null,
          category: cat.category,
          category_detailed: cat.category_detailed,
          pending: txn.pending ? 1 : 0,
          iso_currency_code: txn.iso_currency_code || null,
        });
      }

      for (const txn of result.removed) {
        deleteTransaction.run(txn.transaction_id);
      }

      // Update cursor and clear any previous error status
      updateCursor.run(result.cursor, item.item_id);
      updateItemStatus.run('good', null, null, item.item_id);
    });

    applyAll();

    log.info({ item: label, accounts: accounts.length, added: result.added.length, modified: result.modified.length, removed: result.removed.length }, 'Item sync complete');
    return { skipped: false };
  } catch (err) {
    const plaidErr = getPlaidError(err);
    if (plaidErr) {
      const status = REAUTH_CODES.has(plaidErr.code) ? 'login_required' : 'error';
      updateItemStatus.run(status, plaidErr.code, plaidErr.message, item.item_id);
      log.error({ item: label, plaidError: plaidErr }, 'Plaid error during sync');
    }
    throw err;
  }
}

async function syncAll() {
  if (syncInProgress) {
    const err = new Error('Sync already in progress');
    err.code = 'SYNC_IN_PROGRESS';
    err.startedAt = syncStartedAt;
    throw err;
  }

  syncInProgress = true;
  syncStartedAt = new Date().toISOString();

  try {
    const items = db.prepare('SELECT * FROM plaid_items').all();
    if (items.length === 0) {
      log.info('No plaid items to sync');
      return { synced: 0, errors: 0, skipped: 0 };
    }

    log.info({ count: items.length }, 'Starting sync');
    let errors = 0;
    let skipped = 0;
    for (const item of items) {
      try {
        const result = await syncItem(item);
        if (result?.skipped) skipped++;
      } catch (err) {
        errors++;
        log.error({ err, item: item.alias || item.item_id }, 'Error syncing item');
      }
    }
    log.info({ synced: items.length - errors - skipped, errors, skipped }, 'Sync complete');
    return { synced: items.length - errors - skipped, errors, skipped };
  } finally {
    syncInProgress = false;
    syncStartedAt = null;
  }
}

function isSyncing() {
  return { inProgress: syncInProgress, startedAt: syncStartedAt };
}

module.exports = { syncItem, syncAll, isSyncing };
