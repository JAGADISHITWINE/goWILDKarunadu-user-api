const db = require("../config/db");
const { createUuid } = require("../utils/id");

const DEFAULT_REFERRAL_CONFIG = {
  baseDiscount: Number(process.env.REFERRAL_DISCOUNT_AMOUNT || 200),
  bonusDiscount: Number(process.env.REFERRAL_BONUS_DISCOUNT_AMOUNT || 500),
  bonusParticipantThreshold: Number(process.env.REFERRAL_BONUS_PARTICIPANT_THRESHOLD || 5),
  freeSlotThreshold: Number(process.env.REFERRAL_FREE_TREK_THRESHOLD || 5),
  freeSlotValue: Number(process.env.REFERRAL_FREE_TREK_VALUE || 1),
};

const REFERRAL_CODE_PREFIX = process.env.REFERRAL_CODE_PREFIX || "GWK";
const REFERRAL_CODE_LENGTH = Number(process.env.REFERRAL_CODE_LENGTH || 10);
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_CONFIG_CACHE_MS = Number(process.env.REFERRAL_CONFIG_CACHE_MS || 30000);
const REFERRAL_SETTINGS_TABLE = "referral_settings";

let schemaReady = false;
let referralConfigCache = null;
let referralConfigCacheLoadedAt = 0;

function normalizeReferralCode(code = "") {
  return String(code || "").trim().toUpperCase();
}

function calculateReferralDiscount(participants = 1, config = DEFAULT_REFERRAL_CONFIG) {
  const count = Number(participants) || 0;
  if (config?.isEnabled === 0) return 0;
  const threshold = Number(config?.bonusParticipantThreshold || DEFAULT_REFERRAL_CONFIG.bonusParticipantThreshold);
  const bonus = Number(config?.bonusDiscount || DEFAULT_REFERRAL_CONFIG.bonusDiscount);
  const base = Number(config?.baseDiscount || DEFAULT_REFERRAL_CONFIG.baseDiscount);
  if (threshold > 0 && count >= threshold) {
    return bonus;
  }
  return base;
}

function generateRandomSegment(length) {
  let output = "";
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length);
    output += REFERRAL_CODE_ALPHABET[idx];
  }
  return output;
}

function mapSettingsRow(row) {
  if (!row) return null;
  return {
    baseDiscount: Number(row.base_discount || DEFAULT_REFERRAL_CONFIG.baseDiscount),
    bonusDiscount: Number(row.bonus_discount || DEFAULT_REFERRAL_CONFIG.bonusDiscount),
    bonusParticipantThreshold: Number(row.bonus_participant_threshold || DEFAULT_REFERRAL_CONFIG.bonusParticipantThreshold),
    freeSlotThreshold: Number(row.free_slot_threshold || DEFAULT_REFERRAL_CONFIG.freeSlotThreshold),
    freeSlotValue: Number(row.free_slot_value || DEFAULT_REFERRAL_CONFIG.freeSlotValue),
    isEnabled: row.is_enabled === 0 ? 0 : 1,
  };
}

async function ensureReferralSettingsTable() {
  // Schema is verified and managed by centralized migration runner (013-create-referral-schema.sql)
  return;
}

async function getReferralConfig(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && referralConfigCache && now - referralConfigCacheLoadedAt < REFERRAL_CONFIG_CACHE_MS) {
    return referralConfigCache;
  }

  await ensureReferralSettingsTable();
  const [rows] = await db.query(
    `SELECT base_discount, bonus_discount, bonus_participant_threshold, free_slot_threshold, free_slot_value, is_enabled
     FROM ${REFERRAL_SETTINGS_TABLE}
     ORDER BY id ASC
     LIMIT 1`
  );
  const mapped = mapSettingsRow(rows[0]) || { ...DEFAULT_REFERRAL_CONFIG };
  referralConfigCache = mapped;
  referralConfigCacheLoadedAt = now;
  return mapped;
}

async function ensureReferralSchema() {
  // Schema is verified and managed by centralized migration runner (013-create-referral-schema.sql)
  return;
}

