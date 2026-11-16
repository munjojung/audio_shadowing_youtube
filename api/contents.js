// Public catalog: only published entries with complete media; never expose R2 keys.
const { getPool } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const result = await getPool().query(`
      SELECT c.id, c.title
      FROM contents c
      JOIN content_media m ON m.content_id = c.id
      WHERE c.status = 'published'
        AND NULLIF(TRIM(m.mp3_r2_key), '') IS NOT NULL
        AND NULLIF(TRIM(m.vtt_en_r2_key), '') IS NOT NULL
        AND NULLIF(TRIM(m.vtt_ko_r2_key), '') IS NOT NULL
      ORDER BY c.sort_order, c.id
    `);
    return res.status(200).json({ contents: result.rows });
  } catch (error) {
    console.error('Public content catalog failed:', error.message);
    return res.status(500).json({ error: 'Content catalog temporarily unavailable' });
  }
};
