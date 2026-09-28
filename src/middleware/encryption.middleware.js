const { encrypt, decrypt } = require('../service/cryptoHelper');

const IS_ENCRYPTION_ENABLED = process.env.ENABLE_PAYLOAD_ENCRYPTION !== 'false';

// Endpoints that MUST stay unencrypted
const EXCLUDED_EXACT_PATHS = [
  '/',
  '/health'
];

function isExcluded(req) {
  const path = req.path || '';
  const originalUrl = req.originalUrl || '';

  if (EXCLUDED_EXACT_PATHS.includes(path) || EXCLUDED_EXACT_PATHS.includes(originalUrl)) {
    return true;
  }

  // Static uploads, webhooks (Razorpay / payment provider HMAC checks), receipts, certificates, tax invoices
  if (
    path.startsWith('/uploads') ||
    originalUrl.startsWith('/uploads') ||
    path.includes('/webhook') ||
    originalUrl.includes('/webhook') ||
    path.includes('/receipt') ||
    path.includes('/tax-invoice') ||
    path.includes('/summit-certificate') ||
    path.includes('/pdf')
  ) {
    return true;
  }

  if (req.headers['x-skip-encryption'] === 'true') {
    return true;
  }

  return false;
}

/**
 * Transparent Request/Response Encryption Middleware for Express
 */
function encryptionMiddleware(req, res, next) {
  // If globally disabled via env flag, or path is excluded, pass through
  if (!IS_ENCRYPTION_ENABLED || isExcluded(req)) {
    return next();
  }

  // 1. INCOMING REQUEST DECRYPTION
  if (req.body && typeof req.body === 'object') {
    if ('encryptedPayload' in req.body && typeof req.body.encryptedPayload === 'string') {
      const rawEncrypted = req.body.encryptedPayload;
      const decrypted = decrypt(rawEncrypted);
      if (decrypted !== null && typeof decrypted === 'object') {
        req.body = decrypted;
        // Non-enumerable fallback so legacy controllers checking req.body.encryptedPayload do not break
        try {
          Object.defineProperty(req.body, 'encryptedPayload', {
            value: rawEncrypted,
            enumerable: false,
            writable: true,
            configurable: true
          });
        } catch (_) {}
      } else if (decrypted !== null) {
        req.body = decrypted;
      }
    }
  }

  // 2. OUTGOING RESPONSE ENCRYPTION
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    if (!IS_ENCRYPTION_ENABLED || isExcluded(req) || res.getHeader('X-Skip-Encryption')) {
      return originalJson(body);
    }

    // Do not encrypt binary buffers or streams
    if (Buffer.isBuffer(body)) {
      return originalJson(body);
    }

    // Check if the response is already in { encryptedPayload: ... } format to prevent double-encryption
    if (body && typeof body === 'object' && 'encryptedPayload' in body && typeof body.encryptedPayload === 'string') {
      res.setHeader('X-Payload-Encrypted', 'true');
      return originalJson(body);
    }

    // Check if controller already returned legacy encrypted envelope { success: true, data: '<ciphertext>' } or { data: '<ciphertext>' }
    if (body && typeof body === 'object' && 'data' in body && typeof body.data === 'string' && body.data.startsWith('U2FsdGVkX1')) {
      res.setHeader('X-Payload-Encrypted', 'true');
      return originalJson(body);
    }

    try {
      const ciphertext = encrypt(body);
      res.setHeader('X-Payload-Encrypted', 'true');
      return originalJson({ encryptedPayload: ciphertext });
    } catch (err) {
      return originalJson(body);
    }
  };

  next();
}

module.exports = { encryptionMiddleware };
