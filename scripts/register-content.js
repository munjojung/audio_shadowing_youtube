'use strict';

const {
  buildObjectKeys,
  inspectR2Objects,
  assertNewRegistrationAllowed
} = require('./r2-upload-state');

// Shadowing Player Pro - R2 Content Registration
// Run locally with a separate, write-scoped R2 API token.
// Never commit credentials.

const {
  validateContentInfo,
  validateFiles
} = require('./content-validator');
const { calculateSha256 } = require('./r2-integrity');
const fs = require('node:fs');
const path = require('node:path');

const {
  S3Client,
  PutObjectCommand
} = require('@aws-sdk/client-s3');

const catalogPath = path.join(
  __dirname,
  '../data/content-catalog.json'
);

// Usage:
// node scripts/register-content.js <11-char-ID> <audio.mp3> <ko.vtt> <en.vtt> <title>

const [id, audioPath, koPath, enPath, ...rest] =
  process.argv.slice(2);

const title = rest.join(' ').trim();

if (
  !/^[A-Za-z0-9_-]{11}$/.test(id || '') ||
  !audioPath ||
  !koPath ||
  !enPath ||
  !title
) {
  console.error(
    'Usage: node scripts/register-content.js ' +
    '<11-char-ID> <audio.mp3> <ko.vtt> <en.vtt> <title>'
  );
  process.exit(2);
}

function requireFile(file, suffix) {
  if (
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile() ||
    !file.toLowerCase().endsWith(suffix)
  ) {
    throw new Error(`Invalid file: ${file}`);
  }
}

async function main() {
  // 1. Validate local files
  requireFile(audioPath, '.mp3');
  requireFile(koPath, '.vtt');
  requireFile(enPath, '.vtt');

  const base = path.basename(audioPath, '.mp3');

  if (
    !base.endsWith('_' + id) ||
    path.basename(koPath) !== base + '_ko.vtt' ||
    path.basename(enPath) !== base + '_en.vtt'
  ) {
    throw new Error('Filename/ID mismatch');
  }

  // Stage 4-B: validate before any R2 operation.
  validateContentInfo(id, title, base);
  const validation = validateFiles(
    id, audioPath, koPath, enPath
  );
  console.log(
    'Pre-upload validation passed:',
    JSON.stringify(validation)
  );
  // 2. Read upload-only R2 credentials
  const {
    R2_ACCOUNT_ID,
    R2_UPLOAD_ACCESS_KEY_ID,
    R2_UPLOAD_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME
  } = process.env;

  if (
    ![
      R2_ACCOUNT_ID,
      R2_UPLOAD_ACCESS_KEY_ID,
      R2_UPLOAD_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME
    ].every(Boolean)
  ) {
    throw new Error(
      'Missing upload-only R2 environment variables'
    );
  }

  // 3. Configure Cloudflare R2
  const client = new S3Client({
    region: 'auto',
    endpoint:
      `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

    // Required for path-style R2 bucket URLs
    forcePathStyle: true,

    credentials: {
      accessKeyId: R2_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: R2_UPLOAD_SECRET_ACCESS_KEY
    }
  });

  // 4. Read content catalog
  const catalog = JSON.parse(
    fs.readFileSync(catalogPath, 'utf8')
  );

  if (!Array.isArray(catalog.contents)) {
    throw new Error('Invalid content catalog format');
  }

  // Prevent publishing duplicate content IDs
  if (catalog.contents.some(item => item.id === id)) {
    throw new Error(
      'ID already published. Refusing overwrite.'
    );
  }

  // 5. Prepare R2 objects
  const objects = [
    [audioPath, '.mp3', 'audio/mpeg'],
    [koPath, '_ko.vtt', 'text/vtt; charset=utf-8'],
    [enPath, '_en.vtt', 'text/vtt; charset=utf-8']
  ];

  // 6. Inspect destination objects before uploading.
  const keys = buildObjectKeys(id, base);

  const r2State = await inspectR2Objects(
    client,
    R2_BUCKET_NAME,
    keys
  );

  console.log('R2 object state:', r2State.state);

  assertNewRegistrationAllowed(r2State);
  // 7. Upload MP3 and subtitle files
  for (const [file, suffix, contentType] of objects) {
    const key = `contents/${id}/${base}${suffix}`;

    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: fs.createReadStream(file),
        ContentLength: fs.statSync(file).size,
        ContentType: contentType,
        Metadata: {
          sha256: await calculateSha256(file)
        }
      })
    );

    console.log('Uploaded:', key);
  }

  // 8. Update local content catalog
  catalog.contents.push({
    id,
    base,
    title
  });

  fs.writeFileSync(
    catalogPath,
    JSON.stringify(catalog, null, 2) + '\n',
    'utf8'
  );

  console.log(
    'Published locally. Commit data/content-catalog.json ' +
    'and push to deploy.'
  );
}

main().catch(error => {
  console.error('Registration failed:', error.message);
  process.exitCode = 1;
});
