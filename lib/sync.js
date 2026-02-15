const db = require('./db');
const { transactionsSync, accountsBalanceGet } = require('./fetch');

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
  console.log(`Syncing item: ${item.alias || item.item_id}`);

  const result = await transactionsSync(item.access_token, item.cursor);

  const applyChanges = db.transaction(() => {
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

    updateCursor.run(result.cursor, item.item_id);
  });

  applyChanges();

  console.log(`  Added: ${result.added.length}, Modified: ${result.modified.length}, Removed: ${result.removed.length}`);

  // Update accounts and capture balance snapshots
  try {
    const accounts = await accountsBalanceGet(item.access_token);
    const applyAccounts = db.transaction(() => {
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
    });
    applyAccounts();
    console.log(`  Updated ${accounts.length} accounts with balance snapshots`);
  } catch (err) {
    console.error(`  Failed to fetch balances: ${err.message}`);
  }
}

async function syncAll() {
  const items = db.prepare('SELECT * FROM plaid_items').all();
  if (items.length === 0) {
    console.log('No plaid items to sync.');
    return;
  }

  console.log(`Starting sync for ${items.length} item(s)...`);
  for (const item of items) {
    try {
      await syncItem(item);
    } catch (err) {
      console.error(`Error syncing item ${item.alias || item.item_id}: ${err.message}`);
    }
  }
  console.log('Sync complete.');
}

module.exports = { syncItem, syncAll };
