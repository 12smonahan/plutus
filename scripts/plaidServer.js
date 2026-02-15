require('dotenv').config();

const path = require('path');
const express = require('express');
const { CountryCode, Products } = require('plaid');
const client = require('../lib/plaidClient');
const db = require('../lib/db');
const saveEnv = require('./saveEnv');

const account = process.argv[2];
if (!account) {
  console.error('Usage: node scripts/plaidServer.js <account-name>');
  console.error('Example: node scripts/plaidServer.js chase');
  process.exit(1);
}

const app = express();
app.use(express.json());

const PORT = 8080;

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Link Account: ${account}</title>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; }
    h1 { color: #333; }
    button { background: #0066ff; color: #fff; border: none; padding: 12px 24px; font-size: 16px; border-radius: 6px; cursor: pointer; }
    button:hover { background: #0052cc; }
    #result { margin-top: 20px; padding: 16px; background: #f5f5f5; border-radius: 6px; display: none; white-space: pre-wrap; font-family: monospace; }
    .success { background: #e6f9e6 !important; }
    .error { background: #ffe6e6 !important; }
  </style>
</head>
<body>
  <h1>Link Account: ${account}</h1>
  <p>Click the button below to connect your bank account via Plaid.</p>
  <button id="link-btn" disabled>Loading Plaid Link...</button>
  <div id="result"></div>

  <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
  <script>
    const resultEl = document.getElementById('result');
    const linkBtn = document.getElementById('link-btn');

    fetch('/create_link_token', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        const handler = Plaid.create({
          token: data.link_token,
          onSuccess: (publicToken, metadata) => {
            resultEl.style.display = 'block';
            resultEl.textContent = 'Exchanging token...';
            fetch('/exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ public_token: publicToken, institution: metadata.institution?.name }),
            })
              .then(r => r.json())
              .then(result => {
                if (result.error) {
                  resultEl.className = 'error';
                  resultEl.textContent = 'Error: ' + result.error;
                } else {
                  resultEl.className = 'success';
                  resultEl.textContent = 'Success! Account linked.\\n\\nItem ID: ' + result.item_id +
                    '\\nInstitution: ' + (result.institution_name || 'N/A') +
                    '\\n\\nAccess token saved to .env and database.' +
                    '\\nYou can close this window and start your server.';
                }
              });
          },
          onExit: (err) => {
            if (err) {
              resultEl.style.display = 'block';
              resultEl.className = 'error';
              resultEl.textContent = 'Link exited with error: ' + JSON.stringify(err);
            }
          },
        });
        linkBtn.disabled = false;
        linkBtn.textContent = 'Connect Bank Account';
        linkBtn.onclick = () => handler.open();
      });
  </script>
</body>
</html>`);
});

app.post('/create_link_token', async (req, res) => {
  try {
    const response = await client.linkTokenCreate({
      user: { client_user_id: 'build-your-own-mint' },
      client_name: 'Build Your Own Mint',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('Failed to create link token:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/exchange', async (req, res) => {
  const { public_token, institution } = req.body;
  try {
    const response = await client.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;

    // Get institution info
    let institutionName = institution || null;
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
      // Institution name is nice-to-have
    }

    // Save to database
    db.prepare(`
      INSERT INTO plaid_items (item_id, access_token, alias, institution_name)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(item_id) DO UPDATE SET
        access_token = excluded.access_token,
        alias = excluded.alias,
        institution_name = excluded.institution_name
    `).run(item_id, access_token, account, institutionName);

    // Save to .env for backward compatibility
    saveEnv({ [`PLAID_TOKEN_${account}`]: access_token });

    console.log(`\nAccount "${account}" linked successfully!`);
    console.log(`  Item ID: ${item_id}`);
    console.log(`  Institution: ${institutionName || 'N/A'}\n`);

    res.json({ item_id, institution_name: institutionName });
  } catch (err) {
    console.error('Exchange failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nPlaid Link server started at http://localhost:${PORT}`);
  console.log(`Open the URL above in your browser to connect account "${account}"\n`);
});
