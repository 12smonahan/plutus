const { Router } = require('express');
const db = require('../db');
const { syncAll } = require('../sync');

const router = Router();

// POST /api/sync — trigger immediate sync
router.post('/', async (req, res) => {
  try {
    await syncAll();
    const items = db.prepare('SELECT item_id, alias, institution_name, last_synced_at FROM plaid_items').all();
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/status — last sync time per institution
router.get('/status', (req, res) => {
  const items = db.prepare(`
    SELECT pi.item_id, pi.alias, pi.institution_name, pi.last_synced_at, pi.created_at,
           COUNT(DISTINCT a.account_id) as account_count,
           COUNT(DISTINCT t.id) as transaction_count
    FROM plaid_items pi
    LEFT JOIN accounts a ON pi.item_id = a.item_id
    LEFT JOIN transactions t ON a.account_id = t.account_id
    GROUP BY pi.item_id
  `).all();

  res.json({ items });
});

module.exports = router;
