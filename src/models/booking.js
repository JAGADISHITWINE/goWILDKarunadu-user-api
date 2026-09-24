const db = require("../config/db");
const emailService = require("../service/emailService"); // Email service
const couponService = require("../service/coupon.service");
const referralService = require("../service/referral.service");
const { createUuid } = require("../utils/id");
const { formatDateForMySQL, formatDateOnlyForMySQL } = require("../utils/helpers");

function normalizeCouponCode(code = "") {
  return String(code || "").trim().toUpperCase();
}

function isExpectedBookingError(error) {
  const expectedCodes = new Set([
    "DUPLICATE_BOOKING",
    "UNPAID_BOOKING_EXISTS",
    "MONTHLY_ACTIVE_BOOKING_EXISTS",
    "ACTIVE_TREK_BOOKING_EXISTS",
    "INSUFFICIENT_SLOTS",
    "INVALID_COUPON",
    "COUPON_NOT_STARTED",
    "COUPON_EXPIRED",
    "COUPON_MIN_AMOUNT_NOT_MET",
    "COUPON_USAGE_LIMIT_REACHED",
    "COUPON_ALREADY_USED_BY_USER",
  ]);
  return expectedCodes.has(String(error?.message || "")) || error?.code === "ER_DUP_ENTRY";
}

