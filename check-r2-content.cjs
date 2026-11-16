const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

const id = 'DLDHUZh2FqA';
const required = [
  'R2_ACCOUNT_ID',
  'R2_BUCKET_NAME',
  'R2_UPLOAD_ACCESS_KEY_ID',
  'R2_UPLOAD_SECRET_ACCESS_KEY'
];

for (const name of required) {
  if (!process.env[name]) {
    console.error('MISSING:', name);
    process.exit(1);
  }
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_UPLOAD_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_UPLOAD_SECRET_ACCESS_KEY
  },
  forcePathStyle: true
});

const keys = [
  `contents/${id}/${id}.mp3`,
  `contents/${id}/${id}_ko.vtt`,
  `contents/${id}/${id}_en.vtt`,
  `contents/${id}/lesson_${id}.mp3`,
  `contents/${id}/lesson_${id}_ko.vtt`,
  `contents/${id}/lesson_${id}_en.vtt`
];

(async () => {
  for (const Key of keys) {
    try {
      const result = await client.send(new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key
      }));
      console.log('EXISTS:', Key, result.ContentLength, 'bytes');
    } catch (error) {
      if (
        error.$metadata?.httpStatusCode === 404 ||
        error.name === 'NotFound' ||
        error.name === 'NoSuchKey'
      ) {
        console.log('NOT FOUND:', Key);
      } else {
        console.error('CHECK FAILED:', Key, error.name, error.message);
        process.exitCode = 1;
      }
    }
  }
})();
