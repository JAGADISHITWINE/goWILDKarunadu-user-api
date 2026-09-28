const mysql = require('mysql2');
require('dotenv').config();

const hasUri = Boolean(process.env.MYSQL_URL);
const dbTimeZone = process.env.DB_TIMEZONE_OFFSET || '+05:30';
const dbConfig = hasUri
  ? { uri: process.env.MYSQL_URL }
  : {
      host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
      user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
      password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
      database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'goWILDKarunadu',
      port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
      connectTimeout: process.env.DB_CONNECT_TIMEOUT ? Number(process.env.DB_CONNECT_TIMEOUT) : 10000,
    };

const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: dbTimeZone,
  dateStrings: true,
});

pool.on('connection', (connection) => {
  connection.query('SET time_zone = ?', [dbTimeZone]);
});

const db = pool.promise();

(async () => {
  try {
    const conn = await db.getConnection();

    try {
      const [captainCols] = await conn.query("SHOW COLUMNS FROM trek_batches LIKE 'captain_name'");
      if (!Array.isArray(captainCols) || captainCols.length === 0) {
        await conn.query(`
          ALTER TABLE trek_batches
          ADD COLUMN captain_name VARCHAR(150) NULL,
          ADD COLUMN captain_phone VARCHAR(50) NULL,
          ADD COLUMN captain_email VARCHAR(150) NULL
        `);
      }
    } catch (e) {
    }

    conn.release();
  } catch (err) {
  }
})();

module.exports = db;
