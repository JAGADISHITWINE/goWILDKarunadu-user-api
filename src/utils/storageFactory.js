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

function buildMemoryMulter(fileFilter, maxSizeMb = 25) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter,
  });
}

/**
 * Resize + compress image buffer into HD WebP with low memory footprint.
 * - Caps resolution at HD (1920x1080) maintaining aspect ratio
 * - Auto-orients EXIF and strips metadata
 * - Compresses with WebP quality 82 for crystal clear HD fidelity at low KB
 */
async function processImage(buffer, { maxWidth = 1920, maxHeight = 1080, quality = 82 } = {}) {
  return sharp(buffer)
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality,
      effort: 4,
      smartSubsample: true,
    })
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
    const customDomain = (process.env.CUSTOM_CDN_URL || process.env.CLOUDFRONT_URL || process.env.S3_CUSTOM_DOMAIN || '').trim().replace(/\/+$/, '');
    const storedUrl = customDomain
      ? `${customDomain}/${key}`
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
