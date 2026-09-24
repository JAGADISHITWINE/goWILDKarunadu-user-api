const communityService = require('../service/community.service');

async function listCarpoolsController(req, res) {
  try {
    const rides = await communityService.listCarpools({
      departureCity: req.query.departureCity,
      trekName: req.query.trekName,
    });
    return res.status(200).json({
      success: true,
      data: rides,
    });
  } catch (error) {
    console.error('List carpools error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch carpools',
      error: error.message,
    });
  }
}

async function createCarpoolController(req, res) {
  try {
    const raw = req.body || {};
    const rideData = {
      userId: raw.userId || raw.user_id,
      userName: raw.userName || raw.user_name || 'Solo Trekker',
      userPhone: raw.userPhone || raw.user_phone || '+91 98860 12345',
      trekId: raw.trekId || raw.trek_id,
      trekName: raw.trekName || raw.trek_name || 'Brahmagiri Monsoon Trek',
      departureCity: raw.departureCity || raw.departure_city || 'Bengaluru',
      departureLocation: raw.departureLocation || raw.departure_location || 'Silk Board & Marathahalli',
      departureDatetime: raw.departureDatetime || raw.departure_datetime || new Date(),
      availableSeats: Number(raw.availableSeats || raw.available_seats) || 3,
      pricePerSeat: Number(raw.pricePerSeat || raw.price_per_seat) || 0,
      vehicleModel: raw.vehicleModel || raw.vehicle_model || 'Car / SUV',
      notes: raw.notes || '',
    };

    const result = await communityService.createCarpoolOffer(rideData);
    return res.status(201).json({
      success: true,
      message: 'Carpool ride published successfully',
      data: result,
    });
  } catch (error) {
    console.error('Create carpool error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to publish carpool',
      error: error.message,
    });
  }
}

module.exports = {
  listCarpoolsController,
  createCarpoolController,
};
