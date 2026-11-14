const { getPool } = require('../lib/db');
const { requireAdmin } = require('../lib/admin-auth');

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const id = req.query.id;

      if (!ID_PATTERN.test(id || '')) {
        return res.status(400).json({ error: 'Invalid content ID' });
      }

      const result = await getPool().query(`
        SELECT id, content_id, version, status, payload,
               created_at, published_at
        FROM study_guides
        WHERE content_id = $1
        ORDER BY version DESC
      `, [id]);

      return res.status(200).json({
        ok: true,
        guides: result.rows
      });
    }

    const { contentId, payload, publish = false } = req.body || {};

    if (!ID_PATTERN.test(contentId || '') ||
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        payload.contentId !== contentId ||
        !Array.isArray(payload.sections) ||
        typeof publish !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid Study Guide payload'
      });
    }

    const client = await getPool().connect();

    try {
      await client.query('BEGIN');

      // Serialize guide version creation for this content.
      const content = await client.query(
        'SELECT id FROM contents WHERE id = $1 FOR UPDATE',
        [contentId]
      );

      if (!content.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Content not found' });
      }

      const next = await client.query(`
        SELECT COALESCE(MAX(version), 0) + 1 AS version
        FROM study_guides
        WHERE content_id = $1
      `, [contentId]);

      const version = Number(next.rows[0].version);

      if (publish) {
        await client.query(`
          UPDATE study_guides
          SET status = 'draft'
          WHERE content_id = $1 AND status = 'published'
        `, [contentId]);
      }

      await client.query(`
        INSERT INTO study_guides
          (content_id, version, status, payload, published_at)
        VALUES ($1, $2, $3, $4::jsonb,
          CASE WHEN $3 = 'published' THEN now() ELSE NULL END)
      `, [
        contentId,
        version,
        publish ? 'published' : 'draft',
        JSON.stringify(payload)
      ]);

      await client.query('COMMIT');

      return res.status(201).json({
        ok: true,
        contentId,
        version,
        status: publish ? 'published' : 'draft'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Study Guide API failed:', error.message);

    return res.status(500).json({
      ok: false,
      error: 'Study Guide operation failed'
    });
  }
};
