const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');
const log = require('./logger');

const envMap = {
  sandbox: PlaidEnvironments.sandbox,
  development: PlaidEnvironments.development,
  production: PlaidEnvironments.production,
};

if (!process.env.PLAID_CLIENT_ID) {
  log.fatal('PLAID_CLIENT_ID environment variable is required. Set it in your .env file.');
  process.exit(1);
}
if (!process.env.PLAID_SECRET) {
  log.fatal('PLAID_SECRET environment variable is required. Set it in your .env file.');
  process.exit(1);
}

const plaidEnv = (process.env.PLAID_ENV || 'sandbox').toLowerCase();
if (!envMap[plaidEnv]) {
  log.fatal({ plaidEnv }, 'PLAID_ENV must be one of: sandbox, development, production');
  process.exit(1);
}

const configuration = new Configuration({
  basePath: envMap[plaidEnv],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

module.exports = new PlaidApi(configuration);
