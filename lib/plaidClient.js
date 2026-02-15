const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');

const envMap = {
  sandbox: PlaidEnvironments.sandbox,
  development: PlaidEnvironments.development,
  production: PlaidEnvironments.production,
};

const plaidEnv = (process.env.PLAID_ENV || 'sandbox').toLowerCase();

const configuration = new Configuration({
  basePath: envMap[plaidEnv] || PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

module.exports = new PlaidApi(configuration);
