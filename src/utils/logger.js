const fs = require('fs');
const path = require('path');

const LOGS_DIR = process.env.LOG_DIR || path.join(__dirname, '../../logs');
if (!fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (err) {
    // Fallback if logs dir cannot be created
  }
}

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  let metaStr = '';
  if (meta instanceof Error) {
    metaStr = `\n${meta.stack || meta.message}`;
  } else if (meta && Object.keys(meta).length > 0) {
    try {
      metaStr = ` ${JSON.stringify(meta)}`;
    } catch {
      metaStr = '';
    }
  }
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
}

function writeToFile(filename, line) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const targetFile = path.join(LOGS_DIR, `${today}-${filename}`);
    fs.appendFileSync(targetFile, line, 'utf8');
  } catch (err) {
    // non-fatal
  }
}

const logger = {
  info(message, meta = {}) {
    const line = formatMessage('info', message, meta);
    process.stdout.write(line);
    writeToFile('combined.log', line);
  },

  warn(message, meta = {}) {
    const line = formatMessage('warn', message, meta);
    process.stdout.write(line);
    writeToFile('combined.log', line);
  },

  error(message, meta = {}) {
    const line = formatMessage('error', message, meta);
    process.stderr.write(line);
    writeToFile('combined.log', line);
    writeToFile('error.log', line);
  },

  http(req, res, responseTimeMs) {
    const line = formatMessage('http', `${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${responseTimeMs}ms`);
    writeToFile('access.log', line);
  }
};

module.exports = logger;
