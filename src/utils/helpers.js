// Generate slug from string
function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

const DEFAULT_TIME_ZONE =
  process.env.APP_TIMEZONE ||
  process.env.DB_TIMEZONE ||
  'Asia/Kolkata';

// Format date for MySQL
function formatDateForMySQL(date, timeZone = DEFAULT_TIME_ZONE) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type) => parts.find((part) => part.type === type)?.value || '00';

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function formatDateOnlyForMySQL(date, timeZone = DEFAULT_TIME_ZONE) {
  const formatted = formatDateForMySQL(date, timeZone);
  return formatted ? formatted.slice(0, 10) : null;
}

module.exports = {
  generateSlug,
  formatDateForMySQL,
  formatDateOnlyForMySQL
};
