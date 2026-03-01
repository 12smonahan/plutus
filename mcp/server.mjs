import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = process.env.PLUTUS_URL || 'http://localhost:3000';

async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

function qs(params) {
  const entries = Object.entries(params).filter(([, v]) => v != null);
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries).toString();
}

const server = new McpServer({
  name: 'plutus',
  version: '1.0.0',
});

// --- Tools ---

server.tool(
  'query_transactions',
  'Search and filter transactions. Returns paginated results.',
  {
    start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
    account_id: z.string().optional().describe('Filter by account ID'),
    category: z.string().optional().describe('Filter by category'),
    search: z.string().optional().describe('Search by name or merchant'),
    limit: z.number().optional().describe('Max results (default 100, max 500)'),
    offset: z.number().optional().describe('Pagination offset'),
  },
  async (params) => {
    const data = await api(`/api/transactions${qs(params)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'spending_summary',
  'Aggregated spending by category, month, or account.',
  {
    group_by: z.enum(['category', 'month', 'account']).optional().describe('Grouping (default: category)'),
    start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
    account_id: z.string().optional().describe('Filter by account ID'),
  },
  async (params) => {
    const data = await api(`/api/transactions/summary${qs(params)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'get_accounts',
  'List all linked bank accounts with their latest balances.',
  {},
  async () => {
    const data = await api('/api/accounts');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'get_balances',
  'Get the latest balance for each linked account.',
  {},
  async () => {
    const data = await api('/api/balances');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'get_balance_history',
  'Get historical balance snapshots over time.',
  {
    account_id: z.string().optional().describe('Filter by account ID'),
    start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
  },
  async (params) => {
    const data = await api(`/api/balances/history${qs(params)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'get_net_worth',
  'Calculate net worth: assets minus liabilities, with breakdown by account.',
  {},
  async () => {
    const data = await api('/api/networth');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'manage_budgets',
  'List, set, or delete budgets. Use action param to choose operation.',
  {
    action: z.enum(['list', 'set', 'delete']).describe('Operation: list, set, or delete'),
    month: z.string().optional().describe('Budget month (YYYY-MM) — used with list and set'),
    category: z.string().optional().describe('Budget category — required for set'),
    amount: z.number().optional().describe('Budget amount — required for set'),
    id: z.number().optional().describe('Budget ID — required for delete'),
  },
  async ({ action, month, category, amount, id }) => {
    let data;
    switch (action) {
      case 'list':
        data = await api(`/api/budgets${qs({ month })}`);
        break;
      case 'set':
        if (!category || amount == null) {
          return { content: [{ type: 'text', text: 'Error: category and amount are required for set' }], isError: true };
        }
        data = await api('/api/budgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, month, amount }),
        });
        break;
      case 'delete':
        if (!id) {
          return { content: [{ type: 'text', text: 'Error: id is required for delete' }], isError: true };
        }
        data = await api(`/api/budgets/${id}`, { method: 'DELETE' });
        break;
    }
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'trigger_sync',
  'Sync all linked bank accounts via Plaid. Pulls latest transactions and balances.',
  {},
  async () => {
    const data = await api('/api/sync', { method: 'POST' });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
