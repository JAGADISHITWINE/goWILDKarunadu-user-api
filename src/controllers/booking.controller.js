const createBooking = require("../models/booking");
const db = require("../config/db");
const { encrypt, decrypt } = require("../service/cryptoHelper");
const { encodePublicRef } = require("../service/publicRef");
const couponService = require("../service/coupon.service");
const PDFDocument = require('pdfkit');
const path = require('path');
const emailService = require("../service/emailService"); // Email service
const referralService = require("../service/referral.service");

async function ensureTrekRatingsTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS trek_ratings (
      id CHAR(36) COLLATE utf8mb4_0900_ai_ci NOT NULL,
      booking_id CHAR(36) COLLATE utf8mb4_0900_ai_ci NOT NULL,
      trek_id CHAR(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      user_id CHAR(36) COLLATE utf8mb4_0900_ai_ci NOT NULL,
      rating TINYINT NOT NULL,
      review TEXT,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_booking_rating (booking_id),
      KEY idx_trek_id (trek_id),
      KEY idx_user_id (user_id),
      CONSTRAINT fk_trek_ratings_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      CONSTRAINT fk_trek_ratings_trek FOREIGN KEY (trek_id) REFERENCES treks(id) ON DELETE CASCADE,
      CONSTRAINT fk_trek_ratings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function normalizeCouponCode(code = "") {
  return String(code || "").trim().toUpperCase();
}

function isExpectedCreateBookingMessage(message = "") {
  const text = String(message || "");
  return [
    "active booking for this trek",
    "multiple simultaneous bookings",
    "active booking for this trek in this month",
    "complete or cancel the current batch",
    "insufficient available slots",
    "invalid coupon code",
    "coupon is not active yet",
    "coupon has expired",
    "coupon minimum requirement",
    "coupon usage limit reached",
    "already used this coupon",
  ].some((phrase) => text.toLowerCase().includes(phrase));
}

async function createBookingController(req, res) {
  try {
    const bookingData = decrypt(req.body.encryptedPayload);
    const result = await createBooking.createBooking(bookingData);
    const encryptedResponse = encrypt(result);

    return res.status(200).json({
      success: true,
      message: "Booking created successfully",
      data: encryptedResponse,
    });
  } catch (error) {
    if (!isExpectedCreateBookingMessage(error?.message)) {
      console.error("Error creating booking:", error);
    }

    return res.status(200).json({
      success: false,
      message: error.message || "Failed to create booking",
    });
  }
}

async function getMyBookingsById(req, res) {
  const conn = await db.getConnection();
  const userId = String(req.params.id || '').trim();
  
  try {
    await ensureTrekRatingsTable(conn);

    const [bookings] = await conn.execute(
      `
        SELECT 
          b.*,
          t.name as trek_name,
          t.location,
          t.cover_image,
          tr.rating AS user_rating,
          tr.review AS user_review,
          tr.admin_reply AS admin_reply,
          tr.replied_at AS admin_replied_at,
          tr.updated_at AS rated_at,
          tb.start_date,
          tb.end_date,
          tb.duration,
          DATEDIFF(tb.start_date, NOW()) as days_until_trek
        FROM bookings b
        INNER JOIN trek_batches tb ON b.batch_id COLLATE utf8mb4_unicode_ci = tb.id
        INNER JOIN treks t ON tb.trek_id = t.id
        LEFT JOIN trek_ratings tr
          ON tr.booking_id = b.id
         AND tr.user_id = b.user_id
        WHERE b.user_id = ?
        ORDER BY tb.start_date DESC
      `,
      [userId],
    );

    // Get add-ons and participants for each booking
    for (let booking of bookings) {
      // Get add-ons
      const [addons] = await conn.execute(
        `
          SELECT addon_name, quantity, unit_price, total_price
          FROM booking_addons
          WHERE booking_id = ?
        `,
        [booking.id],
      );

      // Get participants
      const [participants] = await conn.query(
        `
          SELECT 
            id,
            name,
            age,
            gender,
            COALESCE(govt_id_type, id_type) AS id_type,
            COALESCE(govt_id_number, id_number) AS id_number,
            phone,
            blood_group,
            dietary_preference,
            medical_condition,
            COALESCE(medical_condition, medical_info) AS medical_info,
            is_primary_contact
          FROM booking_participants
          WHERE booking_id = ?
          ORDER BY is_primary_contact DESC, id ASC
        `,
        [booking.id],
      ).catch(async () => {
        return await conn.execute(
          `SELECT id, name, age, gender, id_type, id_number, phone, medical_info, is_primary_contact FROM booking_participants WHERE booking_id = ? ORDER BY is_primary_contact DESC, id ASC`,
          [booking.id]
        );
      });

      booking.addons = addons;
      booking.participants_details = participants;
      booking.public_ref = encodePublicRef("batch", booking.batch_id);
      booking.can_cancel =
        booking.days_until_trek >= 7 &&
        (booking.booking_status === "pending" ||
          booking.booking_status === "confirmed");
    }

    conn.release();

    const response = {
      count: bookings.length,
      bookings: bookings,
    };

    const encryptedResponse = encrypt(response);

    return res.json({
      success: true,
      data: encryptedResponse,
    });
  } catch (error) {
    conn.release();
    console.error("Get user bookings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
}

async function getReceiptById(req, res) {
  let conn;
  
  try {
    conn = await db.getConnection();
    await referralService.ensureReferralSchema();
    
    const userId = req.params.userId;
    const bookingId = req.params.bookingId;

    const [bookings] = await conn.execute(`
      SELECT 
        b.*,
        t.name as trek_name,
        t.location,
        tb.start_date,
        tb.end_date,
        tb.duration,
        u.full_name as user_name,
        u.email as user_email
      FROM bookings b
        INNER JOIN trek_batches tb ON b.batch_id COLLATE utf8mb4_unicode_ci = tb.id
      INNER JOIN treks t ON tb.trek_id = t.id
      INNER JOIN users u ON b.user_id = u.id
      WHERE b.id = ? AND b.user_id = ?
    `, [bookingId, userId]);

    if (!bookings || bookings.length === 0) {
      if (conn) conn.release();
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const booking = bookings[0];

    // Get add-ons
    const [addons] = await conn.execute(`
      SELECT * FROM booking_addons WHERE booking_id = ?
    `, [bookingId]);

    // Get participants
    const [participants] = await conn.execute(`
      SELECT 
        name,
        age,
        gender,
        id_type,
        id_number,
        phone,
        medical_info,
        is_primary_contact
      FROM booking_participants
      WHERE booking_id = ?
      ORDER BY is_primary_contact DESC, id ASC
    `, [bookingId]);

    // Create PDF
    const doc = new PDFDocument({ 
      margin: 50,
      size: 'A4'
    });

    const fileName = `Receipt_${booking.booking_reference || bookingId}.pdf`;

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Helper function for drawing lines
    const drawLine = (y) => {
      doc.moveTo(50, y).lineTo(545, y).stroke();
    };

    // Add logo and header
    const logoPath = path.join(__dirname, '../assets/logo.png');
    const fs = require('fs');
    
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 40, { width: 80, height: 80 })
        .moveDown(2);
    }

    doc.fontSize(24)
      .fillColor('#2c3e50')
      .text('BOOKING RECEIPT', { align: 'center' });
    
    doc.moveDown(0.5);
    drawLine(doc.y);
    doc.moveDown();

    // Booking Reference
    doc.fontSize(12)
       .fillColor('#34495e')
       .text('Booking Reference: ', { continued: true })
       .fontSize(14)
       .fillColor('#e74c3c')
       .text(booking.booking_reference || 'N/A');
    
    doc.fontSize(10)
       .fillColor('#7f8c8d')
       .text(`Booking Date: ${new Date(booking.created_at).toLocaleDateString()}`, { align: 'right' });
    
    doc.moveDown(1.5);

    // Trek Details Section
    doc.fontSize(16)
       .fillColor('#2c3e50')
       .text('Trek/Tour Details', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(9).fillColor('#34495e');
    const trekDetails = [
      ['Trek/Tour Name:', booking.trek_name || 'N/A'],
      ['Location:', booking.location || 'N/A'],
      ['Start Date:', booking.start_date ? new Date(booking.start_date).toLocaleDateString() : 'N/A'],
      ['End Date:', booking.end_date ? new Date(booking.end_date).toLocaleDateString() : 'N/A'],
      ['Duration:', booking.duration || 'N/A'],
      ['Participants:', booking.participants || 0]
    ];

    trekDetails.forEach(([label, value]) => {
      doc.text(label, 50, doc.y, { continued: true, width: 150 })
         .fillColor('#2c3e50')
         .text(value, { width: 350 });
      doc.moveDown(0.3);
    });

    doc.moveDown(1);

    // Customer Details Section
    doc.fontSize(16)
       .fillColor('#2c3e50')
       .text('Customer Details', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(9).fillColor('#34495e');
    const customerDetails = [
      ['Name:', booking.customer_name || 'N/A'],
      ['Email:', booking.customer_email || 'N/A'],
      ['Phone:', booking.customer_phone || 'N/A'],
      ['Emergency Contact:', booking.emergency_contact || 'N/A']
    ];

    customerDetails.forEach(([label, value]) => {
      doc.text(label, 50, doc.y, { continued: true, width: 150 })
         .fillColor('#2c3e50')
         .text(value, { width: 350 });
      doc.moveDown(0.3);
    });

    doc.moveDown(1.5);

    // PARTICIPANTS SECTION (NEW)
    if (participants && participants.length > 0) {
      doc.fontSize(16)
         .fillColor('#2c3e50')
         .text('Participant Details', { underline: true });
      doc.moveDown(0.5);

      // Table headers
      const tableTop = doc.y;
      const rowHeight = 25;
      const columnWidths = {
        no: 30,
        name: 120,
        age: 35,
        gender: 50,
        idType: 80,
        idNumber: 100
      };

      // Header background
      doc.rect(50, tableTop, 495, rowHeight)
         .fillAndStroke('#667eea', '#667eea');

      // Header text
      doc.fillColor('#ffffff')
         .fontSize(9)
         .text('#', 55, tableTop + 8, { width: columnWidths.no })
         .text('Name', 85, tableTop + 8, { width: columnWidths.name })
         .text('Age', 205, tableTop + 8, { width: columnWidths.age })
         .text('Gender', 240, tableTop + 8, { width: columnWidths.gender })
         .text('ID Type', 290, tableTop + 8, { width: columnWidths.idType })
         .text('ID Number', 370, tableTop + 8, { width: columnWidths.idNumber });

      // Data rows
      let yPos = tableTop + rowHeight;
      participants.forEach((participant, index) => {
        // Alternate row background
        if (index % 2 === 0) {
          doc.rect(50, yPos, 495, rowHeight)
             .fillAndStroke('#f8f9fa', '#e0e0e0');
        } else {
          doc.rect(50, yPos, 495, rowHeight)
             .stroke('#e0e0e0');
        }

        // Row data
        doc.fillColor('#2c3e50')
           .fontSize(8)
           .text(`${index + 1}`, 55, yPos + 8, { width: columnWidths.no });
        
        const nameText = participant.name + (participant.is_primary_contact ? ' ★' : '');
        doc.text(nameText, 85, yPos + 8, { width: columnWidths.name });
        doc.text(participant.age || '-', 205, yPos + 8, { width: columnWidths.age });
        doc.text(participant.gender || '-', 240, yPos + 8, { width: columnWidths.gender });
        doc.text(participant.id_type || '-', 290, yPos + 8, { width: columnWidths.idType });
        doc.text(participant.id_number || '-', 370, yPos + 8, { width: columnWidths.idNumber });

        yPos += rowHeight;

        // Add new page if needed
        if (yPos > 700 && index < participants.length - 1) {
          doc.addPage();
          yPos = 50;
        }
      });

      doc.y = yPos + 10;

      // Medical info summary (if any)
      const participantsWithMedicalInfo = participants.filter(
        p => p.medical_info && p.medical_info.trim() !== ''
      );

      if (participantsWithMedicalInfo.length > 0) {
        doc.moveDown(0.5);
        doc.fontSize(10)
           .fillColor('#ff9800')
           .text('⚕ Medical Information:', { underline: true });
        doc.moveDown(0.3);

        participantsWithMedicalInfo.forEach(p => {
          doc.fontSize(8)
             .fillColor('#34495e')
             .text(`• ${p.name}: `, { continued: true })
             .fillColor('#2c3e50')
             .text(p.medical_info);
          doc.moveDown(0.2);
        });
      }

      doc.fontSize(8)
         .fillColor('#7f8c8d')
         .text('★ = Primary Contact', { align: 'right' });
      
      doc.moveDown(1.5);
    }

    // Payment Details Section
    doc.fontSize(16)
       .fillColor('#2c3e50')
       .text('Payment Summary', { underline: true });
    doc.moveDown(0.5);

    const paymentItems = [
      ['Base Price', `₹${booking.base_price || 0}`],
      ['Add-ons Total', `₹${booking.addons_total || 0}`],
      ['Tax (5%)', `₹${booking.tax_amount || 0}`]
    ];

    doc.fontSize(11).fillColor('#34495e');
    paymentItems.forEach(([label, value]) => {
      doc.text(label, 50, doc.y, { width: 400 });
      doc.text(value, 450, doc.y - 11, { width: 95, align: 'right' });
      doc.moveDown(0.5);
    });

    doc.moveDown(0.3);
    drawLine(doc.y);
    doc.moveDown(0.5);

    // Total Amount
    doc.fontSize(14)
       .fillColor('#2c3e50')
       .text('Total Amount', 50, doc.y, { width: 400, bold: true });
    doc.fillColor('#27ae60')
       .text(`₹${booking.total_amount || 0}`, 450, doc.y - 14, { width: 95, align: 'right' });
    
    doc.moveDown(1);

    // Payment Status
    doc.fontSize(11).fillColor('#34495e');
    doc.text('Amount Paid', 50, doc.y, { width: 400 });
    doc.fillColor('#2c3e50')
       .text(`₹${booking.amount_paid || 0}`, 450, doc.y - 11, { width: 95, align: 'right' });
    doc.moveDown(0.5);

    const balanceDue = booking.balance_due || 0;
    doc.fillColor('#34495e')
       .text('Balance Due', 50, doc.y, { width: 400 });
    doc.fillColor(balanceDue > 0 ? '#e74c3c' : '#27ae60')
       .text(`₹${balanceDue}`, 450, doc.y - 11, { width: 95, align: 'right' });

    doc.moveDown(1.5);

    // Status Section
    doc.fontSize(16)
       .fillColor('#2c3e50')
       .text('Status', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(11);
    const bookingStatus = booking.booking_status ? booking.booking_status.toUpperCase() : 'N/A';
    const paymentStatus = booking.payment_status ? booking.payment_status.toUpperCase() : 'N/A';

    const statusColor = bookingStatus === 'CONFIRMED' ? '#27ae60' : '#e74c3c';
    const paymentColor = paymentStatus === 'PAID' ? '#27ae60' : '#e74c3c';

    doc.fillColor('#34495e')
       .text('Booking Status: ', { continued: true })
       .fillColor(statusColor)
       .text(bookingStatus);
    
    doc.fillColor('#34495e')
       .text('Payment Status: ', { continued: true })
       .fillColor(paymentColor)
       .text(paymentStatus);

    // Add-ons Section
    if (addons && addons.length > 0) {
      doc.moveDown(1.5);
      
      doc.fontSize(16)
         .fillColor('#2c3e50')
         .text('Add-ons', { underline: true });
      doc.moveDown(0.5);

      doc.fontSize(11).fillColor('#34495e');
      
      addons.forEach((addon, index) => {
        doc.text(`${index + 1}. ${addon.addon_name || 'N/A'}`, 50, doc.y, { width: 400 });
        doc.fillColor('#2c3e50')
           .text(`₹${addon.total_price || 0}`, 450, doc.y - 11, { width: 95, align: 'right' });
        doc.moveDown(0.5);
      });
    }

    // Footer
    doc.moveDown(2);
    drawLine(doc.y);
    doc.moveDown(0.5);
    
    const [settingRows] = await conn.query('SELECT setting_key, setting_value FROM settings').catch(() => [[]]);
    const sMap = {};
    for (const r of (settingRows || [])) sMap[r.setting_key] = r.setting_value;
    const rBrandName = sMap.brand_name || 'goWILD Karunadu';
    const rSupportEmail = sMap.support_email || 'info@gowildkarunadu.com';
    const rSupportPhone = sMap.support_phone || '+91 98765 43210';

    doc.fontSize(8)
       .fillColor('#7f8c8d')
       .text(`${rBrandName} | ${rSupportEmail} | ${rSupportPhone}`, { align: 'center' });
    doc.text(`Thank you for choosing ${rBrandName}!`, { align: 'center' });

    // Finalize PDF
    doc.end();

    if (conn) conn.release();

  } catch (error) {
    if (conn) conn.release();
    console.error('Download receipt error:', error);
    console.error('Error stack:', error.stack);
    
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to download receipt',
        error: error.message
      });
    }
  }
}

async function cancelBooking(req, res) {
  let conn;


  try {
    conn = await db.getConnection();
    const cancelBookingData = decrypt(req.body.encryptedPayload);

    const bookingId = String(req.params.bookingId || '').trim();
    const userId = String(cancelBookingData.userId || '').trim();
    const { reason, acceptedTerms } = cancelBookingData;

    // ===============================
    // 1️⃣ BASIC VALIDATION
    // ===============================
    if (!bookingId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID and User ID are required"
      });
    }

    if (!acceptedTerms) {
      return res.status(400).json({
        success: false,
        message: "You must accept cancellation terms"
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required"
      });
    }

    await referralService.ensureReferralSchema();
    await conn.beginTransaction();

    // ===============================
    // 2️⃣ LOCK BOOKING + BATCH
    // ===============================
    const [rows] = await conn.execute(`
      SELECT 
        b.*,
        tb.max_participants,
        tb.start_date,
        DATEDIFF(tb.start_date, NOW()) AS days_until_trek
      FROM bookings b
      INNER JOIN trek_batches tb ON b.batch_id COLLATE utf8mb4_unicode_ci = tb.id
      WHERE b.id = ? AND b.user_id = ?
      FOR UPDATE
    `, [bookingId, userId]);

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const booking = rows[0];

    // ===============================
    // 3️⃣ BUSINESS RULES
    // ===============================
    if (booking.booking_status === "cancelled") {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Booking already cancelled"
      });
    }

    if (booking.days_until_trek < 7) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot cancel within 7 days of trek"
      });
    }

    const participantCount = parseInt(booking.participants || 0);
    if (participantCount <= 0) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid participant count"
      });
    }

    // ===============================
    // 4️⃣ REFUND PERCENTAGE LOGIC
    // ===============================
    let refundPercentage = 0;

    if (booking.days_until_trek >= 30) {
      refundPercentage = 100;
    } else if (booking.days_until_trek >= 15) {
      refundPercentage = 75;
    } else {
      refundPercentage = 50;
    }

    // ===============================
    // 5️⃣ CALCULATE REFUND
    // ===============================
    const baseAmount = parseFloat(booking.subtotal || 0);
    const gstAmount = parseFloat(booking.tax_amount || 0);
    const totalAmount = parseFloat(booking.total_amount || 0);
    const amountPaid = parseFloat(booking.amount_paid || 0);

    const baseRefund = (baseAmount * refundPercentage) / 100;
    const gstRefund = (gstAmount * refundPercentage) / 100;
    const grossRefund = baseRefund + gstRefund;

    // Never refund more than paid
    const finalRefund = Math.min(grossRefund, amountPaid);
    const cancellationFee = totalAmount - finalRefund;

    const refundChannel = String(cancelBookingData.refundChannel || 'Online Gateway Reversal').trim();

    // ===============================
    // 6️⃣ UPDATE BOOKING
    // ===============================
    await conn.execute(`
      UPDATE bookings
      SET 
        booking_status = 'cancelled',
        cancelled_at = NOW(),
        cancellation_reason = ?,
        refund_amount = ?,
        cancellation_fee = ?,
        payment_status = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      reason.trim(),
      finalRefund.toFixed(2),
      cancellationFee.toFixed(2),
      finalRefund > 0 ? "refunded" : "cancelled",
      bookingId
    ]);

    // Record refund payment record if refund > 0
    if (finalRefund > 0) {
      const { createUuid } = require('../utils/id');
      await conn.query(`
        INSERT INTO payments (
          id, booking_id, amount, status, payment_method, transaction_id, created_at
        ) VALUES (?, ?, ?, 'refunded', ?, ?, NOW())
      `, [
        createUuid(),
        bookingId,
        finalRefund,
        refundChannel,
        'REF-' + Date.now(),
      ]).catch(err => {
        console.warn('Could not insert refund payment log:', err?.message);
      });

      // If user selected instant GoWild Wallet refund, credit with 5% extra bonus!
      if (refundChannel.toLowerCase().includes('wallet') || refundChannel.toLowerCase().includes('gowild')) {
        try {
          const walletService = require('../service/wallet.service');
          const bonusCredit = parseFloat((finalRefund * 0.05).toFixed(2));
          await walletService.creditWallet({
            userId,
            amount: finalRefund,
            bonusAmount: bonusCredit,
            reason: `Refund for Trek #${booking.booking_reference} (+5% Bonus)`,
            referenceId: bookingId,
            conn,
          });
        } catch (wErr) {
          console.warn('Could not credit GoWild wallet:', wErr.message);
        }
      }
    }

    await referralService.cancelReferralForBooking({ conn, bookingId });
    await referralService.refundRewardForBooking({ conn, bookingId });

    // ===============================
    // 7️⃣ FETCH PARTICIPANTS (FIXED)
    // ===============================
    const [participantRows] = await conn.execute(`
      SELECT 
        id,
        name,
        age,
        gender,
        id_type,
        id_number,
        phone,
        medical_info,
        is_primary_contact
      FROM booking_participants
      WHERE booking_id = ?
    `, [bookingId]);

    const participants = participantRows || [];

    // ===============================
    // 8️⃣ RECALCULATE BATCH SLOTS
    // ===============================
    const [slotRows] = await conn.execute(`
      SELECT COALESCE(SUM(participants), 0) AS total_booked
      FROM bookings
      WHERE batch_id = ?
      AND booking_status != 'cancelled'
    `, [booking.batch_id]);

    const recalculatedBookedSlots = parseInt(slotRows[0].total_booked);
    const recalculatedAvailableSlots =
      booking.max_participants - recalculatedBookedSlots;

    await conn.execute(`
      UPDATE trek_batches
      SET 
        booked_slots = ?,
        available_slots = ?
      WHERE id = ?
    `, [
      recalculatedBookedSlots,
      recalculatedAvailableSlots < 0 ? 0 : recalculatedAvailableSlots,
      booking.batch_id
    ]);

    await conn.commit();
    conn.release();

    // ===============================
    // 📧 SEND EMAIL (ASYNC)
    // ===============================
    const bookingDataForEmail = {
      ...booking,
      refund_amount: parseFloat(finalRefund.toFixed(2)),
      refund_percentage: refundPercentage,
      cancellation_fee: parseFloat(cancellationFee.toFixed(2)),
      cancellation_reason: reason.trim(),
      participants_details: participants
    };

    emailService
      .sendCancellationEmail(bookingDataForEmail)
      .then(() => {
        console.log("Cancellation email sent to:", booking.customer_email);
      })
      .catch((err) => {
        console.error("Failed to send cancellation email:", err);
      });

    // ===============================
    // 9️⃣ RESPONSE
    // ===============================
    const responsePayload = {
      bookingId,
      bookingReference: booking.booking_reference,
      refundPercentage,
      refundBreakdown: {
        baseRefund: parseFloat(baseRefund.toFixed(2)),
        gstRefund: parseFloat(gstRefund.toFixed(2))
      },
      totalRefund: parseFloat(finalRefund.toFixed(2)),
      cancellationFee: parseFloat(cancellationFee.toFixed(2)),
      refundMethod: booking.payment_method || "Original payment method",
      processingTime: "7-10 business days"
    };

    const encryptedResponse = encrypt(responsePayload);

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      data: encryptedResponse
    });

  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
        conn.release();
      } catch (err) {
        console.error("Rollback failed:", err);
      }
    }

    console.error("Cancel booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
      error: error.message
    });
  }
}

