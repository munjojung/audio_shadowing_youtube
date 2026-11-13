// Run locally with a SEPARATE, write-scoped R2 API token. Never commit credentials.
const fs = require('node:fs');
const path = require('node:path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const catalogPath = path.join(__dirname, '../data/content-catalog.json');
const [id, audioPath, koPath, enPath, ...rest] = process.argv.slice(2);
const title = rest.join(' ').trim();
if (!/^[A-Za-z0-9_-]{11}$/.test(id || '') || !audioPath || !koPath || !enPath || !title) {
  console.error('Usage: node scripts/register-content.js <11-char-ID> <audio.mp3> <ko.vtt> <en.vtt> <title>'); process.exit(2);
}
function requireFile(file, suffix) { if (!fs.existsSync(file) || !file.toLowerCase().endsWith(suffix)) throw Error(`Invalid file: ${file}`); }
(async () => {
  requireFile(audioPath, '.mp3'); requireFile(koPath, '.vtt'); requireFile(enPath, '.vtt');
  const base = path.basename(audioPath, '.mp3');
  if (!base.endsWith('_' + id) || path.basename(koPath) !== base + '_ko.vtt' || path.basename(enPath) !== base + '_en.vtt') throw Error('Filename/ID mismatch');
  const { R2_ACCOUNT_ID, R2_UPLOAD_ACCESS_KEY_ID, R2_UPLOAD_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (![R2_ACCOUNT_ID, R2_UPLOAD_ACCESS_KEY_ID, R2_UPLOAD_SECRET_ACCESS_KEY, R2_BUCKET_NAME].every(Boolean)) throw Error('Missing upload-only R2 environment variables');
  const client = new S3Client({ region: 'auto', endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: R2_UPLOAD_ACCESS_KEY_ID, secretAccessKey: R2_UPLOAD_SECRET_ACCESS_KEY } });
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (catalog.contents.some(item => item.id === id)) throw Error('ID already published. Refusing overwrite.');
  const objects = [[audioPath, '.mp3', 'audio/mpeg'], [koPath, '_ko.vtt', 'text/vtt; charset=utf-8'], [enPath, '_en.vtt', 'text/vtt; charset=utf-8']];
  for (const [file, suffix, contentType] of objects) {
    const key = `contents/${id}/${base}${suffix}`;
    try { await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })); throw Error(`Object already exists: ${key}`); }
    catch (error) { if (!['NotFound', 'NoSuchKey'].includes(error.name) && error.$metadata?.httpStatusCode !== 404) throw error; }
    await client.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: fs.createReadStream(file), ContentType: contentType }));
    console.log('Uploaded:', key);
  }
  catalog.contents.push({ id, base, title });
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  console.log('Published locally. Commit data/content-catalog.json and push to deploy.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
