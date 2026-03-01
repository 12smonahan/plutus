# Plutus

**AI agent-first personal finance engine.** Syncs your bank data via [Plaid](https://plaid.com/) into a local SQLite database and exposes it through a REST API and [MCP](https://modelcontextprotocol.io/) server — designed for personal AI agents to query your finances, track spending, and manage budgets.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│  Your Banks  │────▶│   Plaid API  │────▶│       Plutus         │
└──────────────┘     └──────────────┘     │                      │
                                          │  ┌────────────────┐  │
                                          │  │ SQLite (mint.db)│  │
                                          │  └───────┬────────┘  │
                                          │          │           │
                                          │  ┌───────▼────────┐  │
                                          │  │  REST API :3000 │  │
                                          │  └───────┬────────┘  │
                                          └──────────┼───────────┘
                                                     │
                                    ┌────────────────┼────────────────┐
                                    │                │                │
                              ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
                              │ MCP Server│   │   curl /   │   │  Your App │
                              │ (stdio)   │   │  scripts   │   │           │
                              └─────┬─────┘   └───────────┘   └───────────┘
                                    │
                              ┌─────▼─────┐
                              │ AI Agent  │
                              │ (Claude,  │
                              │  etc.)    │
                              └───────────┘
```

## How It Works

1. **Connect** your bank accounts via Plaid Link
2. **Sync** pulls transactions and balances into a local SQLite database
3. **Query** your financial data through the REST API or MCP server
4. **Automate** — a cron scheduler keeps data fresh automatically

All data stays on your machine. No third parties beyond Plaid.

## Quick Start

```bash
npm install
cp .env.sample .env
# Fill in your Plaid credentials in .env

npm run link chase          # Connect a bank account
npm start                   # Start the server on port 3000
curl -X POST localhost:3000/api/sync   # Pull transactions
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

Sign up for [Plaid](https://plaid.com/) and apply for the development plan. It's free and limited to 100 items (i.e. banks), which is more than enough for personal use. Copy your **Client ID** and **Secret** from the Plaid dashboard into `.env`.

### 4. Connect Bank Accounts

```bash
npm run link <account-name>
```

This starts a local server at `http://localhost:8080` where you can authenticate with your bank via Plaid Link. The access token is saved to both the database and your `.env` file.

Repeat for each bank:

```bash
npm run link chase
npm run link schwab
```

### 5. Start the Server

```bash
npm start
```

Starts the Express server, creates the SQLite database at `data/mint.db`, and registers the cron scheduler.

### 6. Initial Sync

```bash
curl -X POST http://localhost:3000/api/sync
```

The first sync pulls up to 2 years of history. Subsequent syncs are incremental.

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
| GET | `/api/networth` | Net worth (assets - liabilities) with breakdown |

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

## MCP Integration

The MCP server lets AI agents interact with your financial data natively. It runs as a stdio process that calls the REST API internally.

**Start the server** (the Express API must be running separately):

```bash
npm run mcp
```

### Claude Desktop Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "plutus": {
      "command": "node",
      "args": ["/absolute/path/to/plutus/mcp/server.mjs"],
      "env": {
        "PLUTUS_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `query_transactions` | Search/filter transactions |
| `spending_summary` | Aggregated spending by category/month/account |
| `get_accounts` | List linked accounts with balances |
| `get_balances` | Latest balance per account |
| `get_balance_history` | Historical balance snapshots |
| `get_net_worth` | Assets minus liabilities breakdown |
| `manage_budgets` | List/set/delete budgets |
| `trigger_sync` | Sync all linked banks via Plaid |

## Project Structure

```
index.js                    # Express server + scheduler entrypoint
mcp/
  server.mjs                # MCP stdio server (ESM, wraps REST API)
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

## Auto-Syncing

The server runs a cron job to sync transactions automatically. Configure via `SYNC_CRON`:

```
SYNC_CRON=0 5 * * *      # Daily at 5 AM UTC (default)
SYNC_CRON=0 */6 * * *    # Every 6 hours
SYNC_CRON=0 5,17 * * *   # Twice daily
```

You can also trigger a sync anytime via `POST /api/sync`.

## Docker

### Quick Start

```bash
docker compose up -d
```

This builds the image, starts the container, and mounts `./data` for SQLite persistence. The server is available at `http://localhost:3000`.

### Manual Build & Run

```bash
docker build -t plutus .
docker run -d \
  --name plutus \
  -p 3000:3000 \
  --env-file .env \
  -v ./data:/app/data \
  --restart unless-stopped \
  plutus
```

### Notes

- **Volume mount**: `./data:/app/data` persists the SQLite database across container restarts. Without this, data is lost when the container is removed.
- **Port mapping**: Change `3000:3000` to `<host-port>:3000` to use a different host port, or set `PORT` in `.env` and update both sides.
- **Health check**: The container has a built-in health check against `/api/health`. Check status with `docker inspect --format='{{.State.Health.Status}}' plutus`.
- **Multi-stage build**: Native dependencies (`better-sqlite3`) are compiled in a build stage with `python3`/`make`/`g++`, keeping the production image slim.

### Commands

```bash
docker compose up -d         # Start in background
docker compose down          # Stop and remove container
docker compose logs -f       # Follow logs
docker compose build         # Rebuild image after code changes
```

## Acknowledgments

Originally inspired by [Build Your Own Mint](https://github.com/yyx990803/build-your-own-mint) by Evan You.
