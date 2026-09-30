const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

async function run() {
  const isStatusOnly = process.argv.includes('status') || process.argv.includes('--status');
  let conn;

  try {
    conn = await db.getConnection();
    console.log('🔄 Checking database migrations...');

    // 1. Ensure migrations table exists with standard collation
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    // 2. Fetch already executed migrations
    const [rows] = await conn.query('SELECT migration_name, executed_at FROM schema_migrations ORDER BY id ASC');
    const executedMap = new Map((rows || []).map((r) => [r.migration_name, r.executed_at]));

    // 3. Read migration files sorted
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('⚠️ No migrations directory found.');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql') || file.endsWith('.js'))
      .sort();

    if (isStatusOnly) {
      console.log('\n📋 Migration Status:');
      console.log('------------------------------------------------------------');
      for (const file of files) {
        if (executedMap.has(file)) {
          console.log(`  [APPLIED] ${file} (executed at: ${executedMap.get(file)})`);
        } else {
          console.log(`  [PENDING] ${file}`);
        }
      }
      console.log('------------------------------------------------------------\n');
      return;
    }

    let count = 0;
    for (const file of files) {
      if (executedMap.has(file)) {
        continue;
      }

      console.log(`🚀 Executing migration: ${file}`);
      const filePath = path.join(migrationsDir, file);

      await conn.beginTransaction();
      try {
        if (file.endsWith('.sql')) {
          const sqlContent = fs.readFileSync(filePath, 'utf8');
          const statements = sqlContent
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && !s.startsWith('--'));

          for (const statement of statements) {
            try {
              await conn.query(statement);
            } catch (stmtErr) {
              // Ignore safe duplicate column / key / table warnings for idempotency
              if (
                ['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR'].includes(stmtErr?.code) ||
                stmtErr?.errno === 1060 ||
                stmtErr?.errno === 1061 ||
                stmtErr?.errno === 1050
              ) {
                console.log(`  ℹ️ Idempotent skip: ${stmtErr.message}`);
                continue;
              }
              throw stmtErr;
            }
          }
        } else if (file.endsWith('.js')) {
          const migrationModule = require(filePath);
          if (typeof migrationModule.up === 'function') {
            await migrationModule.up(conn);
          } else {
            throw new Error(`Migration ${file} must export an async 'up(conn)' function`);
          }
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
    if (conn) conn.release();
    process.exit(0);
  }
}

run();
