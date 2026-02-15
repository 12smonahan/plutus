const cron = require('node-cron');
const { syncAll } = require('./sync');

function start() {
  const schedule = process.env.SYNC_CRON || '0 5 * * *';

  if (!cron.validate(schedule)) {
    console.error(`Invalid cron expression: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    console.log(`[${new Date().toISOString()}] Scheduled sync starting...`);
    try {
      await syncAll();
    } catch (err) {
      console.error('Scheduled sync failed:', err.message);
    }
  });

  console.log(`Scheduler registered: "${schedule}"`);
}

module.exports = { start };
