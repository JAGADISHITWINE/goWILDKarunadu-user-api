const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const authRoutes = require('./src/routes/auth.routes');
require('dotenv').config();

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
});

// Capture raw request body (for webhook signature verification) while still
// letting express.json/urlencoded parse the body.
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf && buf.toString(); } }));
app.use(express.urlencoded({ extended: true, verify: (req, res, buf) => { req.rawBody = buf && buf.toString(); } }));

// Simple request logger to help diagnose hanging requests
app.use((req, res, next) => {
  try {
    console.log(`[REQ] ${req.method} ${req.originalUrl} - from ${req.ip}`);
  } catch (e) {
    // ignore logging errors
  }
  next();
});

const defaultAllowedOrigins = [
  'http://localhost:4200',
  'http://localhost:4600',
  'http://localhost:4700',
  'http://localhost:8100',
  'http://127.0.0.1:4200',
  'http://127.0.0.1:4600',
  'http://127.0.0.1:4700',
  'http://127.0.0.1:8100',
  'https://gowildkarunadu.online',
  'https://www.gowildkarunadu.online',
  'https://admin.gowildkarunadu.online',
];

const allowedOrigins = Array.from(
  new Set(
    [
      ...(process.env.CORS_ORIGINS || '').split(','),
      ...defaultAllowedOrigins,
    ]
      .map((origin) => origin.trim())
      .filter(Boolean)
  )
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(
          new Error('The CORS policy for this site does not allow access from the specified origin.'),
          false
        );
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use('/api/auth', apiLimiter);
app.use('/api/auth', authRoutes);

const sharedUploadsRoot = process.env.SHARED_UPLOADS_DIR
  ? path.resolve(process.env.SHARED_UPLOADS_DIR)
  : path.resolve(__dirname, '../shared-uploads');
app.use('/uploads', express.static(sharedUploadsRoot));

app.get('/', (req, res) => {
  res.send('Server is running...');
});

module.exports = app;