async function submitTrekRating(req, res) {
  let conn;

  try {
    conn = await db.getConnection();
    await ensureTrekRatingsTable(conn);

    const bookingId = String(req.params.bookingId || '').trim();
    const userId = String(req.params.userId || '').trim();
    const decryptedBody = req.body?.encryptedPayload
      ? decrypt(req.body.encryptedPayload)
      : null;
    const body = (decryptedBody && typeof decryptedBody === "object")
      ? decryptedBody
      : (req.body || {});
    const rating = Number(body.rating);
    const review = String(body.review || "").trim();

    if (!bookingId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Valid userId and bookingId are required"
      });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be an integer between 1 and 5"
      });
    }

    const [rows] = await conn.execute(
      `
        SELECT
          b.id,
          b.user_id,
          tb.trek_id AS resolved_trek_id,
          b.booking_status,
          tb.end_date
        FROM bookings b
        INNER JOIN trek_batches tb ON tb.id = b.batch_id COLLATE utf8mb4_unicode_ci
        WHERE b.id = ? AND b.user_id = ?
        LIMIT 1
      `,
      [bookingId, userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Booking not found for this user"
      });
    }

    const booking = rows[0];
    const endDate = new Date(booking.end_date);
    const today = new Date();
    endDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    if (booking.booking_status !== "completed" && endDate > today) {
      return res.status(400).json({
        success: false,
        message: "Rating is allowed only for completed treks"
      });
    }

    await conn.execute(
      `
        INSERT INTO trek_ratings (booking_id, trek_id, user_id, rating, review)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          rating = VALUES(rating),
          review = VALUES(review),
          updated_at = CURRENT_TIMESTAMP
      `,
      [bookingId, booking.resolved_trek_id, userId, rating, review || null]
    );

    const [aggregateRows] = await conn.execute(
      `
        SELECT
          ROUND(AVG(rating), 1) AS average_rating,
          COUNT(*) AS review_count
        FROM trek_ratings
        WHERE trek_id = ?
      `,
      [booking.resolved_trek_id]
    );

    const aggregate = aggregateRows[0] || {};
    const encryptedResponse = encrypt({
      bookingId,
      trekId: booking.resolved_trek_id,
      rating,
      review,
      ratedAt: new Date().toISOString(),
      averageRating: Number(aggregate.average_rating || 0),
      reviewCount: Number(aggregate.review_count || 0)
    });

    return res.status(200).json({
      success: true,
      message: "Rating submitted successfully",
      data: encryptedResponse
    });
  } catch (error) {
    console.error("Submit rating error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit rating",
      error: error.message
    });
  } finally {
    if (conn) conn.release();
  }
}

