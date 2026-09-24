const db = require('../config/db');
const { createUuid } = require('../utils/id');

async function ensureCommunitySchema(conn) {
  const connection = conn || (await db.getConnection());
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS carpool_rides (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        user_name VARCHAR(100) NOT NULL,
        user_phone VARCHAR(20) NOT NULL,
        trek_id CHAR(36) NULL,
        trek_name VARCHAR(150) NOT NULL,
        departure_city VARCHAR(100) NOT NULL DEFAULT 'Bengaluru',
        departure_location VARCHAR(200) NOT NULL,
        departure_datetime DATETIME NOT NULL,
        available_seats INT NOT NULL DEFAULT 3,
        price_per_seat DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        vehicle_model VARCHAR(100) NULL,
        notes TEXT NULL,
        status ENUM('active', 'full', 'completed', 'cancelled') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_trek (trek_id),
        KEY idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Insert sample seed carpools if table empty
    const [count] = await connection.query('SELECT COUNT(*) as c FROM carpool_rides');
    if (count[0]?.c === 0) {
      await connection.query(`
        INSERT INTO carpool_rides (id, user_id, user_name, user_phone, trek_name, departure_city, departure_location, departure_datetime, available_seats, price_per_seat, vehicle_model, notes)
        VALUES 
        (UUID(), 'seed-user-1', 'Aditya Sharma', '+91 98860 12345', 'Kudremukha Peak Expedition', 'Bengaluru', 'Silk Board & Marathahalli', DATE_ADD(NOW(), INTERVAL 3 DAY), 3, 650.00, 'Hyundai Creta', 'Leaving Friday 10:30 PM. Rooftop carrier available for backpacks.'),
        (UUID(), 'seed-user-2', 'Pooja Hegde', '+91 97410 67890', 'Kumara Parvatha Trek', 'Bengaluru', 'Yeshwanthpur Metro Station', DATE_ADD(NOW(), INTERVAL 5 DAY), 2, 800.00, 'Tata Nexon EV', 'Early morning departure 5:00 AM. Music and coffee lover!')
      `);
    }
  } catch (err) {
    console.error('Community schema ensure error:', err.message);
  } finally {
    if (!conn) connection.release();
  }
}

async function listCarpools(filter = {}) {
  await ensureCommunitySchema();
  let query = 'SELECT * FROM carpool_rides WHERE status = "active" AND departure_datetime >= NOW()';
  const params = [];

  if (filter.departureCity) {
    query += ' AND departure_city LIKE ?';
    params.push(`%${filter.departureCity}%`);
  }

  if (filter.trekName) {
    query += ' AND trek_name LIKE ?';
    params.push(`%${filter.trekName}%`);
  }

  query += ' ORDER BY departure_datetime ASC LIMIT 30';

  const [rows] = await db.query(query, params);
  return rows.map(r => ({
    ...r,
    available_seats: Number(r.available_seats),
    price_per_seat: Number(r.price_per_seat),
  }));
}

async function createCarpoolOffer(rideData) {
  await ensureCommunitySchema();
  const id = createUuid();

  const query = `
    INSERT INTO carpool_rides (
      id, user_id, user_name, user_phone, trek_id, trek_name, departure_city,
      departure_location, departure_datetime, available_seats, price_per_seat, vehicle_model, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await db.query(query, [
    id,
    rideData.userId || createUuid(),
    rideData.userName || 'Trekker',
    rideData.userPhone || '',
    rideData.trekId || null,
    rideData.trekName || 'Western Ghats Trek',
    rideData.departureCity || 'Bengaluru',
    rideData.departureLocation || 'Bangalore City',
    rideData.departureDatetime || new Date(),
    Number(rideData.availableSeats) || 3,
    Number(rideData.pricePerSeat) || 0,
    rideData.vehicleModel || 'Car',
    rideData.notes || '',
  ]);

  return { success: true, id };
}

module.exports = {
  ensureCommunitySchema,
  listCarpools,
  createCarpoolOffer,
};
