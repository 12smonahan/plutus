const { Router } = require('express');
const { createLinkToken, exchangePublicToken } = require('../plaidLink');

const router = Router();

// POST /api/link/token — create Plaid Link token
router.post('/token', async (req, res) => {
  try {
    const result = await createLinkToken();
    res.json(result);
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
    const result = await exchangePublicToken(public_token, alias);
    res.json({
      item_id: result.item_id,
      alias: result.alias,
      institution_name: result.institution_name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
