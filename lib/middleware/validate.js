const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function validDate(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

function validMonth(value) {
  if (!MONTH_RE.test(value)) return false;
  const [y, m] = value.split('-').map(Number);
  return m >= 1 && m <= 12 && y >= 1900 && y <= 2200;
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

function validNumber(value) {
  return !isNaN(Number(value)) && value !== '';
}

// Returns an error message string or null if valid
function validateQuery(query, rules) {
  for (const [field, check, msg] of rules) {
    const val = query[field];
    if (val !== undefined && val !== '' && !check(val)) {
      return `Invalid ${field}: ${msg}`;
    }
  }
  return null;
}

module.exports = { validDate, validMonth, positiveInt, validNumber, validateQuery };
