const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

async function runMigrations() {
  const conn = await db.getConnection();
  console.log('🔄 Checking database migrations...');

  try {
    // 1. Ensure migrations table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Fetch already executed migrations
    const [rows] = await conn.query('SELECT migration_name FROM schema_migrations');
    const executedSet = new Set((rows || []).map((r) => r.migration_name));

    // 3. Read migration files sorted
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('⚠️ No migrations directory found.');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (executedSet.has(file)) {
        continue;
      }

      console.log(`🚀 Executing migration: ${file}`);
      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // Split statements by semicolon (ignoring comments)
      const statements = sqlContent
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      await conn.beginTransaction();
      try {
        for (const statement of statements) {
          await conn.query(statement);
        }

        await conn.query('INSERT INTO schema_migrations (migration_name) VALUES (?)', [file]);
        await conn.commit();
        count++;
        console.log(`✅ Completed: ${file}`);
      } catch (err) {
        await conn.rollback();
        console.error(`❌ Migration failed at ${file}:`, err.message);
        throw err;
      }
    }

    if (count === 0) {
      console.log('✨ All migrations are up to date. No pending migrations.');
    } else {
      console.log(`🎉 Successfully applied ${count} migration(s).`);
    }
  } catch (error) {
    console.error('Migration runner error:', error);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
}

runMigrations();
