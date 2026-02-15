const { Router } = require('express');
const db = require('../db');

const router = Router();

const ASSET_TYPES = ['depository', 'investment', 'brokerage'];
const LIABILITY_TYPES = ['credit', 'loan'];

// GET /api/networth — net worth = assets - liabilities, with breakdown
router.get('/', (req, res) => {
  const accounts = db.prepare(`
    SELECT account_id, name, type, subtype, current_balance, iso_currency_code,
           updated_at
    FROM accounts
  `).all();

  let totalAssets = 0;
  let totalLiabilities = 0;
  const assets = [];
  const liabilities = [];

  for (const acct of accounts) {
    const balance = acct.current_balance || 0;
    if (ASSET_TYPES.includes(acct.type)) {
      totalAssets += balance;
      assets.push(acct);
    } else if (LIABILITY_TYPES.includes(acct.type)) {
      totalLiabilities += balance;
      liabilities.push(acct);
    }
  }

  res.json({
    net_worth: totalAssets - totalLiabilities,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    assets,
    liabilities,
  });
});

module.exports = router;
