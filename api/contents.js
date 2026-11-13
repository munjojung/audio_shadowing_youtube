// Public catalog only: never return credentials or R2 object keys.
const { contents } = require('../data/content-catalog.json');
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  return res.status(200).json({ contents: contents.map(({ id, title }) => ({ id, title })) });
};
