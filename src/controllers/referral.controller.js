const referralService = require("../service/referral.service");
const { encrypt, decrypt } = require("../service/cryptoHelper");

async function getReferralSummary(req, res) {
  try {
    let rawUserId = String(req.params.userId || '').trim();
    if (!rawUserId) {
      rawUserId = req.user?.id || '';
    }
    const targetUserId = (rawUserId.toLowerCase() === 'me' ? req.user?.id : rawUserId) || req.user?.id;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: "Valid userId is required" });
    }

    if (req.user && String(req.user.id).trim().toLowerCase() !== String(targetUserId).trim().toLowerCase() && req.user.type !== 'admin') {
      return res.status(403).json({ success: false, message: "Unauthorized to access this referral summary" });
    }

    const summary = await referralService.getReferralSummary(targetUserId);
    if (!summary) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const encryptedResponse = encrypt(summary);
    return res.status(200).json({ success: true, data: encryptedResponse });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load referral summary" });
  }
}

async function validateReferralCode(req, res) {
  try {
    const payload = req.body?.encryptedPayload ? decrypt(req.body.encryptedPayload) : req.body;
    const referralCode = payload?.referralCode || payload?.code;
    const userId = String(payload?.userId || req.user?.id || '').trim();
    const participants = Number(payload?.participants || 0);

    const result = await referralService.validateReferralCode({
      referralCode,
      userId,
      participants,
    });

    const encryptedResponse = encrypt(result);
    return res.status(200).json({ success: true, data: encryptedResponse });
  } catch (error) {
    return res.status(200).json({ success: false, message: error.message || "Failed to validate referral code" });
  }
}

async function getOrCreateReferralCode(req, res) {
  try {
    let rawUserId = String(req.params.userId || '').trim();
    if (!rawUserId) {
      rawUserId = req.user?.id || '';
    }
    const targetUserId = (rawUserId.toLowerCase() === 'me' ? req.user?.id : rawUserId) || req.user?.id;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: "Valid userId is required" });
    }

    if (req.user && String(req.user.id).trim().toLowerCase() !== String(targetUserId).trim().toLowerCase() && req.user.type !== 'admin') {
      return res.status(403).json({ success: false, message: "Unauthorized to generate referral code for another user" });
    }

    const code = await referralService.ensureReferralCodeForUser(targetUserId);
    const encryptedResponse = encrypt({ referralCode: code });
    return res.status(200).json({ success: true, data: encryptedResponse });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch referral code" });
  }
}

module.exports = {
  getReferralSummary,
  validateReferralCode,
  getOrCreateReferralCode,
};