async function validateCouponController(req, res) {
  try {
    await couponService.ensureCouponSchema();

    const payload = decrypt(req.body?.encryptedPayload || "");
    const trekOrBatchId = String(payload?.trekId || '').trim();
    const userId = String(payload?.userId || '').trim();
    const participants = Number(payload?.participants || 0);
    const unitPrice = Number(payload?.price || 0);
    const couponCode = normalizeCouponCode(payload?.couponCode || payload?.coupon?.code || "");
    const selectedAddOns = Array.isArray(payload?.selectedAddOns) ? payload.selectedAddOns : [];

    if (!trekOrBatchId || !couponCode || !participants || unitPrice < 0) {
      const encryptedResponse = encrypt({
        valid: false,
        message: "trekId, participants, price and couponCode are required",
      });
      return res.status(200).json({ success: true, data: encryptedResponse });
    }

    let couponTrekId = trekOrBatchId;
    const [[trekById]] = await db.query(
      "SELECT id FROM treks WHERE id = ? LIMIT 1",
      [trekOrBatchId]
    );
    if (!trekById) {
      const [[batchRow]] = await db.query(
        "SELECT trek_id AS trekId FROM trek_batches WHERE id = ? LIMIT 1",
        [trekOrBatchId]
      );
      if (batchRow?.trekId) couponTrekId = String(batchRow.trekId || '').trim();
    }

    const basePrice = unitPrice * participants;
    const addonsTotal = selectedAddOns
      .filter((addon) => addon.selected || Number(addon.quantity) > 0)
      .reduce((sum, addon) => {
        const quantity = Number(addon.quantity) > 0 ? Number(addon.quantity) : participants;
        return sum + Number(addon.price || 0) * quantity;
      }, 0);
    const subtotalBeforeDiscount = basePrice + addonsTotal;

    const [couponRows] = await db.query(
      `
        SELECT
          id,
          trek_id,
          code,
          discount_type,
          discount_value,
          min_booking_amount,
          max_discount_amount,
          start_date,
          end_date,
          usage_limit,
          usage_count,
          is_active
        FROM trek_coupons
        WHERE trek_id = ? AND code = ?
        LIMIT 1
      `,
      [couponTrekId, couponCode]
    );

    const coupon = couponRows[0];
    if (!coupon || Number(coupon.is_active) !== 1) {
      const encryptedResponse = encrypt({
        valid: false,
        message: "Invalid coupon code for this trek",
      });
      return res.status(200).json({ success: true, data: encryptedResponse });
    }

    const now = new Date();
    if (coupon.start_date && new Date(coupon.start_date) > now) {
      const encryptedResponse = encrypt({
        valid: false,
        message: "Coupon is not active yet",
      });
      return res.status(200).json({ success: true, data: encryptedResponse });
    }
    if (coupon.end_date && new Date(coupon.end_date) < now) {
      const encryptedResponse = encrypt({
        valid: false,
        message: "Coupon has expired",
      });
      return res.status(200).json({ success: true, data: encryptedResponse });
    }
    if (Number(coupon.min_booking_amount || 0) > subtotalBeforeDiscount) {
      const encryptedResponse = encrypt({
        valid: false,
        message: "Booking amount does not meet coupon minimum requirement",
      });
      return res.status(200).json({ success: true, data: encryptedResponse });
    }
    if (
      coupon.usage_limit !== null &&
      Number(coupon.usage_count || 0) >= Number(coupon.usage_limit)
    ) {
      const encryptedResponse = encrypt({
        valid: false,
        message: "Coupon usage limit reached",
      });
      return res.status(200).json({ success: true, data: encryptedResponse });
    }

    if (userId) {
      const [usageRows] = await db.query(
        `
          SELECT id
          FROM coupon_usages
          WHERE coupon_id = ? AND user_id = ?
          LIMIT 1
        `,
        [coupon.id, userId]
      );

      if (usageRows.length > 0) {
        const encryptedResponse = encrypt({
          valid: false,
          message: "You have already used this coupon",
        });
        return res.status(200).json({ success: true, data: encryptedResponse });
      }
    }

    let discountAmount = 0;
    if (coupon.discount_type === "percentage") {
      discountAmount = subtotalBeforeDiscount * (Number(coupon.discount_value) / 100);
    } else {
      discountAmount = Number(coupon.discount_value || 0);
    }
    if (coupon.max_discount_amount !== null) {
      discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
    }
    discountAmount = Math.min(discountAmount, subtotalBeforeDiscount);

    const encryptedResponse = encrypt({
      valid: true,
      message: "Coupon applied",
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: Number(coupon.discount_value || 0),
      discountAmount,
      subtotalBeforeDiscount,
      subtotalAfterDiscount: subtotalBeforeDiscount - discountAmount,
    });
    return res.status(200).json({ success: true, data: encryptedResponse });
  } catch (error) {
    console.error("Validate coupon error:", error);
    return res.status(200).json({
      success: false,
      message: "Failed to validate coupon",
    });
  }
}

