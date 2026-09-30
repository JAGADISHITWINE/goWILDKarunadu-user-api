const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../src/config/db');

async function runStandardization() {
  console.log('--- Starting Database Clean-up & Collation Standardization ---');
  let conn;
  try {
    conn = await db.getConnection();

    // 1. Fetch current database name
    const [[{ dbName }]] = await conn.query('SELECT DATABASE() as dbName');
    console.log(`Connected to database: ${dbName}`);

    // 2. Set database default charset and collation
    await conn.query(`ALTER DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    console.log(`✓ Database default character set updated to utf8mb4 / utf8mb4_0900_ai_ci`);

    // 3. Ensure captain columns exist on trek_batches
    const [captainCols] = await conn.query("SHOW COLUMNS FROM trek_batches LIKE 'captain_name'");
    if (!Array.isArray(captainCols) || captainCols.length === 0) {
      console.log('Adding missing captain columns to trek_batches...');
      await conn.query(`
        ALTER TABLE trek_batches
        ADD COLUMN captain_name VARCHAR(150) NULL,
        ADD COLUMN captain_phone VARCHAR(50) NULL,
        ADD COLUMN captain_email VARCHAR(150) NULL
      `);
    }

    // 4. Fetch all tables
    const [tables] = await conn.query(
      `SELECT table_name, table_collation 
       FROM information_schema.tables 
       WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
      [dbName]
    );

    console.log(`Found ${tables.length} tables in database.`);

    // 5. Convert each table to utf8mb4 / utf8mb4_0900_ai_ci
    // Disable foreign key checks during collation migration
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    let convertedCount = 0;
    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      const currentCollation = table.TABLE_COLLATION;

      if (currentCollation !== 'utf8mb4_0900_ai_ci') {
        process.stdout.write(`Converting ${tableName} (${currentCollation} -> utf8mb4_0900_ai_ci)... `);
        try {
          await conn.query(`ALTER TABLE \`${tableName}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
          console.log('✓');
          convertedCount++;
        } catch (err) {
          console.log(`Warning on ${tableName}: ${err.message}`);
          // Fallback: alter table default collation without convert
          try {
            await conn.query(`ALTER TABLE \`${tableName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
          } catch (e2) {}
        }
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log(`\nMigration completed! Converted ${convertedCount} tables.`);

    // 6. Verify final collation status
    const [finalStatus] = await conn.query(
      `SELECT table_collation, COUNT(*) as count 
       FROM information_schema.tables 
       WHERE table_schema = ? AND table_type = 'BASE TABLE'
       GROUP BY table_collation`,
      [dbName]
    );

    console.log('Final Database Collations:');
    console.table(finalStatus);

  } catch (error) {
    console.error('Standardization failed:', error);
    process.exitCode = 1;
  } finally {
    if (conn) conn.release();
    process.exit();
  }
}

runStandardization();
