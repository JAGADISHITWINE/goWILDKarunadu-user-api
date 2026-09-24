const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');                         // ← was missing
const UserModel = require('../models/User');
const { encrypt, decrypt } = require('../service/cryptoHelper');
require('dotenv').config();
const emailService = require('../service/emailService');

async function login(req, res) {
  try {
    const decryptedBody = decrypt(req.body.encryptedPayload);
    if (!decryptedBody) {
      return res.status(400).json({ response: false, message: 'Invalid request format' });
    }

    const { email, password } = decryptedBody;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPassword = String(password || '');

    if (!normalizedEmail || !normalizedPassword) {
      return res.status(400).json({ response: false, message: 'Email and password are required' });
    }

    const user = await UserModel.findUser(normalizedEmail);
    if (!user) {
      return res.status(401).json({ response: false, message: 'User not found' });
    }

    const isValid = await UserModel.validatePassword(normalizedPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ response: false, message: 'Invalid credentials' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET not set in environment');
      return res.status(500).json({ response: false, message: 'Server misconfiguration' });
    }

    const token = jwt.sign(
      {
        id:    user.id,
        name:  user.full_name,
        email: user.email,
        phone: user.phone_number
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    await UserModel.saveToken(user.id, token);

    const encryptedResponse = encrypt({ response: true, message: 'Login successful', token });

    return res.status(200).json({ data: encryptedResponse });

  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ response: false, message: 'Something went wrong.' });
  }
}


// ─────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────
async function register(req, res) {
  try {
    const decryptedBody = decrypt(req.body.encryptedPayload);
    if (!decryptedBody) {
      return res.status(400).json({ response: false, message: 'Invalid request format' });
    }
    const { name, email, phone, password } = decryptedBody;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim();

    if (!name || !normalizedEmail || !normalizedPhone || !password) {
      return res.status(400).json({ response: false, message: 'All registration fields are required' });
    }

    const exists = await UserModel.findUser(normalizedEmail);
    if (exists) {
      return res.status(409).json({ response: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET not set in environment');
      return res.status(500).json({ response: false, message: 'Server misconfiguration' });
    }

    const id = await UserModel.registerUser({
      name,
      email: normalizedEmail,
      phone: normalizedPhone,
      password: hashedPassword,
      is_active: 1
    });

    // ← Fix: use local variables, not undefined `user`
    const token = jwt.sign(
      { id, name, email: normalizedEmail, phone: normalizedPhone },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    await UserModel.saveToken(id, token);

    const encryptedResponse = encrypt({ response: true, message: 'Registration successful', token });
    return res.status(201).json({ data: encryptedResponse });

  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({ response: false, message: 'Registration failed' });
  }
}


// ─────────────────────────────────────────────
// POST /api/auth/forgot-password
// ─────────────────────────────────────────────
async function forgotPassword(req, res) {
  try {
    const payload = req.body?.encryptedPayload ? decrypt(req.body.encryptedPayload) : req.body;
    const { email } = payload || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ response: false, message: 'Email is required' });
    }

    const user = await UserModel.findUser(normalizedEmail);

    // Return same response whether user exists or not (prevents email enumeration)
    if (!user) {
      return res.status(200).json({
        response: true,
        message: 'If this email is registered, you will receive a reset link shortly.',
      });
    }

    // Generate raw token → send in email
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Hash token → store in DB (so raw token in email is useless if DB is breached)
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Expiry: 1 hour from now
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await UserModel.saveResetToken(user.id, hashedToken, expires);

    const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;

    await emailService.sendPasswordResetEmail(user.email, resetLink, user.full_name);

    const encryptedResponse = encrypt({
      response: true,
      message: 'If this email is registered, you will receive a reset link shortly.',
    });

    return res.status(200).json({ data: encryptedResponse });

  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ response: false, message: 'Internal server error' });
  }
}


