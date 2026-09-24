const referralService = require("../service/referral.service");
const { encrypt, decrypt } = require("../service/cryptoHelper");

async function getReferralSummary(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ success: false, message: "Valid userId is required" });
    }

    await referralService.ensureReferralSchema();
    const summary = await referralService.getReferralSummary(userId);
    if (!summary) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const encryptedResponse = encrypt(summary);
    return res.status(200).json({ success: true, data: encryptedResponse });
  } catch (error) {
    console.error("Referral summary error:", error);
    return res.status(500).json({ success: false, message: "Failed to load referral summary" });
  }
}

async function validateReferralCode(req, res) {
  try {
    await referralService.ensureReferralSchema();
    const payload = req.body?.encryptedPayload ? decrypt(req.body.encryptedPayload) : req.body;
    const referralCode = payload?.referralCode || payload?.code;
    const userId = String(payload?.userId || '').trim();
    const participants = Number(payload?.participants || 0);

    const result = await referralService.validateReferralCode({
      referralCode,
      userId,
      participants,
    });

    const encryptedResponse = encrypt(result);
    return res.status(200).json({ success: true, data: encryptedResponse });
  } catch (error) {
    console.error("Validate referral code error:", error);
    return res.status(200).json({ success: false, message: error.message || "Failed to validate referral code" });
  }
}

async function getOrCreateReferralCode(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ success: false, message: "Valid userId is required" });
    }
    await referralService.ensureReferralSchema();
    const code = await referralService.ensureReferralCodeForUser(userId);
    const encryptedResponse = encrypt({ referralCode: code });
    return res.status(200).json({ success: true, data: encryptedResponse });
  } catch (error) {
    console.error("Get referral code error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch referral code" });
  }
}

module.exports = {
  getReferralSummary,
  validateReferralCode,
  getOrCreateReferralCode,
};
