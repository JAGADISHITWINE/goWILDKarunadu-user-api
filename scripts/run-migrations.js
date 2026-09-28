const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

async function run() {
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
      const conn = await db.getConnection();
      await conn.query(sql);
      conn.release();
    }
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

run();
