const { Router } = require('express');
const { createLinkToken, exchangePublicToken } = require('../plaidLink');
const { asyncHandler } = require('../middleware/errorHandler');

const router = Router();

// POST /api/link/token — create Plaid Link token
router.post('/token', asyncHandler(async (req, res) => {
  const result = await createLinkToken();
  res.json(result);
}));

// POST /api/link/exchange — exchange public token for access token
router.post('/exchange', asyncHandler(async (req, res) => {
  const { public_token, alias } = req.body;
  if (!public_token) {
    return res.status(400).json({ error: 'public_token is required' });
  }

  const result = await exchangePublicToken(public_token, alias);
  res.json({
    item_id: result.item_id,
    alias: result.alias,
    institution_name: result.institution_name,
  });
}));

module.exports = router;
