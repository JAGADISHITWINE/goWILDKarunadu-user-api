const db = require('../config/db');
const { createUuid } = require('../utils/id');

async function ensureWalletSchema() {
  // Schema is verified and managed by centralized migration scripts
  return;
}

async function getWallet(userId) {
  await ensureWalletSchema();
  const [rows] = await db.query(
    'SELECT user_id, balance, bonus_balance, currency, updated_at FROM user_wallets WHERE user_id = ? LIMIT 1',
    [userId]
  );

  let wallet = rows[0];
  if (!wallet) {
    // initialize zero-balance wallet
    await db.query('INSERT IGNORE INTO user_wallets (user_id, balance, bonus_balance) VALUES (?, 0.00, 0.00)', [userId]);
    wallet = { user_id: userId, balance: 0.0, bonus_balance: 0.0, currency: 'INR' };
  }

  const [transactions] = await db.query(
    'SELECT id, amount, bonus_amount, transaction_type, reason, reference_id, created_at FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    [userId]
  );

  return {
    balance: parseFloat(wallet.balance) || 0,
    bonusBalance: parseFloat(wallet.bonus_balance) || 0,
    totalUsableBalance: (parseFloat(wallet.balance) || 0) + (parseFloat(wallet.bonus_balance) || 0),
    currency: wallet.currency || 'INR',
    transactions: transactions.map(t => ({
      ...t,
      amount: parseFloat(t.amount),
      bonus_amount: parseFloat(t.bonus_amount),
    })),
  };
}

async function creditWallet({ userId, amount, bonusAmount = 0, reason, referenceId, conn }) {
  const connection = conn || (await db.getConnection());
  let releaseNeeded = !conn;

  try {
    await ensureWalletSchema(connection);

    // Upsert wallet
    await connection.query(`
      INSERT INTO user_wallets (user_id, balance, bonus_balance)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        balance = balance + VALUES(balance),
        bonus_balance = bonus_balance + VALUES(bonus_balance),
        updated_at = NOW()
    `, [userId, amount, bonusAmount]);

    // Insert transaction
    const txId = createUuid();
    await connection.query(`
      INSERT INTO wallet_transactions (id, user_id, amount, bonus_amount, transaction_type, reason, reference_id)
      VALUES (?, ?, ?, ?, 'credit', ?, ?)
    `, [txId, userId, amount, bonusAmount, reason || 'Credit', referenceId || null]);

    return { success: true, txId };
  } finally {
    if (releaseNeeded) connection.release();
  }
}

async function debitWallet({ userId, amount, reason, referenceId, conn }) {
  const connection = conn || (await db.getConnection());
  let releaseNeeded = !conn;

  try {
    await ensureWalletSchema(connection);

    const [rows] = await connection.query(
      'SELECT balance, bonus_balance FROM user_wallets WHERE user_id = ? FOR UPDATE',
      [userId]
    );

    if (!rows || rows.length === 0) {
      throw new Error('Wallet not found');
    }

    const currentBalance = parseFloat(rows[0].balance) || 0;
    const currentBonus = parseFloat(rows[0].bonus_balance) || 0;
    const totalAvailable = currentBalance + currentBonus;

    if (totalAvailable < amount) {
      throw new Error('Insufficient wallet balance');
    }

    // Deduct bonus first, then main balance
    let deductFromBonus = Math.min(currentBonus, amount);
    let deductFromMain = amount - deductFromBonus;

    await connection.query(`
      UPDATE user_wallets
      SET 
        balance = balance - ?,
        bonus_balance = bonus_balance - ?,
        updated_at = NOW()
      WHERE user_id = ?
    `, [deductFromMain, deductFromBonus, userId]);

    const txId = createUuid();
    await connection.query(`
      INSERT INTO wallet_transactions (id, user_id, amount, bonus_amount, transaction_type, reason, reference_id)
      VALUES (?, ?, ?, 0, 'debit', ?, ?)
    `, [txId, userId, amount, reason || 'Debit', referenceId || null]);

    return { success: true, txId };
  } finally {
    if (releaseNeeded) connection.release();
  }
}

module.exports = {
  ensureWalletSchema,
  getWallet,
  creditWallet,
  debitWallet,
};