async function resetPassword(req, res) {
  try {
    const payload = req.body?.encryptedPayload ? decrypt(req.body.encryptedPayload) : req.body;
    const { token, password } = payload || {};

    if (!token || !password) {
      return res.status(400).json({ response: false, message: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ response: false, message: 'Password must be at least 6 characters' });
    }

    // Hash the raw token from the URL to compare against DB
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid (non-expired) token
    const user = await UserModel.findUserByResetToken(hashedToken);

    if (!user) {
      return res.status(400).json({
        response: false,
        message: 'Invalid or expired reset token. Please request a new one.',
      });
    }

    const salt          = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update password + clear token columns in one query
    await UserModel.updatePassword(user.id, hashedPassword);

    const encryptedResponse = encrypt({
      response: true,
      message: 'Password has been reset successfully. You can now log in.',
    });

    return res.status(200).json({ data: encryptedResponse });

  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ response: false, message: 'Internal server error' });
  }
}


async function validateResetToken(req, res) {
  try {
    const payload = req.body?.encryptedPayload ? decrypt(req.body.encryptedPayload) : req.body;
    const { token } = payload || {};

    if (!token) {
      return res.status(400).json({ response: false, message: 'Token is required' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await UserModel.findUserByResetToken(hashedToken);

    if (!user) {
      return res.status(400).json({ response: false, message: 'Invalid or expired token' });
    }

    const encryptedResponse = encrypt({ response: true, message: 'Token is valid' });
    return res.status(200).json({ data: encryptedResponse });

  } catch (error) {
    console.error('Validate token error:', error);
    return res.status(500).json({ response: false, message: 'Internal server error' });
  }
}

async function sendOtp(req, res) {
  try {
    const payload = req.body?.encryptedPayload ? decrypt(req.body.encryptedPayload) : req.body;
    const { email, phone } = payload || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim();

    if (!normalizedEmail || !normalizedPhone) {
      return res.status(400).json({ response: false, message: 'Email and Phone Number are required' });
    }

    // Check if email already registered
    const exists = await UserModel.findUsermailAndNumber(normalizedEmail, normalizedPhone);
    if (exists) {
      return res.status(409).json({ response: false, message: 'Email and Phone Number are already registered' });
    }

    // Generate 6-digit OTP
    const otp = String(crypto.randomInt(100000, 1000000));
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await UserModel.saveOtp(normalizedEmail, otp, expires);
    void emailService.sendOtpEmail(normalizedEmail, otp).catch((mailError) => {
      console.error('OTP email delivery failed:', mailError);
    });

    const encryptedResponse = encrypt({
      response: true,
      message: 'OTP request received. Please check your email shortly.'
    });

    return res.status(200).json({ data: encryptedResponse });

  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ response: false, message: 'Failed to send OTP' });
  }
}

async function verifyOtp(req, res) {
  try {
    const payload = req.body?.encryptedPayload ? decrypt(req.body.encryptedPayload) : req.body;
    const { email, otp } = payload || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedOtp = String(otp || '').trim();

    if (!normalizedEmail || !normalizedOtp) {
      return res.status(400).json({ response: false, message: 'Email and OTP are required' });
    }

    const record = await UserModel.findOtp(normalizedEmail);

    if (!record) {
      return res.status(400).json({ response: false, message: 'OTP expired. Please request a new one.' });
    }

    if (record.otp_code !== normalizedOtp) {
      return res.status(400).json({ response: false, message: 'Invalid OTP. Please try again.' });
    }

    // OTP matched — delete it so it can't be reused
    await UserModel.deleteOtp(normalizedEmail);

    const encryptedResponse = encrypt({
      response: true,
      message: 'Email verified successfully!'
    });

    return res.status(200).json({ data: encryptedResponse });

  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ response: false, message: 'Internal server error' });
  }
}

module.exports = { login, register, forgotPassword, resetPassword, validateResetToken, sendOtp, verifyOtp  };
