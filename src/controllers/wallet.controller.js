const walletService = require('../service/wallet.service');

async function getWalletController(req, res) {
  try {
    const userId = req.user?.id || req.params?.userId || req.query?.userId;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const wallet = await walletService.getWallet(userId);
    return res.status(200).json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet information',
      error: error.message,
    });
  }
}

async function addFundsController(req, res) {
  try {
    const userId = req.user?.id || req.body?.userId;
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
    console.error('Add funds error:', error);
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
