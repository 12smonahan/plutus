require('dotenv').config();

const express = require('express');
const db = require('./lib/db');
const scheduler = require('./lib/scheduler');
const log = require('./lib/logger');

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

  log.info({ count: tokens.length }, 'Migrating PLAID_TOKEN_* env vars to database');
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
  log.info('Migration complete. Run POST /api/sync to fetch transaction data.');
}

migrateEnvTokens();

const port = process.env.PORT || 3000;
const server = app.listen(port, '0.0.0.0', () => {
  log.info({ port }, 'Server running');
  scheduler.start();
});

// Graceful shutdown
function shutdown(signal) {
  log.info({ signal }, 'Shutting down gracefully');
  server.close(() => {
    log.info('HTTP server closed');
    scheduler.stop();
    log.info('Scheduler stopped');
    db.close();
    log.info('Database closed');
    process.exit(0);
  });

  setTimeout(() => {
    log.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'Uncaught exception');
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  log.error({ reason }, 'Unhandled rejection');
});
