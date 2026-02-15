const client = require('./plaidClient');

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
    const response = await client.transactionsSync(request);
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
  const response = await client.accountsGet({ access_token: accessToken });
  return response.data.accounts;
};

exports.accountsBalanceGet = async function (accessToken) {
  const response = await client.accountsBalanceGet({ access_token: accessToken });
  return response.data.accounts;
};
