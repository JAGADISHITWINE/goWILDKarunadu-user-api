const path = require('path');
const { buildMemoryMulter, processImage, saveProcessedFile } = require('../utils/storageFactory');
const fs = require('fs');

const sharedUploadsRoot = process.env.SHARED_UPLOADS_DIR
  ? path.resolve(process.env.SHARED_UPLOADS_DIR)
  : path.resolve(__dirname, '../../../shared-uploads');

const uploadDir = sharedUploadsRoot;
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(String(file.mimetype || '').toLowerCase());

  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

const memoryMulter = buildMemoryMulter(fileFilter, 5);

function single(fieldName, s3Prefix = 'posts') {
  const middleware = memoryMulter.single(fieldName);
  return (req, res, next) => {
    middleware(req, res, async (err) => {
      if (err) return next(err);
      if (!req.file) return next();
      try {
        const base = path.basename(req.file.originalname || 'post-image', path.extname(req.file.originalname || '')).replace(/\s+/g, '_');
        const filenameBase = `post-${base}-${Date.now()}`;
        const processedBuffer = await processImage(req.file.buffer, { maxWidth: 1200, quality: 75 });
        const saved = await saveProcessedFile({ buffer: processedBuffer, localDir: uploadDir, s3Prefix, filenameBase });
        Object.assign(req.file, saved);
        next();
      } catch (procErr) {
        next(procErr);
      }
    });
  };
}

module.exports = { single };
