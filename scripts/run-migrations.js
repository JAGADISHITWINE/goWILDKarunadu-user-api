const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

async function run() {
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
      console.log('Running', f);
      const conn = await db.getConnection();
      await conn.query(sql);
      conn.release();
    }
    console.log('Migrations complete');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

run();
