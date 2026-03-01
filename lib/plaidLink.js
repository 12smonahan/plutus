const crypto = require('crypto');
const { CountryCode, Products } = require('plaid');
const client = require('./plaidClient');
const db = require('./db');
const log = require('./logger');

const insertItem = db.prepare(`
  INSERT INTO plaid_items (item_id, access_token, alias, institution_name)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(item_id) DO UPDATE SET
    access_token = excluded.access_token,
    alias = excluded.alias,
    institution_name = excluded.institution_name
`);

/**
 * Create a Plaid Link token for initializing the Link flow.
 * @returns {{ link_token: string }}
 */
async function createLinkToken() {
  const response = await client.linkTokenCreate({
    user: { client_user_id: crypto.randomUUID() },
    client_name: 'plutus',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
  });
  return { link_token: response.data.link_token };
}

/**
 * Exchange a Plaid public token for an access token and save to DB.
 * @param {string} publicToken - Public token from Plaid Link
 * @param {string|null} alias - User-given name for this institution
 * @returns {{ item_id: string, alias: string|null, institution_name: string|null }}
 */
async function exchangePublicToken(publicToken, alias) {
  const response = await client.itemPublicTokenExchange({ public_token: publicToken });
  const { access_token, item_id } = response.data;

  if (!access_token || !item_id) {
    throw new Error('Invalid response from Plaid: missing access_token or item_id');
  }

  // Get institution info (best-effort)
  let institutionName = null;
  try {
    const itemResponse = await client.itemGet({ access_token });
    const institutionId = itemResponse.data.item.institution_id;
    if (institutionId) {
      const instResponse = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      institutionName = instResponse.data.institution.name;
    }
  } catch (e) {
    log.warn({ err: e }, 'Failed to fetch institution name');
  }

  insertItem.run(item_id, access_token, alias || null, institutionName);

  return { item_id, access_token, alias: alias || null, institution_name: institutionName };
}

module.exports = { createLinkToken, exchangePublicToken };
