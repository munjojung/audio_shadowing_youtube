// Vercel Node.js Function. Only pre-approved, publicly shareable learning content.
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const CONTENTS = Object.freeze({
  TSIgstxOCwY: 'be_in_a_funk_be_bummed_out_TSIgstxOCwY'
});
const TYPES = Object.freeze({ audio: '.mp3', en: '_en.vtt', ko: '_ko.vtt' });
let client;
function getClient() {
  if (!client) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
    if (![R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY].every(Boolean)) throw new Error('R2 environment variables missing');
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
    });
  }
  return client;
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  if (!Object.hasOwn(CONTENTS, id) || !Object.hasOwn(TYPES, type)) return res.status(400).json({ error: 'Unsupported content' });
  try {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) throw new Error('R2 bucket not configured');
    const key = `contents/${id}/${CONTENTS[id]}${TYPES[type]}`;
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(getClient(), command, { expiresIn: 900 });
    return res.status(200).json({ id, type, url, expiresIn: 900 });
  } catch (error) {
    console.error('R2 signed URL generation failed:', error.message);
    return res.status(500).json({ error: 'Content temporarily unavailable' });
  }
};