async function getAvailableCouponsController(req, res) {
  try {
    await couponService.ensureCouponSchema();

    const trekOrBatchId = String(req.params?.trekId || '').trim();
    const userId = String(req.query?.userId || '').trim();
    if (!trekOrBatchId) {
      return res.status(400).json({
        success: false,
        message: "Valid trekId is required",
      });
    }

    let couponTrekId = trekOrBatchId;
    const [[trekById]] = await db.query(
      "SELECT id FROM treks WHERE id = ? LIMIT 1",
      [trekOrBatchId]
    );
    if (!trekById) {
      const [[batchRow]] = await db.query(
        "SELECT trek_id AS trekId FROM trek_batches WHERE id = ? LIMIT 1",
        [trekOrBatchId]
      );
      if (batchRow?.trekId) couponTrekId = String(batchRow.trekId || '').trim();
    }

    const [rows] = await db.query(
      `
        SELECT
          c.id,
          c.code,
          c.discount_type AS discountType,
          c.discount_value AS discountValue,
          c.min_booking_amount AS minBookingAmount,
          c.max_discount_amount AS maxDiscountAmount,
          c.end_date AS endDate,
          c.usage_limit AS usageLimit,
          c.usage_count AS usageCount
        FROM trek_coupons c
        WHERE c.trek_id = ?
          AND c.is_active = 1
          AND (c.start_date IS NULL OR c.start_date <= NOW())
          AND (c.end_date IS NULL OR c.end_date >= NOW())
          AND (c.usage_limit IS NULL OR c.usage_count < c.usage_limit)
        ORDER BY c.updated_at DESC
      `,
      [couponTrekId]
    );

    let usedCouponIds = new Set();
    if (userId && rows.length > 0) {
      const couponIds = rows.map((r) => r.id);
      const placeholders = couponIds.map(() => "?").join(",");
      const [usageRows] = await db.query(
        `
          SELECT coupon_id
          FROM coupon_usages
          WHERE user_id = ?
            AND coupon_id IN (${placeholders})
        `,
        [userId, ...couponIds]
      );
      usedCouponIds = new Set(usageRows.map((r) => String(r.coupon_id)));
    }

    const coupons = rows.map((row) => ({
      ...row,
      isUsedByUser: usedCouponIds.has(String(row.id)),
    }));

    return res.status(200).json({
      success: true,
      data: coupons,
    });
  } catch (error) {
    console.error("Get available coupons error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch coupons",
    });
  }
}

