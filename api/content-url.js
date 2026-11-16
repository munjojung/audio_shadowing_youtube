// Public signed media URLs for published content registered in Neon.
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getPool } = require('../lib/db');

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const TYPES = Object.freeze({ audio: 'mp3_r2_key', en: 'vtt_en_r2_key', ko: 'vtt_ko_r2_key' });
let client;

function getClient() {
  if (!client) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
    if (![R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY].every(Boolean)) {
      throw new Error('R2 environment variables missing');
    }
    client = new S3Client({
      region: 'auto',
      forcePathStyle: true,
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
    });
  }
  return client;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  if (!ID_PATTERN.test(id) || !Object.hasOwn(TYPES, type)) {
    return res.status(400).json({ error: 'Unsupported content' });
  }
  try {
    const result = await getPool().query(`
      SELECT m.mp3_r2_key, m.vtt_en_r2_key, m.vtt_ko_r2_key
      FROM contents c
      JOIN content_media m ON m.content_id = c.id
      WHERE c.id = $1 AND c.status = 'published'
      LIMIT 1
    `, [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Content not available' });

    const key = result.rows[0][TYPES[type]];
    const suffix = type === 'audio' ? '.mp3' : `_${type}.vtt`;
    if (typeof key !== 'string' ||
        !key.startsWith(`contents/${id}/`) ||
        key.includes('..') ||
        !key.endsWith(suffix)) {
      return res.status(404).json({ error: 'Media not available' });
    }
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) throw new Error('R2 bucket not configured');
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(getClient(), command, { expiresIn: 900 });
    return res.status(200).json({ id, type, url, expiresIn: 900 });
  } catch (error) {
    console.error('R2 signed URL generation failed:', error.message);
    return res.status(500).json({ error: 'Content temporarily unavailable' });
  }
};
