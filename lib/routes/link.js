const { Router } = require('express');
const { CountryCode, Products } = require('plaid');
const client = require('../plaidClient');
const db = require('../db');

const router = Router();

// POST /api/link/token — create Plaid Link token
router.post('/token', async (req, res) => {
  try {
    const response = await client.linkTokenCreate({
      user: { client_user_id: 'build-your-own-mint' },
      client_name: 'plutus',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/link/exchange — exchange public token for access token
router.post('/exchange', async (req, res) => {
  const { public_token, alias } = req.body;
  if (!public_token) {
    return res.status(400).json({ error: 'public_token is required' });
  }

  try {
    const response = await client.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;

    // Get institution info
    const itemResponse = await client.itemGet({ access_token });
    const institutionId = itemResponse.data.item.institution_id;
    let institutionName = null;
    if (institutionId) {
      try {
        const instResponse = await client.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        });
        institutionName = instResponse.data.institution.name;
      } catch (e) {
        // Institution name is nice-to-have
      }
    }

    db.prepare(`
      INSERT INTO plaid_items (item_id, access_token, alias, institution_name)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(item_id) DO UPDATE SET
        access_token = excluded.access_token,
        alias = excluded.alias,
        institution_name = excluded.institution_name
    `).run(item_id, access_token, alias || null, institutionName);

    res.json({ item_id, alias, institution_name: institutionName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