async function payRemainderController(req, res) {
  const conn = await db.getConnection();
  try {
    const bookingId = String(req.params.bookingId || '').trim();
    const { paymentMethod = 'UPI Online', transactionId } = req.body;

    const [rows] = await conn.execute(
      'SELECT * FROM bookings WHERE id = ?',
      [bookingId]
    );

    if (rows.length === 0) {
      conn.release();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = rows[0];
    const totalAmount = parseFloat(booking.total_amount || 0);
    const remainderDue = parseFloat(booking.balance_due || (totalAmount - parseFloat(booking.amount_paid || 0)));

    await conn.execute(`
      UPDATE bookings
      SET 
        amount_paid = total_amount,
        balance_due = 0.00,
        remainder_amount = 0.00,
        payment_status = 'paid',
        booking_status = 'confirmed',
        updated_at = NOW()
      WHERE id = ?
    `, [bookingId]);

    // Insert payment record
    const { createUuid } = require('../utils/id');
    const txId = transactionId || 'REM-' + Date.now();
    await conn.query(`
      INSERT INTO payments (id, booking_id, amount, status, payment_method, transaction_id, created_at)
      VALUES (?, ?, ?, 'completed', ?, ?, NOW())
    `, [createUuid(), bookingId, remainderDue, paymentMethod, txId]).catch(() => {});

    conn.release();

    return res.status(200).json({
      success: true,
      message: 'Remainder payment settled successfully. Booking is fully confirmed!',
      data: {
        bookingId,
        amountPaid: totalAmount,
        balanceDue: 0,
        paymentStatus: 'paid',
      },
    });
  } catch (error) {
    if (conn) conn.release();
    console.error('Pay remainder error:', error);
    return res.status(500).json({ success: false, message: 'Failed to settle remainder payment', error: error.message });
  }
}

async function getTaxInvoiceController(req, res) {
  try {
    const bookingId = String(req.params.bookingId || '').trim();
    const [rows] = await db.query(`
      SELECT 
        b.*,
        t.name as trek_name,
        t.location,
        t.duration as trek_duration,
        u.full_name as user_name,
        u.email as user_email,
        u.phone as user_phone
      FROM bookings b
      LEFT JOIN treks t ON b.trek_id = t.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `, [bookingId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = rows[0];
    const participants = parseInt(booking.participants || 1);
    const totalAmount = parseFloat(booking.total_amount || 0);
    const subtotal = parseFloat(booking.subtotal || (totalAmount / 1.05));
    const taxAmount = parseFloat(booking.tax_amount || (totalAmount - subtotal));

    const forestFeePerPerson = 250;
    const ecoCessPerPerson = 50;
    const totalForestFee = forestFeePerPerson * participants;
    const totalEcoCess = ecoCessPerPerson * participants;
    const baseServiceFee = Math.max(0, subtotal - totalForestFee - totalEcoCess);

    const [invSettings] = await db.query('SELECT setting_key, setting_value FROM settings').catch(() => [[]]);
    const invMap = {};
    for (const r of (invSettings || [])) invMap[r.setting_key] = r.setting_value;

    const invoiceData = {
      invoiceNumber: `INV-GWK-${new Date(booking.created_at).getFullYear()}-${String(booking.id).slice(0, 8).toUpperCase()}`,
      invoiceDate: booking.created_at,
      company: {
        legalName: invMap.legal_name || 'goWILD Karunadu Eco-Adventures Pvt Ltd',
        brandName: invMap.brand_name || 'goWILD Karunadu',
        gstin: invMap.gstin || '29AAGCW9123K1Z8',
        sacCode: '998555',
        kedbLicense: 'KEDB/ECO-TOUR/2024/089',
        address: invMap.address || 'Forest Trailway Plaza, Indiranagar, Bengaluru, Karnataka 560038',
        supportEmail: invMap.support_email || 'info@gowildkarunadu.com',
        supportPhone: invMap.support_phone || '+91 98765 43210',
      },
      customer: {
        name: booking.customer_name || booking.user_name || 'Valued Trekker',
        email: booking.customer_email || booking.user_email || '',
        phone: booking.customer_phone || booking.user_phone || '',
        emergencyContact: booking.emergency_contact || '',
      },
      trek: {
        name: booking.trek_name,
        location: booking.location,
        bookingReference: booking.booking_reference,
        startDate: booking.start_date,
        endDate: booking.end_date,
        participants: participants,
      },
      lineItems: [
        {
          description: `Guided Wilderness Trekking & Field Leadership (${participants} Person${participants > 1 ? 's' : ''})`,
          sac: '998555',
          amount: parseFloat(baseServiceFee.toFixed(2)),
        },
        {
          description: `Karnataka Forest Dept Wilderness Entry Permit (${participants} x ₹${forestFeePerPerson})`,
          sac: '998555',
          amount: parseFloat(totalForestFee.toFixed(2)),
        },
        {
          description: `Western Ghats Eco-Conservation Cess (${participants} x ₹${ecoCessPerPerson})`,
          sac: '998555',
          amount: parseFloat(totalEcoCess.toFixed(2)),
        },
      ],
      financials: {
        subtotal: parseFloat(subtotal.toFixed(2)),
        cgst: parseFloat((taxAmount / 2).toFixed(2)),
        sgst: parseFloat((taxAmount / 2).toFixed(2)),
        totalTax: parseFloat(taxAmount.toFixed(2)),
        discount: parseFloat(booking.discount_amount || 0),
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        amountPaid: parseFloat(booking.amount_paid || totalAmount),
        balanceDue: parseFloat(booking.balance_due || 0),
        paymentStatus: booking.payment_status || 'paid',
        paymentPlan: booking.payment_plan || 'full',
      },
    };

    return res.status(200).json({
      success: true,
      data: invoiceData,
    });
  } catch (error) {
    console.error('Tax invoice generation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate tax invoice', error: error.message });
  }
}

async function getSummitCertificateController(req, res) {
  try {
    const bookingId = String(req.params.bookingId || '').trim();
    const [rows] = await db.query(`
      SELECT 
        b.*,
        t.name as trek_name,
        t.location,
        t.elevation,
        t.difficulty,
        u.full_name as user_name
      FROM bookings b
      LEFT JOIN treks t ON b.trek_id = t.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `, [bookingId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = rows[0];
    const trekName = booking.trek_name || 'Western Ghats Peak';

    // Elevation dictionary fallback
    let elevation = booking.elevation || '1,894 MASL';
    if (trekName.includes('Kudremukha')) elevation = '1,894m (6,214 ft)';
    else if (trekName.includes('Kumara')) elevation = '1,712m (5,617 ft)';
    else if (trekName.includes('Mullayanagiri')) elevation = '1,930m (6,332 ft)';
    else if (trekName.includes('Tadiandamol')) elevation = '1,748m (5,735 ft)';
    else if (trekName.includes('Netravati')) elevation = '1,520m (4,986 ft)';

    const certificate = {
      certificateId: `GWK-CERT-${new Date().getFullYear()}-${String(booking.id).slice(0, 8).toUpperCase()}`,
      recipientName: booking.customer_name || booking.user_name || 'Adventure Trekker',
      trekName: trekName,
      location: booking.location || 'Chikkamagaluru / Western Ghats',
      elevation: elevation,
      completionDate: booking.start_date || new Date(),
      bookingReference: booking.booking_reference,
      leadTrekMaster: 'Capt. Raghu Varma, Mountaineering Inst.',
      verificationUrl: `https://gowildkarunadu.in/verify/cert/${String(booking.id).slice(0, 8)}`,
      badgeTitle: 'Certified Western Ghats Explorer',
      sealText: 'GO WILD KARUNADU OFFICIAL ECO-TRAIL SEAL',
    };

    return res.status(200).json({
      success: true,
      data: certificate,
    });
  } catch (error) {
    console.error('Summit certificate error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate summit certificate', error: error.message });
  }
}

module.exports = { 
  createBookingController, 
  getMyBookingsById, 
  getReceiptById, 
  cancelBooking, 
  submitTrekRating, 
  validateCouponController, 
  getAvailableCouponsController,
  payRemainderController,
  getTaxInvoiceController,
  getSummitCertificateController
};

