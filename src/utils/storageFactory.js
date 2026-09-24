const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const STORAGE_MODE = (process.env.STORAGE_MODE || 'local').toLowerCase();

let s3Client;
if (STORAGE_MODE === 's3') {
  s3Client = new S3Client({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
}

function buildMemoryMulter(fileFilter, maxSizeMb = 5) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter,
  });
}

async function processImage(buffer, { maxWidth = 1600, quality = 75 } = {}) {
  return sharp(buffer)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

async function saveProcessedFile({ buffer, localDir, s3Prefix, filenameBase }) {
  const filename = `${filenameBase}.webp`;

  if (STORAGE_MODE === 's3') {
    const key = `${s3Prefix}/${filename}`.replace(/^\/+/, '');
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET || process.env.AWS_S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: 'image/webp',
      })
    );
    const storedUrl = process.env.CLOUDFRONT_URL
      ? `${process.env.CLOUDFRONT_URL.replace(/\/$/, '')}/${key}`
      : `https://${process.env.S3_BUCKET || process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}`;
    return { filename, storedUrl, key };
  }

  // local
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
  const fullPath = path.join(localDir, filename);
  fs.writeFileSync(fullPath, buffer);
  return { filename, storedUrl: `/uploads/${filename}`, path: fullPath };
}

module.exports = {
  buildMemoryMulter,
  processImage,
  saveProcessedFile,
  STORAGE_MODE,
};
