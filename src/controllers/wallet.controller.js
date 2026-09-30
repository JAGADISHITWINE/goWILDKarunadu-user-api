const walletService = require('../service/wallet.service');

async function getWalletController(req, res) {
  try {
    const authUserId = String(req.user?.id || '').trim();
    let targetUserId = String(req.params?.userId || req.query?.userId || authUserId).trim();

    if (!authUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!targetUserId || targetUserId.toLowerCase() === 'me') {
      targetUserId = authUserId;
    }

    // Only allow users to view their own wallet unless they possess administrative privileges
    if (authUserId.toLowerCase() !== targetUserId.toLowerCase() && req.user?.type !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized to view this wallet' });
    }

    const wallet = await walletService.getWallet(targetUserId);
    return res.status(200).json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet information',
      error: error.message,
    });
  }
}

async function addFundsController(req, res) {
  try {
    // Direct fund additions are strictly restricted to administrators or verified webhooks
    const isAdmin = req.user?.type === 'admin' || req.user?.role === 'super_admin';
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Direct fund credits are restricted to administrative authorization or verified payment webhooks.',
      });
    }

    const userId = req.body?.userId || req.user?.id;
    const amount = parseFloat(req.body?.amount || 0);

    if (!userId || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid userId and positive amount required' });
    }

    const result = await walletService.creditWallet({
      userId,
      amount,
      reason: req.body?.reason || 'Top-up / Deposit',
      referenceId: req.body?.referenceId || 'TOPUP-' + Date.now(),
    });

    const updatedWallet = await walletService.getWallet(userId);

    return res.status(200).json({
      success: true,
      message: 'Funds added successfully',
      data: updatedWallet,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to add funds',
      error: error.message,
    });
  }
}

module.exports = {
  getWalletController,
  addFundsController,
};

