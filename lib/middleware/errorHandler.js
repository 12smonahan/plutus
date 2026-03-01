const log = require('../logger');

// Wrap async route handlers so rejected promises are forwarded to Express error middleware
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Central error-handling middleware (must be registered after all routes)
function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  if (status >= 500) {
    log.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  }

  const body = { error: message };
  if (process.env.NODE_ENV !== 'production' && status >= 500) {
    body.detail = err.message;
    body.stack = err.stack;
  }

  res.status(status).json(body);
}

module.exports = { asyncHandler, errorHandler };
