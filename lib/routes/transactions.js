const { Router } = require('express');
const db = require('../db');
const { validDate, positiveInt, validateQuery } = require('../middleware/validate');

const router = Router();

const listRules = [
  ['start_date', validDate, 'must be YYYY-MM-DD'],
  ['end_date', validDate, 'must be YYYY-MM-DD'],
  ['limit', positiveInt, 'must be a non-negative integer'],
  ['offset', positiveInt, 'must be a non-negative integer'],
];

// GET /api/transactions — list with optional filters and pagination
router.get('/', (req, res) => {
  const err = validateQuery(req.query, listRules);
  if (err) return res.status(400).json({ error: err });

  const { account_id, category, start_date, end_date, limit = 100, offset = 0, search } = req.query;

  let where = [];
  let params = {};

  if (account_id) {
    where.push('t.account_id = @account_id');
    params.account_id = account_id;
  }
  if (category) {
    where.push('t.category = @category');
    params.category = category;
  }
  if (start_date) {
    where.push('t.date >= @start_date');
    params.start_date = start_date;
  }
  if (end_date) {
    where.push('t.date <= @end_date');
    params.end_date = end_date;
  }
  if (search) {
    where.push("(t.name LIKE @search OR t.merchant_name LIKE @search)");
    params.search = `%${search}%`;
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM transactions t ${whereClause}`).get(params);

  params.limit = Math.min(Number(limit), 500);
  params.offset = Number(offset);

  const rows = db.prepare(`
    SELECT t.*, a.name as account_name, a.type as account_type
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.account_id
    ${whereClause}
    ORDER BY t.date DESC, t.id DESC
    LIMIT @limit OFFSET @offset
  `).all(params);

  res.json({ total: countRow.total, transactions: rows });
});

const summaryRules = [
  ['start_date', validDate, 'must be YYYY-MM-DD'],
  ['end_date', validDate, 'must be YYYY-MM-DD'],
];

const VALID_GROUP_BY = ['category', 'month', 'account'];

// GET /api/transactions/summary — aggregated spending
router.get('/summary', (req, res) => {
  const err = validateQuery(req.query, summaryRules);
  if (err) return res.status(400).json({ error: err });

  const { group_by = 'category', start_date, end_date, account_id } = req.query;

  if (!VALID_GROUP_BY.includes(group_by)) {
    return res.status(400).json({ error: `Invalid group_by: must be one of ${VALID_GROUP_BY.join(', ')}` });
  }

  let where = [];
  let params = {};

  if (start_date) {
    where.push('date >= @start_date');
    params.start_date = start_date;
  }
  if (end_date) {
    where.push('date <= @end_date');
    params.end_date = end_date;
  }
  if (account_id) {
    where.push('account_id = @account_id');
    params.account_id = account_id;
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  let groupCol;
  switch (group_by) {
    case 'month':
      groupCol = "strftime('%Y-%m', date)";
      break;
    case 'account':
      groupCol = 'account_id';
      break;
    case 'category':
    default:
      groupCol = 'category';
      break;
  }

  const rows = db.prepare(`
    SELECT ${groupCol} as group_key,
           COUNT(*) as transaction_count,
           SUM(amount) as total_amount,
           AVG(amount) as avg_amount,
           MIN(amount) as min_amount,
           MAX(amount) as max_amount
    FROM transactions
    ${whereClause}
    GROUP BY ${groupCol}
    ORDER BY total_amount DESC
  `).all(params);

  res.json({ group_by, summary: rows });
});

module.exports = router;
