# Build Your Own Mint

A personal finance engine that syncs your bank transactions via [Plaid](https://plaid.com/) into a local SQLite database and exposes a REST API for querying transactions, balances, budgets, and net worth.

## Important Disclaimer

All this repo does is talk to the Plaid API and store data locally on your machine. No data is sent to any third party beyond Plaid. If you don't feel safe entering real bank credentials, audit the code yourself to make sure.

## Quick Start

```bash
npm install
cp .env.sample .env
# Fill in your Plaid credentials in .env
npm run link chase        # Connect a bank account
npm start                 # Start the server on port 3000
```

## Setup

### 1. Install Dependencies

Requires Node.js 18+.

```bash
npm install
```

### 2. Configure Environment

Rename `.env.sample` to `.env` and fill in your credentials:

```
PLAID_CLIENT_ID=        # From Plaid dashboard
PLAID_SECRET=           # From Plaid dashboard
PLAID_ENV=sandbox       # sandbox, development, or production
PORT=3000               # Server port (default: 3000)
SYNC_CRON=0 5 * * *    # Auto-sync schedule (default: daily at 5 AM UTC)
```

### 3. Get Plaid Credentials

Sign up for [Plaid](https://plaid.com/) and apply for the development plan. It's free and limited to 100 items (i.e. banks), which is more than enough for personal use. Once approved, copy your **Client ID** and **Secret** from the Plaid dashboard into `.env`.

You do **not** need a public key — the modern Plaid API uses Link tokens instead.

### 4. Connect Bank Accounts

```bash
npm run link <account-name>
```

This starts a local server at `http://localhost:8080` where you can authenticate with your bank via Plaid Link. The access token is saved to both the database and your `.env` file.

Repeat for each bank you want to connect, using a different account name each time:

```bash
npm run link chase
npm run link schwab
```

### 5. Start the Server

```bash
npm start
```

This starts the Express server, creates the SQLite database at `data/mint.db`, and registers the cron scheduler for automatic syncing.

### 6. Initial Sync

Trigger your first sync to pull transaction history:

```bash
curl -X POST http://localhost:3000/api/sync
```

The first sync pulls up to 2 years of history. Subsequent syncs are incremental (only new/modified/removed transactions).

## API Reference

All endpoints are under `/api/`.

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | List transactions with optional filters |
| GET | `/api/transactions/summary` | Aggregated spending by category, month, or account |

**Query parameters for `/api/transactions`:**
- `start_date`, `end_date` — date range (YYYY-MM-DD)
- `account_id` — filter by account
- `category` — filter by category
- `search` — search by name or merchant
- `limit` (default: 100, max: 500), `offset` — pagination

**Query parameters for `/api/transactions/summary`:**
- `group_by` — `category` (default), `month`, or `account`
- `start_date`, `end_date`, `account_id` — filters

### Accounts & Balances

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accounts` | All linked accounts with latest balance |
| GET | `/api/balances` | Latest balance per account |
| GET | `/api/balances/history` | Balance snapshots over time |

### Net Worth

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/networth` | Net worth (assets − liabilities) with breakdown |

### Budgets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/budgets` | List budgets (optionally for a `?month=YYYY-MM` with actual vs. budgeted) |
| POST | `/api/budgets` | Create/update a budget (`{ category, month, amount }`) |
| DELETE | `/api/budgets/:id` | Delete a budget |

### Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sync` | Trigger an immediate sync of all linked accounts |
| GET | `/api/sync/status` | Last sync time and stats per institution |

### Plaid Link

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/link/token` | Create a Plaid Link token |
| POST | `/api/link/exchange` | Exchange a public token for an access token (`{ public_token, alias }`) |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |

## Project Structure

```
index.js                    # Express server + scheduler entrypoint
data/
  .gitkeep                  # mint.db created at runtime
lib/
  db.js                     # SQLite setup + schema
  plaidClient.js            # Plaid SDK client
  fetch.js                  # Plaid API wrappers
  sync.js                   # Sync orchestration
  scheduler.js              # node-cron wrapper
  routes/
    transactions.js
    accounts.js
    balances.js
    budgets.js
    sync.js
    networth.js
    link.js
scripts/
  plaidServer.js            # Standalone Plaid Link flow for connecting banks
  saveEnv.js                # Helper to write .env values
  testPlaid.js              # Test Plaid connection
```

## Automatic Syncing

The server runs a cron job to sync transactions automatically. By default this runs daily at 5 AM UTC. Configure it via the `SYNC_CRON` environment variable using standard cron syntax:

```
SYNC_CRON=0 5 * * *      # Daily at 5 AM UTC (default)
SYNC_CRON=0 */6 * * *    # Every 6 hours
SYNC_CRON=0 5,17 * * *   # Twice daily at 5 AM and 5 PM UTC
```

You can also trigger a sync at any time via `POST /api/sync`.

## Testing

```bash
npm run test-plaid    # Verify Plaid connection and fetch sample data
```