async function assignCodesForExistingUsers() {
  const batchSize = 200;
  while (true) {
    const [users] = await db.query(
      `SELECT id FROM users WHERE referral_code IS NULL OR referral_code = '' LIMIT ?`,
      [batchSize]
    );
    if (!users.length) {
      break;
    }
    for (const user of users) {
      const code = await generateUniqueReferralCode();
      await db.query(`UPDATE users SET referral_code = ? WHERE id = ?`, [code, user.id]);
    }
  }
}

async function generateUniqueReferralCode(attempts = 0) {
  if (attempts > 5) {
    return `${REFERRAL_CODE_PREFIX}${Date.now().toString(36).toUpperCase()}`.slice(0, REFERRAL_CODE_LENGTH);
  }
  const randomSegment = Math.max(REFERRAL_CODE_LENGTH - REFERRAL_CODE_PREFIX.length, 4);
  const code = `${REFERRAL_CODE_PREFIX}${generateRandomSegment(randomSegment)}`
    .slice(0, REFERRAL_CODE_LENGTH);
  const [rows] = await db.query(`SELECT id FROM users WHERE referral_code = ? LIMIT 1`, [code]);
  if (rows.length) {
    return generateUniqueReferralCode(attempts + 1);
  }
  return code;
}

async function ensureReferralCodeForUser(userId, conn) {
  const connection = conn || db;
  const [[row]] = await connection.query(
    `SELECT referral_code FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (!row) {
    return null;
  }
  if (row.referral_code) {
    return row.referral_code;
  }
  const code = await generateUniqueReferralCode();
  await connection.query(`UPDATE users SET referral_code = ? WHERE id = ?`, [code, userId]);
  return code;
}

async function hasUserUsedReferral(userId, conn) {
  const connection = conn || db;
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total FROM booking_referrals WHERE referred_user_id = ? AND status = 'pending'`,
    [userId]
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function getReferrerByCode(code, conn) {
  const connection = conn || db;
  const normalized = normalizeReferralCode(code);
  if (!normalized) {
    return null;
  }
  const [rows] = await connection.query(
    `SELECT id, full_name, email FROM users WHERE referral_code = ? LIMIT 1`,
    [normalized]
  );
  return rows[0] || null;
}

async function validateReferralCode({ referralCode, userId, participants = 1, conn }) {
  const normalized = normalizeReferralCode(referralCode);
  if (!normalized) {
    return { valid: false, message: "Referral code is required" };
  }

  const connection = conn || db;
  const referrer = await getReferrerByCode(normalized, connection);
  if (!referrer) {
    return { valid: false, message: "Invalid referral code" };
  }
  if (userId && String(referrer.id) === String(userId)) {
    return { valid: false, message: "You cannot use your own referral code" };
  }
  if (userId && (await hasUserUsedReferral(userId, connection))) {
    return { valid: false, message: "You have already used a referral code" };
  }

  const config = await getReferralConfig();
  if (config?.isEnabled === 0) {
    return { valid: false, message: "Referral program is not active" };
  }

  const discountAmount = calculateReferralDiscount(participants, config);
  if (discountAmount <= 0) {
    return { valid: false, message: "Referral program is not active" };
  }

  return {
    valid: true,
    message: "Referral code applied",
    referrerUserId: referrer.id,
    referralCode: normalized,
    discountAmount,
    participants: Number(participants) || 0,
  };
}

async function adjustFreeSlotProgress(conn, userId, config) {
  if (!userId) return;
  const [[row]] = await conn.query(
    `SELECT referral_success_count, referral_free_slots_available, referral_free_slots_redeemed
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (!row) return;

  const successCount = Number(row.referral_success_count || 0);
  const cfg = config || (await getReferralConfig());
  const threshold = Number(cfg.freeSlotThreshold || DEFAULT_REFERRAL_CONFIG.freeSlotThreshold);
  const slotValue = Number(cfg.freeSlotValue || DEFAULT_REFERRAL_CONFIG.freeSlotValue);
  if (threshold <= 0 || slotValue <= 0) {
    return;
  }
  const totalSlotsEarned = Math.floor(successCount / threshold) * slotValue;
  const recordedSlots = Number(row.referral_free_slots_available || 0) + Number(row.referral_free_slots_redeemed || 0);
  const delta = totalSlotsEarned - recordedSlots;
  if (delta > 0) {
    await conn.query(
      `UPDATE users SET referral_free_slots_available = referral_free_slots_available + ? WHERE id = ?`,
      [delta, userId]
    );
  } else if (delta < 0) {
    const reduction = Math.min(Math.abs(delta), Number(row.referral_free_slots_available || 0));
    if (reduction > 0) {
      await conn.query(
        `UPDATE users SET referral_free_slots_available = referral_free_slots_available - ? WHERE id = ?`,
        [reduction, userId]
      );
    }
  }
}

async function recordReferralForBooking({ conn, bookingId, context }) {
  if (!context?.valid) {
    return;
  }
  const connection = conn || db;
  const config = await getReferralConfig();
  await connection.query(
    `INSERT INTO booking_referrals
      (booking_id, referrer_user_id, referred_user_id, referral_code, discount_amount, participants)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      bookingId,
      context.referrerUserId,
      context.referredUserId,
      context.referralCode,
      context.discountAmount,
      context.participants || 0,
    ]
  );

  await connection.query(
    `UPDATE users
      SET referral_success_count = referral_success_count + 1,
          referral_total_discount = referral_total_discount + ?
      WHERE id = ?`,
    [context.discountAmount, context.referrerUserId]
  );

  await connection.query(
    `UPDATE users
      SET referred_by_user_id = COALESCE(referred_by_user_id, ?)
      WHERE id = ?`,
    [context.referrerUserId, context.referredUserId]
  );

  await adjustFreeSlotProgress(connection, context.referrerUserId, config);
}

async function cancelReferralForBooking({ conn, bookingId }) {
  const connection = conn || db;
  const [rows] = await connection.query(
    `SELECT id, referrer_user_id, discount_amount
     FROM booking_referrals
     WHERE booking_id = ? AND status = 'pending'
     LIMIT 1`,
    [bookingId]
  );
  if (!rows.length) {
    return;
  }
  const record = rows[0];
  await connection.query(
    `UPDATE booking_referrals SET status = 'cancelled' WHERE id = ?`,
    [record.id]
  );
  await connection.query(
    `UPDATE users
      SET referral_success_count = GREATEST(referral_success_count - 1, 0),
          referral_total_discount = GREATEST(referral_total_discount - ?, 0)
      WHERE id = ?`,
    [record.discount_amount, record.referrer_user_id]
  );
  const config = await getReferralConfig();
  await adjustFreeSlotProgress(connection, record.referrer_user_id, config);
}

async function previewRewardRedemption({ conn, userId, requestedSlots = 1, unitPrice = 0 }) {
  const connection = conn || db;
  if (!userId || unitPrice <= 0) {
    return { slotsUsed: 0, discountAmount: 0, available: 0 };
  }
  const [[row]] = await connection.query(
    `SELECT referral_free_slots_available FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (!row) {
    return { slotsUsed: 0, discountAmount: 0, available: 0 };
  }
  const available = Number(row.referral_free_slots_available || 0);
  if (available <= 0) {
    return { slotsUsed: 0, discountAmount: 0, available: 0 };
  }
  const slotsRequested = Math.max(0, Number(requestedSlots) || 0);
  const slotsUsed = Math.min(slotsRequested, available);
  return {
    slotsUsed,
    discountAmount: Number(unitPrice) * slotsUsed,
    available,
  };
}

async function redeemFreeSlots({ conn, userId, bookingId, requestedSlots = 1, unitPrice = 0, slotsToUse }) {
  const connection = conn || db;
  const preview = slotsToUse !== undefined
    ? { slotsUsed: Math.max(0, Number(slotsToUse) || 0), discountAmount: Number(unitPrice) * Math.max(0, Number(slotsToUse) || 0) }
    : await previewRewardRedemption({ conn: connection, userId, requestedSlots, unitPrice });
  if (!preview.slotsUsed) {
    return { slotsUsed: 0, discountAmount: 0 };
  }

  await connection.query(
    `UPDATE users
      SET referral_free_slots_available = referral_free_slots_available - ?,
          referral_free_slots_redeemed = referral_free_slots_redeemed + ?
      WHERE id = ?`,
    [preview.slotsUsed, preview.slotsUsed, userId]
  );

  await connection.query(
    `INSERT INTO referral_reward_redemptions (user_id, booking_id, slots_used, value_per_slot)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE slots_used = VALUES(slots_used), value_per_slot = VALUES(value_per_slot)`,
    [userId, bookingId, preview.slotsUsed, Number(unitPrice)]
  );

  return { slotsUsed: preview.slotsUsed, discountAmount: preview.discountAmount };
}

async function refundRewardForBooking({ conn, bookingId }) {
  const connection = conn || db;
  const [rows] = await connection.query(
    `SELECT user_id, slots_used FROM referral_reward_redemptions WHERE booking_id = ? LIMIT 1`,
    [bookingId]
  );
  if (!rows.length) {
    return;
  }
  const record = rows[0];
  await connection.query(
    `DELETE FROM referral_reward_redemptions WHERE booking_id = ?`,
    [bookingId]
  );
  await connection.query(
    `UPDATE users
      SET referral_free_slots_available = referral_free_slots_available + ?,
          referral_free_slots_redeemed = GREATEST(referral_free_slots_redeemed - ?, 0)
      WHERE id = ?`,
    [record.slots_used, record.slots_used, record.user_id]
  );
}

async function getReferralSummary(userId) {
  await ensureReferralSchema();
  if (!userId) {
    return null;
  }
  const [[userRow]] = await db.query(
    `SELECT
        referral_code,
        referral_success_count,
        referral_total_discount,
        referral_free_slots_available,
        referral_free_slots_redeemed
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (!userRow) {
    return null;
  }

  if (!userRow.referral_code) {
    const generatedCode = await ensureReferralCodeForUser(userId);
    userRow.referral_code = generatedCode;
  }

  const [recentReferrals] = await db.query(
    `SELECT br.booking_id, br.discount_amount, br.created_at, b.booking_reference, br.status
     FROM booking_referrals br
     LEFT JOIN bookings b ON b.id = br.booking_id
     WHERE br.referrer_user_id = ?
     ORDER BY br.created_at DESC
     LIMIT 10`,
    [userId]
  );

  const config = await getReferralConfig();
  const threshold = Number(config.freeSlotThreshold || 0);
  const slotValue = Number(config.freeSlotValue || 0);
  const progressModulo = threshold
    ? (threshold - (Number(userRow.referral_success_count || 0) % threshold)) % threshold
    : 0;

  return {
    referralCode: userRow.referral_code,
    successfulReferrals: Number(userRow.referral_success_count || 0),
    totalDiscountEarned: Number(userRow.referral_total_discount || 0),
    freeSlotsAvailable: Number(userRow.referral_free_slots_available || 0),
    freeSlotsRedeemed: Number(userRow.referral_free_slots_redeemed || 0),
    nextRewardIn: progressModulo,
    programActive: config.isEnabled !== 0,
    freeSlotThreshold: threshold,
    freeSlotValue: slotValue,
    discountTiers: {
      base: Number(config.baseDiscount || DEFAULT_REFERRAL_CONFIG.baseDiscount),
      bonus: Number(config.bonusDiscount || DEFAULT_REFERRAL_CONFIG.bonusDiscount),
      bonusParticipantThreshold: Number(config.bonusParticipantThreshold || DEFAULT_REFERRAL_CONFIG.bonusParticipantThreshold),
    },
    recentReferrals,
  };
}

module.exports = {
  ensureReferralSchema,
  ensureReferralCodeForUser,
  normalizeReferralCode,
  calculateReferralDiscount,
  validateReferralCode,
  recordReferralForBooking,
  cancelReferralForBooking,
  previewRewardRedemption,
  redeemFreeSlots,
  refundRewardForBooking,
  getReferralSummary,
};
