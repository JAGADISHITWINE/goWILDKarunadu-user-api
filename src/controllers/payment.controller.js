const Razorpay = require('razorpay');
const crypto = require('crypto');
const db = require('../config/db');
const { createUuid } = require('../utils/id');

function getRzpInstance() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) return null;
  return new Razorpay({ key_id, key_secret });
}

async function ensurePaymentsTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS payments (
      id CHAR(36) NOT NULL,
      order_id VARCHAR(128) DEFAULT NULL,
      payment_id VARCHAR(128) DEFAULT NULL,
      receipt VARCHAR(128) DEFAULT NULL,
      booking_id CHAR(36) DEFAULT NULL,
      user_id CHAR(36) DEFAULT NULL,
      amount BIGINT DEFAULT 0,
      currency VARCHAR(8) DEFAULT 'INR',
      status VARCHAR(32) DEFAULT 'created',
      meta JSON DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_order_id (order_id),
      KEY idx_booking_id (booking_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// POST /api/auth/payments/create-order
async function createOrder(req, res) {
  try {
    const { amount, currency = 'INR', receipt, bookingId, userId } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

    const rzp = getRzpInstance();
    if (!rzp) return res.status(500).json({ success: false, message: 'Payment gateway not configured' });

    const amountPaise = Math.round(Number(amount) * 100);
    const rzpOrder = await rzp.orders.create({ amount: amountPaise, currency, receipt: receipt || `rcpt_${Date.now()}`, payment_capture: 1 });

    const conn = await db.getConnection();
    await ensurePaymentsTable(conn);
    const id = createUuid();
    await conn.execute(
      `INSERT INTO payments (id, order_id, receipt, booking_id, user_id, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, rzpOrder.id, rzpOrder.receipt, bookingId || null, userId || null, amountPaise, currency, 'created']
    );
    conn.release();

    return res.json({ success: true, data: { order: rzpOrder } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create order', error: error.message });
  }
}

// POST /api/auth/payments/verify
async function verifyPayment(req, res) {
  try {
    const { order_id, payment_id, signature, bookingId } = req.body;
    if (!order_id || !payment_id || !signature) return res.status(400).json({ success: false, message: 'Missing parameters' });

    const secret = process.env.RAZORPAY_KEY_SECRET;
    const expected = crypto.createHmac('sha256', secret).update(`${order_id}|${payment_id}`).digest('hex');

    if (expected !== signature) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const conn = await db.getConnection();
    await ensurePaymentsTable(conn);
    await conn.execute(`UPDATE payments SET payment_id = ?, status = 'paid', updated_at = NOW() WHERE order_id = ?`, [payment_id, order_id]);

    // Optionally update booking status (if bookingId provided)
    if (bookingId) {
      await conn.execute(`UPDATE bookings SET booking_status = 'confirmed', payment_status = 'paid' WHERE id = ?`, [bookingId]);
    }

    // Also record a admin-friendly payment row (payment_method, transaction_id, amount in rupees)
    try {
      const [rows] = await conn.execute(`SELECT id, amount, currency FROM payments WHERE order_id = ? LIMIT 1`, [order_id]);
      let amountRupees = null;
      if (Array.isArray(rows) && rows.length > 0) {
        const existing = rows[0];
        // if amount stored in paise (number > 1000), convert to rupees
        if (existing.amount && Number(existing.amount) > 1000) {
          amountRupees = Number(existing.amount) / 100;
        } else if (existing.amount) {
          amountRupees = Number(existing.amount);
        }
      }
      // Upsert admin fields
      await conn.execute(
        `UPDATE payments SET payment_method = ?, transaction_id = ?, amount = IFNULL(?, amount), status = 'success' WHERE order_id = ?`,
        ['razorpay', payment_id, amountRupees, order_id]
      );
    } catch (err) {
    }

    conn.release();

    return res.json({ success: true, message: 'Payment verified' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to verify payment', error: error.message });
  }
}

const emailService = require('../service/emailService');

// POST /api/auth/payments/webhook
async function webhookHandler(req, res) {
  let conn;
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    const payload = req.rawBody || JSON.stringify(req.body || {});
    const expected = crypto.createHmac('sha256', secret || '').update(payload).digest('hex');

    if (!signature || expected !== signature) {
      return res.status(400).send('Invalid signature');
    }

    conn = await db.getConnection();
    await ensurePaymentsTable(conn);

    // Idempotency: compute payload hash and skip if already processed
    const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
    try {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS webhook_events (
          id CHAR(36) NOT NULL,
          event_id VARCHAR(255) NOT NULL,
          payload_hash VARCHAR(128) NOT NULL,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_event_id (event_id),
          UNIQUE KEY uq_payload_hash (payload_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      const eventId = (req.body && req.body.id) || (req.headers['x-razorpay-event-id'] || null);
      if (eventId) {
        const [existing] = await conn.execute(`SELECT id FROM webhook_events WHERE event_id = ? LIMIT 1`, [eventId]);
        if (Array.isArray(existing) && existing.length > 0) {
          return res.json({ status: 'ok', reason: 'duplicate' });
        }
      }

      const [existingHash] = await conn.execute(`SELECT id FROM webhook_events WHERE payload_hash = ? LIMIT 1`, [payloadHash]);
      if (Array.isArray(existingHash) && existingHash.length > 0) {
        return res.json({ status: 'ok', reason: 'duplicate' });
      }

      await conn.execute(
        `INSERT INTO webhook_events (id, event_id, payload_hash) VALUES (?, ?, ?)`,
        [crypto.randomUUID ? crypto.randomUUID() : createUuid(), eventId || `evt_${Date.now()}`, payloadHash]
      );
    } catch (err) {
      // Continue processing if idempotency table check fails
    }

    const event = req.body || {};
    const eventType = String(event.event || '');

    // Handle payment captured or order paid events
    if ((eventType === 'payment.captured' || eventType === 'order.paid') && event.payload) {
      const p = event.payload.payment?.entity || event.payload.order?.entity || {};
      const orderId = p.order_id || p.id;
      const paymentId = p.id;
      const amountRupees = p.amount ? Number(p.amount) / 100 : null;

      if (orderId) {
        await conn.execute(
          `UPDATE payments SET payment_id = IFNULL(?, payment_id), status = 'paid', payment_method = 'razorpay', transaction_id = IFNULL(?, transaction_id), amount = IFNULL(?, amount), updated_at = NOW() WHERE order_id = ?`,
          [paymentId, paymentId, amountRupees, orderId]
        ).catch(() => {});
      }

      // Identify booking
      let bookingId = p.notes?.booking_id || p.notes?.bookingId || null;
      if (!bookingId && orderId) {
        const [rows] = await conn.execute(`SELECT booking_id FROM payments WHERE order_id = ? LIMIT 1`, [orderId]);
        if (Array.isArray(rows) && rows.length > 0 && rows[0].booking_id) {
          bookingId = rows[0].booking_id;
        }
      }

      if (bookingId) {
        // Mark booking confirmed and paid
        await conn.execute(
          `UPDATE bookings 
           SET payment_status = 'paid', 
               booking_status = 'confirmed',
               amount_paid = IFNULL(?, total_amount),
               balance_due = 0
           WHERE id = ?`,
          [amountRupees, bookingId]
        );

        // Fetch booking to send confirmation email if not sent yet
        const [bkRows] = await conn.execute(
          `SELECT b.*, tb.start_date, tb.end_date, tb.duration, t.name as trek_name, t.location
           FROM bookings b
           LEFT JOIN trek_batches tb ON b.batch_id = tb.id
           LEFT JOIN treks t ON b.trek_id = t.id
           WHERE b.id = ? LIMIT 1`,
          [bookingId]
        );

        if (bkRows.length > 0 && !bkRows[0].confirmation_sent) {
          const bookingData = bkRows[0];
          const [pRows] = await conn.execute(
            `SELECT name, age, gender, id_type, id_number, phone, medical_info, is_primary_contact 
             FROM booking_participants WHERE booking_id = ?`,
            [bookingId]
          );
          bookingData.participants_details = pRows;

          emailService.sendBookingConfirmation(bookingData)
            .then(() => {
              conn.execute(`UPDATE bookings SET confirmation_sent = 1 WHERE id = ?`, [bookingId]).catch(() => {});
            })
            .catch(() => {});
        }
      }
    }

    if (eventType === 'payment.failed' && event.payload?.payment?.entity) {
      const p = event.payload.payment.entity;
      await conn.execute(`UPDATE payments SET status = 'failed', updated_at = NOW() WHERE order_id = ?`, [p.order_id]);
    }

    return res.json({ status: 'ok' });
  } catch (error) {
    return res.status(500).send('error');
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  createOrder,
  verifyPayment,
  webhookHandler,
};
