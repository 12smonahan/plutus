const cron = require('node-cron');
const { syncAll } = require('./sync');
const log = require('./logger');

let task = null;

function start() {
  const schedule = process.env.SYNC_CRON || '0 5 * * *';

  if (!cron.validate(schedule)) {
    log.error({ schedule }, 'Invalid cron expression');
    return;
  }

  task = cron.schedule(schedule, async () => {
    log.info('Scheduled sync starting');
    try {
      await syncAll();
    } catch (err) {
      if (err.code === 'SYNC_IN_PROGRESS') {
        log.info('Scheduled sync skipped: already in progress');
      } else {
        log.error({ err }, 'Scheduled sync failed');
      }
    }
  });

  log.info({ schedule }, 'Scheduler registered');
}

function stop() {
  if (task) {
    task.stop();
    task = null;
  }
}

module.exports = { start, stop };
