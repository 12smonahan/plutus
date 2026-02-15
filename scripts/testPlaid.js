require('dotenv').config();

const { accountsGet, accountsBalanceGet, transactionsSync } = require('../lib/fetch');

const accessToken = process.env.PLAID_TOKEN_test || Object.keys(process.env)
  .filter(k => k.startsWith('PLAID_TOKEN_'))
  .map(k => process.env[k])[0];

if (!accessToken) {
  console.error('No PLAID_TOKEN_* found in .env. Run `npm run link <account>` to connect a bank first.');
  process.exit(1);
}

(async () => {
  console.log('Testing Plaid connection...\n');

  console.log('--- Accounts ---');
  const accounts = await accountsGet(accessToken);
  console.log(JSON.stringify(accounts, null, 2));

  console.log('\n--- Balances ---');
  const balances = await accountsBalanceGet(accessToken);
  for (const acct of balances) {
    console.log(`  ${acct.name}: $${acct.balances.current} (${acct.type})`);
  }

  console.log('\n--- Transactions Sync (first page) ---');
  const result = await transactionsSync(accessToken, null);
  console.log(`  Added: ${result.added.length}`);
  if (result.added.length > 0) {
    console.log('  Sample:', JSON.stringify(result.added[0], null, 2));
  }

  console.log('\nPlaid connection test successful!');
})();
