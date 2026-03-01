const { Router } = require('express');
const db = require('../db');
const { syncAll, isSyncing } = require('../sync');

const router = Router();

// POST /api/sync — trigger immediate sync
router.post('/', async (req, res) => {
  try {
    const result = await syncAll();
    const items = db.prepare('SELECT item_id, alias, institution_name, last_synced_at FROM plaid_items').all();
    res.json({ success: true, ...result, items });
  } catch (err) {
    if (err.code === 'SYNC_IN_PROGRESS') {
      return res.status(409).json({
        error: 'Sync already in progress',
        started_at: err.startedAt,
      });
    }
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
