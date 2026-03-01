# Plutus

AI agent-first personal finance engine. Syncs bank transactions via Plaid into SQLite, exposes data through a REST API, and provides an MCP server for AI agents.

## Architecture

```
Plaid API  →  sync.js  →  SQLite (data/mint.db)  →  Express REST API (:3000)
                                                  →  MCP stdio server (mcp/server.mjs)
```

- **Data pipeline**: Plaid SDK → fetch.js (with retry) → sync.js → SQLite
- **REST API**: Express server in index.js, routes in lib/routes/, central error handler
- **MCP server**: Standalone stdio process (ESM) that calls the REST API via HTTP — no direct DB access
- **Scheduler**: node-cron auto-syncs on a configurable schedule
- **Error handling**: Central middleware in lib/middleware/errorHandler.js, asyncHandler wrapper for async routes
- **Input validation**: lib/middleware/validate.js — date, month, number validators used across routes
- **Plaid resilience**: Exponential backoff retry in fetch.js, error code detection in sync.js, item status tracking
- **Docker**: Multi-stage Alpine build (build stage compiles `better-sqlite3` native deps, production stage is slim)

## Key Files

| File | Purpose |
|------|---------|
| `index.js` | Express server entrypoint, mounts routes, starts scheduler |
| `lib/db.js` | SQLite setup, schema creation (better-sqlite3) |
| `lib/plaidClient.js` | Plaid SDK client initialization |
| `lib/fetch.js` | Plaid API wrappers (fetch accounts, sync transactions) |
| `lib/sync.js` | Sync orchestration (iterates plaid_items, calls fetch, writes DB) |
| `lib/scheduler.js` | node-cron wrapper for auto-sync |
| `lib/plaidLink.js` | Shared Plaid Link token/exchange logic |
| `lib/logger.js` | Pino structured logger |
| `lib/middleware/errorHandler.js` | Central error handler + asyncHandler wrapper |
| `lib/middleware/validate.js` | Input validation helpers (dates, numbers) |
| `lib/routes/*.js` | Express route handlers |
| `mcp/server.mjs` | MCP stdio server (ESM, wraps REST API) |
| `scripts/plaidServer.js` | Standalone Plaid Link flow for connecting banks |
| `scripts/saveEnv.js` | Helper to write values to .env |

## Database Schema (data/mint.db)

### plaid_items
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | PK autoincrement |
| item_id | TEXT | Unique, Plaid item identifier |
| access_token | TEXT | NOT NULL |
| alias | TEXT | User-given name (e.g. "chase") |
| cursor | TEXT | Plaid sync cursor for incremental sync |
| institution_name | TEXT | |
| last_synced_at | TEXT | |
| created_at | TEXT | Default now |
| status | TEXT | Default 'good'. Values: good, login_required, error |
| error_code | TEXT | Plaid error code (e.g. ITEM_LOGIN_REQUIRED) |
| error_message | TEXT | Human-readable error message |

### accounts
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | PK autoincrement |
| account_id | TEXT | Unique, NOT NULL |
| item_id | TEXT | FK → plaid_items(item_id) |
| name | TEXT | |
| official_name | TEXT | |
| type | TEXT | depository, credit, loan, investment, etc. |
| subtype | TEXT | checking, savings, credit card, etc. |
| mask | TEXT | Last 4 digits |
| current_balance | REAL | |
| available_balance | REAL | |
| iso_currency_code | TEXT | |
| updated_at | TEXT | Default now |

### transactions
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | PK autoincrement |
| transaction_id | TEXT | Unique, NOT NULL |
| account_id | TEXT | FK → accounts(account_id) |
| amount | REAL | NOT NULL (positive = money out) |
| date | TEXT | NOT NULL (YYYY-MM-DD) |
| name | TEXT | |
| merchant_name | TEXT | |
| category | TEXT | Plaid primary category |
| category_detailed | TEXT | Plaid detailed category |
| pending | INTEGER | 0 or 1 |
| iso_currency_code | TEXT | |
| created_at | TEXT | Default now |

### balance_snapshots
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | PK autoincrement |
| account_id | TEXT | FK → accounts(account_id) |
| current_balance | REAL | |
| available_balance | REAL | |
| captured_at | TEXT | Default now |

### budgets
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | PK autoincrement |
| category | TEXT | NOT NULL |
| month | TEXT | NOT NULL (YYYY-MM) |
| amount | REAL | NOT NULL |
| created_at | TEXT | Default now |
| | | UNIQUE(category, month) |

## API Endpoints

```
GET    /api/transactions            Query transactions (filters: start_date, end_date, account_id, category, search, limit, offset)
GET    /api/transactions/summary    Spending summary (group_by: category|month|account)
GET    /api/accounts                List accounts with balances
GET    /api/balances                Latest balance per account
GET    /api/balances/history        Balance snapshots over time
GET    /api/networth                Net worth breakdown
GET    /api/budgets                 List budgets (?month=YYYY-MM for actuals)
POST   /api/budgets                 Create/update budget { category, month, amount }
DELETE /api/budgets/:id             Delete budget
POST   /api/sync                    Trigger sync
GET    /api/sync/status             Sync status per institution (includes error_code, status)
POST   /api/link/token              Create Plaid Link token
POST   /api/link/exchange           Exchange public token { public_token, alias }
GET    /api/health                  Health check
```

## Development Conventions

- **CommonJS** for the main project (`require`/`module.exports`)
- **ESM** (`.mjs`) only for the MCP server (SDK requires it)
- No TypeScript, no build step
- SQLite via `better-sqlite3` (synchronous API)
- All dates stored as ISO strings (YYYY-MM-DD or datetime)
- Amounts follow Plaid convention: positive = money spent/debited
- No authentication on the API (local use only)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| PLAID_CLIENT_ID | Yes | — | Plaid dashboard client ID |
| PLAID_SECRET | Yes | — | Plaid dashboard secret |
| PLAID_ENV | No | sandbox | sandbox, development, or production |
| PORT | No | 3000 | Express server port |
| SYNC_CRON | No | `0 5 * * *` | Cron schedule for auto-sync |
| DB_VERBOSE | No | — | Set to enable SQLite query logging |
| PLAID_MAX_RETRIES | No | 3 | Max retries for transient Plaid API errors |

## Common Tasks

```bash
npm start                        # Start Express server on :3000
npm run mcp                      # Start MCP stdio server
npm run link <name>              # Connect a bank account via Plaid Link
npm run test-plaid               # Test Plaid connection
curl -X POST localhost:3000/api/sync   # Trigger manual sync

# Docker
docker compose up -d             # Start in background (builds if needed)
docker compose down              # Stop and remove container
docker compose logs -f           # Follow logs
docker compose build             # Rebuild image after code changes
```
