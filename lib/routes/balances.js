const { Router } = require('express');
const db = require('../db');

const router = Router();

// GET /api/balances — latest balance per account
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT a.account_id, a.name, a.type, a.subtype,
           a.current_balance, a.available_balance, a.iso_currency_code,
           a.updated_at,
           pi.alias as institution_alias, pi.institution_name
    FROM accounts a
    LEFT JOIN plaid_items pi ON a.item_id = pi.item_id
    ORDER BY a.type, a.name
  `).all();

  res.json({ balances: rows });
});

// GET /api/balances/history — balance snapshots over time
router.get('/history', (req, res) => {
  const { account_id, start_date, end_date, limit = 500 } = req.query;

  let where = [];
  let params = {};

  if (account_id) {
    where.push('bs.account_id = @account_id');
    params.account_id = account_id;
  }
  if (start_date) {
    where.push('bs.captured_at >= @start_date');
    params.start_date = start_date;
  }
  if (end_date) {
    where.push('bs.captured_at <= @end_date');
    params.end_date = end_date;
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  params.limit = Math.min(Number(limit), 2000);

  const rows = db.prepare(`
    SELECT bs.*, a.name as account_name, a.type as account_type
    FROM balance_snapshots bs
    LEFT JOIN accounts a ON bs.account_id = a.account_id
    ${whereClause}
    ORDER BY bs.captured_at DESC
    LIMIT @limit
  `).all(params);

  res.json({ snapshots: rows });
});

module.exports = router;
