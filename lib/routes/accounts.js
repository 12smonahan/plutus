const { Router } = require('express');
const db = require('../db');

const router = Router();

// GET /api/accounts — all linked accounts with latest balance
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, pi.alias as institution_alias, pi.institution_name
    FROM accounts a
    LEFT JOIN plaid_items pi ON a.item_id = pi.item_id
    ORDER BY a.type, a.name
  `).all();

  res.json({ accounts: rows });
});

module.exports = router;
