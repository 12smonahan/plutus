const client = require('./plaidClient');
const log = require('./logger');

const MAX_RETRIES = Number(process.env.PLAID_MAX_RETRIES) || 3;
const BASE_DELAY_MS = 1000;

// Plaid error codes that are safe to retry (transient / rate-limit)
const RETRYABLE_CODES = new Set([
  'INTERNAL_SERVER_ERROR',
  'PLANNED_MAINTENANCE',
  'RATE_LIMIT_EXCEEDED',
]);

function isRetryable(err) {
  // Plaid SDK wraps errors with response.data.error_code
  const code = err?.response?.data?.error_code;
  if (code && RETRYABLE_CODES.has(code)) return true;

  // Network-level errors (timeout, connection reset)
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') return true;

  // HTTP 429 or 5xx without a Plaid error code
  const status = err?.response?.status;
  if (status === 429 || (status >= 500 && status < 600)) return true;

  return false;
}

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        log.warn({ attempt: attempt + 1, delay, label, errorCode: err?.response?.data?.error_code || err.code }, 'Plaid call failed, retrying');
        await new Promise(r => setTimeout(r, delay));
      } else {
        break;
      }
    }
  }
  throw lastErr;
}

exports.transactionsSync = async function (accessToken, cursor) {
  const request = { access_token: accessToken };
  if (cursor) {
    request.cursor = cursor;
  }

  const added = [];
  const modified = [];
  const removed = [];
  let hasMore = true;
  let nextCursor = cursor;

  while (hasMore) {
    if (nextCursor) {
      request.cursor = nextCursor;
    }
    const response = await withRetry(
      () => client.transactionsSync(request),
      'transactionsSync'
    );
    const data = response.data;

    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed);

    hasMore = data.has_more;
    nextCursor = data.next_cursor;
  }

  return { added, modified, removed, cursor: nextCursor };
};

exports.accountsGet = async function (accessToken) {
  const response = await withRetry(
    () => client.accountsGet({ access_token: accessToken }),
    'accountsGet'
  );
  return response.data.accounts;
};

exports.accountsBalanceGet = async function (accessToken) {
  const response = await withRetry(
    () => client.accountsBalanceGet({ access_token: accessToken }),
    'accountsBalanceGet'
  );
  return response.data.accounts;
};
