const db = require('../config/db');
const { createUuid } = require('../utils/id');

async function ensureCommunitySchema() {
  // Schema is managed by centralized migrations
  return;
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
