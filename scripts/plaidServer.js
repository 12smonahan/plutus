require('dotenv').config();

const path = require('path');
const express = require('express');
const { createLinkToken, exchangePublicToken } = require('../lib/plaidLink');
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
    const result = await createLinkToken();
    res.json(result);
  } catch (err) {
    console.error('Failed to create link token:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/exchange', async (req, res) => {
  const { public_token } = req.body;
  try {
    const result = await exchangePublicToken(public_token, account);

    // Save to .env for backward compatibility
    saveEnv({ [`PLAID_TOKEN_${account}`]: result.access_token });

    console.log(`\nAccount "${account}" linked successfully!`);
    console.log(`  Item ID: ${result.item_id}`);
    console.log(`  Institution: ${result.institution_name || 'N/A'}\n`);

    res.json({ item_id: result.item_id, institution_name: result.institution_name });
  } catch (err) {
    console.error('Exchange failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nPlaid Link server started at http://localhost:${PORT}`);
  console.log(`Open the URL above in your browser to connect account "${account}"\n`);
});
