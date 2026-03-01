require('dotenv').config();

const express = require('express');
const db = require('./lib/db');
const scheduler = require('./lib/scheduler');

const app = express();
app.use(express.json());

// Mount API routes
app.use('/api/transactions', require('./lib/routes/transactions'));
app.use('/api/accounts', require('./lib/routes/accounts'));
app.use('/api/balances', require('./lib/routes/balances'));
app.use('/api/budgets', require('./lib/routes/budgets'));
app.use('/api/sync', require('./lib/routes/sync'));
app.use('/api/networth', require('./lib/routes/networth'));
app.use('/api/link', require('./lib/routes/link'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Migrate existing PLAID_TOKEN_* env vars into plaid_items table on first run
function migrateEnvTokens() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM plaid_items').get();
  if (existing.count > 0) return;

  const tokens = Object.keys(process.env)
    .filter(key => key.startsWith('PLAID_TOKEN_'))
    .map(key => ({
      alias: key.replace(/^PLAID_TOKEN_/, ''),
      access_token: process.env[key],
    }));

  if (tokens.length === 0) return;

  console.log(`Migrating ${tokens.length} existing PLAID_TOKEN_* env var(s) to database...`);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO plaid_items (item_id, access_token, alias)
    VALUES (?, ?, ?)
  `);

  const migrate = db.transaction(() => {
    for (const token of tokens) {
      // Use alias as placeholder item_id since we don't have the real one yet
      insert.run(`migrated_${token.alias}`, token.access_token, token.alias);
    }
  });
  migrate();
  console.log('Migration complete. Run POST /api/sync to fetch transaction data.');
}

migrateEnvTokens();

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${port}`);
  scheduler.start();
});