async function createBooking(bookingData) {
  const conn = await db.getConnection();

  try {
    // Normalize and validate trekId and batchId to avoid DB errors like "Data too long"
    function coerceId(value) {
      if (!value && value !== 0) return '';
      // If object, try common id fields
      if (typeof value === 'object') {
        const idCandidates = [value.id, value._id, value.trek_id, value.trekId, value.uuid];
        for (const c of idCandidates) {
          if (c) return String(c).trim();
        }
        // Fallback to JSON string of object (not ideal)
        try { return JSON.stringify(value).slice(0, 200); } catch (e) { return '' }
      }
      // If string, try to detect JSON and parse
      const s = String(value).trim();
      if (s.startsWith('{') && s.endsWith('}')) {
        try {
          const parsed = JSON.parse(s);
          return coerceId(parsed);
        } catch (e) {
          // not JSON, continue
        }
      }
      // If contains a UUID-like substring, extract it
      const uuidMatch = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
      if (uuidMatch) return uuidMatch[0];
      return s;
    }

    const normalizedTrekId = coerceId(bookingData.trekId);
    const normalizedBatchId = coerceId(bookingData.batchId);


    // Typical IDs are UUIDs (36 chars). Reject clearly invalid values early.
    if (!normalizedTrekId) {
      throw new Error('INVALID_TREK_ID');
    }
    if (!normalizedBatchId) {
      throw new Error('INVALID_BATCH_ID');
    }
    if (normalizedTrekId.length > 64) {
      console.warn('Warning: trekId appears too long, attempting lookup by slug/name', normalizedTrekId.slice(0,200));
      try {
        // Try base64url decode if the value looks encoded and contains JSON with an id
        try {
          const candidate = normalizedTrekId.replace(/-/g, '+').replace(/_/g, '/');
          const pad = candidate.length % 4;
          const padded = candidate + (pad ? '='.repeat(4 - pad) : '');
          const decoded = Buffer.from(padded, 'base64').toString('utf8');
          if (decoded && (decoded.trim().startsWith('{') || decoded.includes('id'))) {
            try {
              const parsed = JSON.parse(decoded);
              const extracted = parsed.id || parsed._id || parsed.trekId || parsed.trek_id || parsed.uuid;
              if (extracted) {
                console.info('Extracted id from base64-encoded trek payload');
                bookingData.trekId = String(extracted).trim();
                // proceed with normalized value
              }
            } catch (e) {
              // not JSON, ignore
            }
          }
        } catch (e) {
          // ignore base64 decode errors
        }

        // Try to find a trek by slug or name matching the provided long value
        const searchVal = bookingData.trekId || normalizedTrekId;
        const [trekRows] = await conn.execute(
          `SELECT id FROM treks WHERE id = ? OR name = ? LIMIT 1`,
          [searchVal, searchVal]
        );
        if (Array.isArray(trekRows) && trekRows.length > 0 && trekRows[0].id) {
          // Found a matching trek, use its id
          console.info('Resolved long trekId to existing trek id', trekRows[0].id);
          bookingData.trekId = String(trekRows[0].id);
        } else if (bookingData.trekName) {
          // Try lookup by provided trekName (looser match)
          const nameSearch = String(bookingData.trekName).trim();
          const [byName] = await conn.execute(
            `SELECT id FROM treks WHERE name LIKE ? OR id = ? LIMIT 1`,
            [`%${nameSearch}%`, nameSearch]
          );
          if (Array.isArray(byName) && byName.length > 0 && byName[0].id) {
            console.info('Resolved trek via trekName to id', byName[0].id);
            bookingData.trekId = String(byName[0].id);
          } else {
            console.warn('Could not resolve long trekId; rejecting to avoid DB error');
            throw new Error('INVALID_TREK_ID_TOO_LONG');
          }
        } else {
          console.warn('Could not resolve long trekId; rejecting to avoid DB error');
          throw new Error('INVALID_TREK_ID_TOO_LONG');
        }
      } catch (err) {
        console.warn('Trek lookup for long trekId failed:', err?.message || err);
        throw new Error('INVALID_TREK_ID_TOO_LONG');
      }
    }
    if (normalizedBatchId.length > 64) {
      console.warn('Warning: batchId appears too long, attempting lookup by name/start-date', normalizedBatchId.slice(0,200));
      try {
        const searchVal = normalizedBatchId;
        const [batchRows] = await conn.execute(
          `SELECT id FROM trek_batches WHERE id = ? OR name = ? LIMIT 1`,
          [searchVal, searchVal]
        );
        if (Array.isArray(batchRows) && batchRows.length > 0 && batchRows[0].id) {
          bookingData.batchId = String(batchRows[0].id);
        } else if (bookingData.startDate && bookingData.trekId) {
          const startDateStr = formatDateOnlyForMySQL(bookingData.startDate);
          const [byDate] = await conn.execute(
            `SELECT id FROM trek_batches WHERE trek_id = ? AND DATE(start_date) = ? LIMIT 1`,
            [bookingData.trekId, startDateStr]
          );
          if (Array.isArray(byDate) && byDate.length > 0 && byDate[0].id) {
            bookingData.batchId = String(byDate[0].id);
          } else {
            console.warn('Could not resolve long batchId; rejecting to avoid DB error');
            throw new Error('INVALID_BATCH_ID_TOO_LONG');
          }
        } else {
          console.warn('Could not resolve long batchId; rejecting to avoid DB error');
          throw new Error('INVALID_BATCH_ID_TOO_LONG');
        }
      } catch (err) {
        console.warn('Batch lookup for long batchId failed:', err?.message || err);
        throw new Error('INVALID_BATCH_ID_TOO_LONG');
      }
    }
    // Recompute normalized values in case lookups updated bookingData
    const finalTrekId = coerceId(bookingData.trekId) || normalizedTrekId;
    const finalBatchId = coerceId(bookingData.batchId) || normalizedBatchId;
    // Overwrite bookingData values with normalized strings
    bookingData.trekId = finalTrekId;
    bookingData.batchId = finalBatchId;
    await couponService.ensureCouponSchema();
    await referralService.ensureReferralSchema();

    const targetBatchMonth = formatDateOnlyForMySQL(bookingData.startDate)?.slice(0, 7);
    if (!targetBatchMonth) {
      throw new Error("INVALID_START_DATE");
    }

    // Start transaction
    await conn.beginTransaction();

    // 1. Block duplicate/simultaneous bookings for the same trek if user already has an active (non-completed, non-cancelled) booking
    const [activeBookings] = await conn.execute(
      `
      SELECT b.id, b.booking_reference, b.booking_status, b.payment_status, tb.start_date, tb.end_date
      FROM bookings b
      LEFT JOIN trek_batches tb
        ON CONVERT(tb.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(b.batch_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      WHERE b.user_id = ?
        AND (
          b.trek_id = ? 
          OR b.trek_id IN (SELECT id FROM treks WHERE id = ? OR name = (SELECT name FROM treks WHERE id = ? LIMIT 1))
        )
        AND b.booking_status NOT IN ('cancelled', 'completed')
        AND (COALESCE(tb.end_date, tb.start_date, NOW()) >= CURDATE() OR b.booking_status IN ('pending', 'confirmed'))
      ORDER BY b.created_at DESC
      LIMIT 1
    `,
      [bookingData.userId, bookingData.trekId, bookingData.trekId, bookingData.trekId],
    );

    if (activeBookings.length > 0) {
      await conn.rollback();
      const existingRef = activeBookings[0].booking_reference || 'Active';
      const customErr = new Error("ACTIVE_TREK_BOOKING_EXISTS");
      customErr.bookingReference = existingRef;
      throw customErr;
    }

    // 2. Generate unique booking reference
    const bookingReference = generateBookingReference(
      bookingData.trekId,
      bookingData.batchId,
      bookingData.startDate,
    );

    // 4. Calculate pricing
    const basePrice = parseFloat(bookingData.price) * bookingData.participants;
    const addonsTotal = (bookingData.selectedAddOns || [])
      .filter((addon) => addon.selected || Number(addon.quantity) > 0)
      .reduce((sum, addon) => {
        const quantity = Number(addon.quantity) > 0
          ? Number(addon.quantity)
          : bookingData.participants;
        return sum + Number(addon.price || 0) * quantity;
      }, 0);
    const subtotalBeforeDiscount = basePrice + addonsTotal;
    let couponDiscountAmount = 0;
    let coupon = null;
    const couponCode = normalizeCouponCode(bookingData.couponCode || bookingData.coupon?.code);
    let couponTrekId = String(bookingData.trekId || '').trim();
    const referralCode = referralService.normalizeReferralCode(
      bookingData.referralCode || bookingData.referral?.code
    );
    let referralContext = null;
    let rewardPreview = { slotsUsed: 0, discountAmount: 0 };

    if (couponCode) {
      const [[trekById]] = await conn.execute(
        "SELECT id FROM treks WHERE id = ? LIMIT 1",
        [couponTrekId]
      );
      if (!trekById) {
        const [[batchRow]] = await conn.execute(
          "SELECT trek_id AS trekId FROM trek_batches WHERE id = ? LIMIT 1",
          [bookingData.batchId]
        );
        if (batchRow?.trekId) {
        couponTrekId = String(batchRow.trekId || '').trim();
        }
      }
    }

    if (couponCode) {
      const [couponRows] = await conn.execute(
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
          FOR UPDATE
        `,
        [couponTrekId, couponCode]
      );

      coupon = couponRows[0];
      if (!coupon || Number(coupon.is_active) !== 1) {
        throw new Error("INVALID_COUPON");
      }

      const now = new Date();
      if (coupon.start_date && new Date(coupon.start_date) > now) {
        throw new Error("COUPON_NOT_STARTED");
      }
      if (coupon.end_date && new Date(coupon.end_date) < now) {
        throw new Error("COUPON_EXPIRED");
      }

      if (Number(coupon.min_booking_amount || 0) > subtotalBeforeDiscount) {
        throw new Error("COUPON_MIN_AMOUNT_NOT_MET");
      }

      if (
        coupon.usage_limit !== null &&
        Number(coupon.usage_count || 0) >= Number(coupon.usage_limit)
      ) {
        throw new Error("COUPON_USAGE_LIMIT_REACHED");
      }

      const [usageRows] = await conn.execute(
        `
          SELECT id
          FROM coupon_usages
          WHERE coupon_id = ? AND user_id = ?
          LIMIT 1
        `,
        [coupon.id, bookingData.userId]
      );

      if (usageRows.length > 0) {
        throw new Error("COUPON_ALREADY_USED_BY_USER");
      }

      if (coupon.discount_type === "percentage") {
        couponDiscountAmount = subtotalBeforeDiscount * (Number(coupon.discount_value) / 100);
      } else {
        couponDiscountAmount = Number(coupon.discount_value || 0);
      }

      if (coupon.max_discount_amount !== null) {
        couponDiscountAmount = Math.min(couponDiscountAmount, Number(coupon.max_discount_amount));
      }
      couponDiscountAmount = Math.min(couponDiscountAmount, subtotalBeforeDiscount);
    }

    if (referralCode) {
      const referralValidation = await referralService.validateReferralCode({
        referralCode,
        userId: bookingData.userId,
        participants: bookingData.participants,
        conn,
      });
      if (!referralValidation.valid) {
        throw new Error(referralValidation.message || "Invalid referral code");
      }
      referralContext = {
        ...referralValidation,
        referredUserId: bookingData.userId,
      };
    }

    const wantsReferralReward = Boolean(
      bookingData.useReferralReward ||
        bookingData.referralReward?.useFreeSlot ||
        bookingData.redeemReferralReward
    );
    const requestedRewardSlots = Number(
      bookingData.referralRewardSlots ||
        bookingData.referralReward?.slots ||
        1
    );

    if (wantsReferralReward) {
      if (referralContext) {
        throw new Error("Referral discount cannot be combined with reward redemption");
      }
      rewardPreview = await referralService.previewRewardRedemption({
        conn,
        userId: bookingData.userId,
        requestedSlots: requestedRewardSlots,
        unitPrice: Number(bookingData.price || 0),
      });
    }

    const remainingAfterCoupon = Math.max(subtotalBeforeDiscount - couponDiscountAmount, 0);
    let referralDiscountAmount = 0;
    if (referralContext) {
      referralDiscountAmount = Math.min(referralContext.discountAmount, remainingAfterCoupon);
      referralDiscountAmount = Math.max(referralDiscountAmount, 0);
    }

    const remainingAfterReferral = Math.max(remainingAfterCoupon - referralDiscountAmount, 0);
    let referralRewardDiscountAmount = 0;
    if (rewardPreview.discountAmount > 0) {
      referralRewardDiscountAmount = Math.min(
        rewardPreview.discountAmount,
        remainingAfterReferral
      );
      referralRewardDiscountAmount = Math.max(referralRewardDiscountAmount, 0);
    }

    const subtotal = Math.max(
      subtotalBeforeDiscount - couponDiscountAmount - referralDiscountAmount - referralRewardDiscountAmount,
      0
    );
    const taxAmount = subtotal * 0.05; // 5% tax
    const totalAmount = subtotal + taxAmount;

    // 5. Insert main booking record
    const bookingId = createUuid();
    const bookingQuery = `
      INSERT INTO bookings (
        id,
        booking_reference,
        user_id,
        trek_id,
        batch_id,
        customer_name,
        customer_email,
        customer_phone,
        emergency_contact,
        special_requests,
        trek_name,
        start_date,
        end_date,
        participants,
        base_price,
        addons_total,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        payment_status,
        amount_paid,
        balance_due,
        refund_amount,
        cancellation_fee,
        payment_deadline,
        booking_status,
        confirmation_sent,
        referral_code,
        referral_discount,
        referral_reward_discount,
        referral_reward_slots_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const paymentDeadlineDate = new Date(bookingData.startDate);
    paymentDeadlineDate.setDate(paymentDeadlineDate.getDate() - 7); // 7 days before trek

    const paymentDeadline = formatDateForMySQL(paymentDeadlineDate);
    const mysqlStartDate = formatDateForMySQL(bookingData.startDate);
    const mysqlEndDate = formatDateForMySQL(bookingData.endDate);

    const [bookingResult] = await conn.execute(bookingQuery, [
      bookingId,
      bookingReference,
      bookingData.userId,
      bookingData.trekId,
      bookingData.batchId,
      bookingData.personalInfo.name,
      bookingData.personalInfo.email,
      bookingData.personalInfo.phone,
      bookingData.personalInfo.emergencyContact,
      bookingData.personalInfo.specialRequests,
      bookingData.trekName,
      mysqlStartDate,
      mysqlEndDate,
      bookingData.participants,
      basePrice,
      addonsTotal,
      subtotal,
      taxAmount,
      couponDiscountAmount,
      totalAmount,
      "pending",
      0, // amount_paid
      totalAmount, // balance_due
      0,
      0,
      paymentDeadline,
      "pending",
      false, // confirmation_sent
      referralContext?.referralCode || null,
      referralDiscountAmount,
      referralRewardDiscountAmount,
      rewardPreview?.slotsUsed || 0,
    ]);

    // Handle 30% advance deposit or wallet payment
    const paymentPlan = bookingData.paymentPlan === 'deposit_30' ? 'deposit_30' : 'full';
    const depositAmount = paymentPlan === 'deposit_30' ? parseFloat((totalAmount * 0.30).toFixed(2)) : totalAmount;
    const remainderDue = paymentPlan === 'deposit_30' ? parseFloat((totalAmount - depositAmount).toFixed(2)) : 0;
    const walletUsed = parseFloat(bookingData.walletAmountApplied || 0);

    try {
      const [bkCols] = await conn.query(`SHOW COLUMNS FROM bookings LIKE 'payment_plan'`).catch(() => [[]]);
      if (bkCols.length === 0) {
        await conn.query(`
          ALTER TABLE bookings 
          ADD COLUMN payment_plan VARCHAR(20) DEFAULT 'full',
          ADD COLUMN deposit_amount DECIMAL(10,2) DEFAULT 0.00,
          ADD COLUMN remainder_amount DECIMAL(10,2) DEFAULT 0.00
        `).catch(() => {});
      }

      const paymentMethodName = String(bookingData.paymentMethod || (walletUsed >= totalAmount ? 'Wallet Balance' : 'Online Payment (UPI/Card)')).trim();
      const amountPaidNow = walletUsed > 0 
        ? Math.min(walletUsed, totalAmount) 
        : (paymentPlan === 'deposit_30' ? depositAmount : totalAmount);
      const balanceDueNow = walletUsed >= totalAmount ? 0 : (paymentPlan === 'deposit_30' ? remainderDue : 0);
      const paymentStatusNow = walletUsed >= totalAmount ? 'paid' : (paymentPlan === 'deposit_30' ? 'partial' : 'paid');

      await conn.query(`
        UPDATE bookings
        SET 
          payment_plan = ?,
          deposit_amount = ?,
          remainder_amount = ?,
          amount_paid = ?,
          balance_due = ?,
          payment_status = ?,
          payment_method = ?
        WHERE id = ?
      `, [
        paymentPlan,
        depositAmount,
        remainderDue,
        amountPaidNow,
        balanceDueNow,
        paymentStatusNow,
        paymentMethodName,
        bookingId,
      ]);

      // Record transaction in payments table for audit & receipt
      await conn.query(`
        INSERT INTO payments (id, booking_id, amount, status, payment_method, transaction_id, created_at)
        VALUES (UUID(), ?, ?, 'success', ?, CONCAT('GWK-TXN-', UPPER(HEX(RANDOM_BYTES(4)))), NOW())
      `, [
        bookingId,
        amountPaidNow,
        paymentMethodName
      ]).catch(() => {});

      if (walletUsed > 0) {
        const walletService = require('../service/wallet.service');
        await walletService.debitWallet({
          userId: bookingData.userId,
          amount: Math.min(walletUsed, totalAmount),
          reason: `Trek Booking #${bookingReference}`,
          referenceId: bookingId,
          conn,
        });
      }
    } catch (bkErr) {
      console.warn('Booking payment plan update warning:', bkErr.message);
    }

    if (referralContext) {
      await referralService.recordReferralForBooking({
        conn,
        bookingId,
        context: referralContext,
      });
    }

    if (rewardPreview.slotsUsed > 0) {
      await referralService.redeemFreeSlots({
        conn,
        userId: bookingData.userId,
        bookingId,
        unitPrice: Number(bookingData.price || 0),
        slotsToUse: rewardPreview.slotsUsed,
      });
    }

    // 6. Insert participant details (NEW with Medical & Dietary declarations)
    if (bookingData.participantDetails && bookingData.participantDetails.length > 0) {
      // Ensure columns exist
      try {
        const [pCols] = await conn.query(`SHOW COLUMNS FROM booking_participants LIKE 'blood_group'`).catch(() => [[]]);
        if (pCols.length === 0) {
          await conn.query(`
            ALTER TABLE booking_participants 
            ADD COLUMN blood_group VARCHAR(10) NULL,
            ADD COLUMN dietary_preference VARCHAR(30) NULL,
            ADD COLUMN medical_condition VARCHAR(255) NULL,
            ADD COLUMN govt_id_type VARCHAR(50) NULL,
            ADD COLUMN govt_id_number VARCHAR(100) NULL
          `).catch(() => {});
        }
      } catch (e) {}

      const participantQuery = `
        INSERT INTO booking_participants (
          id,
          booking_id,
          name,
          age,
          gender,
          id_type,
          id_number,
          govt_id_type,
          govt_id_number,
          blood_group,
          dietary_preference,
          medical_condition,
          medical_info,
          phone,
          is_primary_contact
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (let i = 0; i < bookingData.participantDetails.length; i++) {
        const participant = bookingData.participantDetails[i];
        const isPrimary = i === 0 ? 1 : 0; // First participant is primary contact
        const idType = participant.govtIdType || participant.idType || null;
        const idNumber = participant.govtIdNumber || participant.idNumber || null;
        const bloodGroup = participant.bloodGroup || null;
        const dietary = participant.dietaryPreference || null;
        const medicalCondition = participant.medicalCondition || participant.medicalInfo || null;

        await conn.execute(participantQuery, [
          createUuid(),
          bookingId,
          participant.name,
          participant.age || null,
          participant.gender || null,
          idType,
          maskIdNumber(idNumber) || null,
          idType,
          maskIdNumber(idNumber) || null,
          bloodGroup,
          dietary,
          medicalCondition,
          medicalCondition,
          participant.phone || null,
          isPrimary,
        ]).catch(async () => {
          // Fallback if extended columns not present
          await conn.execute(`
            INSERT INTO booking_participants (
              id, booking_id, name, age, gender, id_type, id_number, phone, medical_info, is_primary_contact
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            createUuid(),
            bookingId,
            participant.name,
            participant.age || null,
            participant.gender || null,
            idType,
            maskIdNumber(idNumber) || null,
            participant.phone || null,
            medicalCondition,
            isPrimary,
          ]);
        });
      }

      console.info(`Inserted ${bookingData.participantDetails.length} participants for booking ${bookingReference}`);
    }

    // 7. Insert booking add-ons
    if (bookingData.selectedAddOns && bookingData.selectedAddOns.length > 0) {
      const addonQuery = `
        INSERT INTO booking_addons (
          booking_id,
          addon_id,
          addon_name,
          quantity,
          unit_price,
          total_price
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

        for (const addon of bookingData.selectedAddOns) {
          const quantity = Number(addon.quantity) > 0
          ? Number(addon.quantity)
          : (addon.selected ? bookingData.participants : 0);

        if (quantity > 0) {
          const unitPrice = Number(addon.price || 0);
          const totalPrice = unitPrice * quantity;

          await conn.execute(addonQuery, [
            bookingId,
            createUuid(),
            addon.name,
            quantity,
            unitPrice,
            totalPrice,
          ]);
        }
      }
    }

    // 8. Mark coupon usage (if applied)
    if (coupon) {
      await conn.execute(
        `
        INSERT INTO coupon_usages (id, coupon_id, user_id, booking_id)
          VALUES (?, ?, ?, ?)
        `,
        [createUuid(), coupon.id, bookingData.userId, bookingId]
      );

      await conn.execute(
        `
          UPDATE trek_coupons
          SET usage_count = usage_count + 1
          WHERE id = ?
        `,
        [coupon.id]
      );
    }

    // 9. Update trek batch available slots
    const updateSlotsQuery = `
      UPDATE trek_batches 
      SET 
        available_slots = available_slots - ?,
        booked_slots = booked_slots + ?
      WHERE id = ? AND available_slots >= ?
    `;

    const [updateResult] = await conn.execute(updateSlotsQuery, [
      bookingData.participants,
      bookingData.participants,
      bookingData.batchId,
      bookingData.participants,
    ]);

    // Check if update was successful
    if (updateResult.affectedRows === 0) {
      throw new Error("INSUFFICIENT_SLOTS");
    }

    // 10. Commit transaction
    await conn.commit();

    // 11. Fetch complete booking details with participants
    const [bookingDetails] = await conn.execute(
      `
      SELECT 
        b.*,
        GROUP_CONCAT(
          CONCAT(ba.addon_name, ' (', ba.quantity, 'x₹', ba.unit_price, ')')
          SEPARATOR ', '
        ) as addons_summary
      FROM bookings b
      LEFT JOIN booking_addons ba ON b.id = ba.booking_id
      WHERE b.id = ?
      GROUP BY b.id
    `,
      [bookingId],
    );

    const booking = bookingDetails[0];

    // Fetch participant details
    const [participants] = await conn.execute(
      `
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
      ORDER BY is_primary_contact DESC, id ASC
    `,
      [bookingId],
    );

    booking.participants_details = participants;

    // 12. Send confirmation email (async, don't wait)
    emailService
      .sendBookingConfirmation(booking)
      .then(() => {
        // Mark confirmation sent; avoid exposing booking details in logs
        console.info(`Confirmation email queued for booking ${bookingReference}`);
        conn.execute("UPDATE bookings SET confirmation_sent = TRUE WHERE id = ?", [bookingId]);
      })
      .catch((err) => {
        console.error("Failed to send confirmation email:", err.message || err);
      });

    // 13. Notify admin via admin socket server about new booking
    try {
      const ioClient = require("socket.io-client");
      const adminSocketUrl = process.env.ADMIN_SOCKET_URL || "http://localhost:4001";
      const adminSocket = ioClient(adminSocketUrl, {
        transports: ["websocket"],
        reconnection: false,
      });

      adminSocket.on("connect", () => {
        const notificationPayload = {
          bookingId: bookingId,
          bookingReference: bookingReference,
          customerName: booking.customer_name || bookingData.personalInfo?.name || null,
          trekName: booking.trek_name || bookingData.trekName || null,
          participants: bookingData.participants,
          totalAmount: totalAmount,
          createdAt: formatDateForMySQL(new Date()),
        };

        // Wait for an acknowledgement so we don't disconnect before message delivery.
        adminSocket.timeout(3000).emit("booking-created", notificationPayload, (err) => {
          if (err) {
            console.error("Admin booking notification acknowledgement timed out");
          }
          adminSocket.disconnect();
        });
      });

      adminSocket.on("connect_error", (err) => {
        console.error("Failed to connect to admin socket server for booking notification", err);
      });
    } catch (err) {
      console.error("Error notifying admin about new booking:", err);
    }

    return {
      success: true,
      message: "Booking created successfully. Confirmation email sent.",
      booking: booking,
      bookingId: bookingId,
      bookingReference: bookingReference,
      participantCount: participants.length,
    };
  } catch (error) {
    // Rollback transaction on error
    await conn.rollback();
    if (!isExpectedBookingError(error)) {
      console.error("Booking creation error:", error);
    }

    // Custom error messages
    if (error.message === "ACTIVE_TREK_BOOKING_EXISTS" || error.message === "MONTHLY_ACTIVE_BOOKING_EXISTS") {
      const ref = error.bookingReference ? ` (Ref: ${error.bookingReference})` : '';
      throw new Error(
        `You already have an active booking for this trek${ref}. Multiple simultaneous bookings for the same trek are not allowed until your current expedition is completed or cancelled.`,
      );
    }
    if (error.message === "INSUFFICIENT_SLOTS") {
      throw new Error("Insufficient available slots or batch not found");
    }
    if (error.message === "INVALID_COUPON") {
      throw new Error("Invalid coupon code for this trek");
    }
    if (error.message === "COUPON_NOT_STARTED") {
      throw new Error("Coupon is not active yet");
    }
    if (error.message === "COUPON_EXPIRED") {
      throw new Error("Coupon has expired");
    }
    if (error.message === "COUPON_MIN_AMOUNT_NOT_MET") {
      throw new Error("Booking amount does not meet coupon minimum requirement");
    }
    if (error.message === "COUPON_USAGE_LIMIT_REACHED") {
      throw new Error("Coupon usage limit reached");
    }
    if (error.message === "COUPON_ALREADY_USED_BY_USER") {
      throw new Error("You have already used this coupon");
    }
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error("You have already used this coupon");
    }

    throw error;
  } finally {
    // Release connection
    conn.release();
  }
}

function generateBookingReference(trekId, batchId, startDate) {
  const dateStr = (formatDateOnlyForMySQL(startDate) || "").replace(/-/g, "");
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK-${dateStr}-${randomStr}`;
}

// Add this helper function above createBooking
function maskIdNumber(idNumber) {
  if (!idNumber) return null;
  const clean = idNumber.replace(/\s/g, ''); // remove spaces (e.g. Aadhar formatting)
  if (clean.length <= 4) return clean;        // too short to mask
  const masked = '*'.repeat(clean.length - 4) + clean.slice(-4);
  return masked;
}

module.exports = {
  createBooking,
};
