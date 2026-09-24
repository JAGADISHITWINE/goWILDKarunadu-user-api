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
    console.error('Create order error:', error);
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
      console.warn('Failed to mark admin-friendly payment fields:', err?.message || err);
    }

    conn.release();

    return res.json({ success: true, message: 'Payment verified' });
  } catch (error) {
    console.error('Verify payment error:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify payment', error: error.message });
  }
}

// POST /api/auth/payments/webhook
async function webhookHandler(req, res) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    const payload = req.rawBody || JSON.stringify(req.body || {});
        const expected = crypto.createHmac('sha256', secret || '').update(payload).digest('hex');

        if (!signature || expected !== signature) {
          console.warn('Invalid webhook signature');
          return res.status(400).send('Invalid signature');
        }

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
              // already processed
              conn.release();
              return res.json({ status: 'ok', reason: 'duplicate' });
            }
          }

          const [existingHash] = await conn.execute(`SELECT id FROM webhook_events WHERE payload_hash = ? LIMIT 1`, [payloadHash]);
          if (Array.isArray(existingHash) && existingHash.length > 0) {
            conn.release();
            return res.json({ status: 'ok', reason: 'duplicate' });
          }

          // Insert a record to mark this payload as processed (best-effort)
          await conn.execute(`INSERT INTO webhook_events (id, event_id, payload_hash) VALUES (?, ?, ?)`, [crypto.randomUUID(), eventId || null, payloadHash]);
        } catch (err) {
          console.warn('Webhook idempotency check failed:', err?.message || err);
          // continue processing — do not block on idempotency failure
        }

    const event = req.body;
    const conn = await db.getConnection();
    await ensurePaymentsTable(conn);

    // Handle payment captured / failed events
      if (event.event === 'payment.captured' && event.payload?.payment?.entity) {
      const p = event.payload.payment.entity;
      await conn.execute(`UPDATE payments SET payment_id = ?, status = 'paid', updated_at = NOW() WHERE order_id = ?`, [p.id, p.order_id]);
      // update admin-friendly fields
      try {
        const amountR = p.amount ? Number(p.amount) / 100 : null;
        await conn.execute(`UPDATE payments SET payment_method = ?, transaction_id = ?, amount = IFNULL(?, amount) WHERE order_id = ?`, ['razorpay', p.id, amountR, p.order_id]);
      } catch (err) {
        console.warn('Webhook: failed to set admin-friendly fields', err?.message || err);
      }
      // Try to mark related booking as paid if payments row links to a booking
      try {
        const [rows] = await conn.execute(`SELECT booking_id FROM payments WHERE order_id = ? LIMIT 1`, [p.order_id]);
        if (Array.isArray(rows) && rows.length > 0 && rows[0].booking_id) {
          const bookingId = rows[0].booking_id;
          await conn.execute(`UPDATE bookings SET payment_status = 'paid', booking_status = 'confirmed' WHERE id = ?`, [bookingId]);
        }
      } catch (err) {
        console.warn('Webhook: failed to mark booking as paid', err?.message || err);
      }
    }

    if (event.event === 'payment.failed' && event.payload?.payment?.entity) {
      const p = event.payload.payment.entity;
      await conn.execute(`UPDATE payments SET status = 'failed', updated_at = NOW() WHERE order_id = ?`, [p.order_id]);
    }

    conn.release();
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).send('error');
  }
}

module.exports = {
  createOrder,
  verifyPayment,
  webhookHandler,
};
