const { Router } = require('express');
const db = require('../db');

const router = Router();

// GET /api/budgets — budgets for a month with actual vs. budgeted
router.get('/', (req, res) => {
  const { month } = req.query;
  if (!month) {
    // Return all budgets
    const rows = db.prepare('SELECT * FROM budgets ORDER BY month DESC, category').all();
    return res.json({ budgets: rows });
  }

  // Return budgets for a specific month with actual spending
  const budgets = db.prepare('SELECT * FROM budgets WHERE month = ?').all(month);

  const startDate = `${month}-01`;
  // End of month: add one month
  const [y, m] = month.split('-').map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const endDate = `${nextMonth}-01`;

  const actuals = db.prepare(`
    SELECT category, SUM(amount) as actual_amount, COUNT(*) as transaction_count
    FROM transactions
    WHERE date >= ? AND date < ?
    GROUP BY category
  `).all(startDate, endDate);

  const actualMap = {};
  for (const row of actuals) {
    actualMap[row.category] = row;
  }

  const result = budgets.map(b => ({
    ...b,
    actual_amount: actualMap[b.category]?.actual_amount || 0,
    transaction_count: actualMap[b.category]?.transaction_count || 0,
    remaining: b.amount - (actualMap[b.category]?.actual_amount || 0),
  }));

  res.json({ month, budgets: result });
});

// POST /api/budgets — create or update a budget entry
router.post('/', (req, res) => {
  const { category, month, amount } = req.body;
  if (!category || !month || amount == null) {
    return res.status(400).json({ error: 'category, month, and amount are required' });
  }

  const stmt = db.prepare(`
    INSERT INTO budgets (category, month, amount)
    VALUES (?, ?, ?)
    ON CONFLICT(category, month) DO UPDATE SET amount = excluded.amount
  `);
  const info = stmt.run(category, month, amount);

  const budget = db.prepare('SELECT * FROM budgets WHERE category = ? AND month = ?').get(category, month);
  res.json({ budget });
});

// DELETE /api/budgets/:id
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Budget not found' });
  }
  res.json({ deleted: true });
});

module.exports = router;
