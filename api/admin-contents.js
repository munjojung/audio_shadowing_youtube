const { getPool } = require('../lib/db');
const { requireAdmin } = require('../lib/admin-auth');

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const STATUSES = new Set(['draft', 'published', 'archived']);

function validMedia(media) {
  return media &&
    ['mp3_r2_key', 'vtt_en_r2_key', 'vtt_ko_r2_key']
      .every(k => typeof media[k] === 'string' &&
        media[k].trim().length > 0);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!await requireAdmin(req, res)) return;

  const pool = getPool();

  try {
    if (req.method === 'GET') {
      const result = await pool.query(`
        SELECT c.*, m.mp3_r2_key, m.vtt_en_r2_key, m.vtt_ko_r2_key
        FROM contents c
        LEFT JOIN content_media m ON m.content_id = c.id
        ORDER BY c.sort_order, c.created_at DESC
        LIMIT 500
      `);

      return res.status(200).json({
        ok: true,
        contents: result.rows
      });
    }

    const body = req.body || {};
    const { id, title, description, status, media } = body;

    if (!ID_PATTERN.test(id || '')) {
      return res.status(400).json({
        error: 'Invalid content ID (11 characters required)'
      });
    }

    if (req.method === 'POST') {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' });
      }

      if (!validMedia(media)) {
        return res.status(400).json({
          error: 'MP3 and both VTT R2 keys are required'
        });
      }

      if (status !== undefined && !STATUSES.has(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
    } else {
      if (title !== undefined &&
          (typeof title !== 'string' || !title.trim())) {
        return res.status(400).json({ error: 'Invalid title' });
      }

      if (description !== undefined && typeof description !== 'string') {
        return res.status(400).json({ error: 'Invalid description' });
      }

      if (status !== undefined && !STATUSES.has(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      if (media !== undefined && !validMedia(media)) {
        return res.status(400).json({ error: 'Invalid media keys' });
      }

      if (!['title', 'description', 'status', 'media']
        .some(k => Object.prototype.hasOwnProperty.call(body, k))) {
        return res.status(400).json({ error: 'No changes provided' });
      }
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (req.method === 'POST') {
        await client.query(`
          INSERT INTO contents
            (id, title, description, status, published_at)
          VALUES ($1, $2, $3, $4,
            CASE WHEN $4 = 'published' THEN now() ELSE NULL END)
        `, [id, title.trim(), description || '', status || 'draft']);

        await client.query(`
          INSERT INTO content_media
            (content_id, mp3_r2_key, vtt_en_r2_key, vtt_ko_r2_key)
          VALUES ($1, $2, $3, $4)
        `, [
          id, media.mp3_r2_key.trim(),
          media.vtt_en_r2_key.trim(),
          media.vtt_ko_r2_key.trim()
        ]);
      } else {
        const updated = await client.query(`
          UPDATE contents
          SET title = COALESCE($2, title),
              description = COALESCE($3, description),
              status = COALESCE($4, status),
              published_at = CASE
                WHEN $4 = 'published' AND published_at IS NULL
                  THEN now()
                ELSE published_at
              END,
              updated_at = now()
          WHERE id = $1
          RETURNING id
        `, [
          id,
          title === undefined ? null : title.trim(),
          description === undefined ? null : description,
          status === undefined ? null : status
        ]);

        if (!updated.rowCount) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Content not found' });
        }

        if (media !== undefined) {
          await client.query(`
            INSERT INTO content_media
              (content_id, mp3_r2_key, vtt_en_r2_key, vtt_ko_r2_key)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (content_id) DO UPDATE SET
              mp3_r2_key = EXCLUDED.mp3_r2_key,
              vtt_en_r2_key = EXCLUDED.vtt_en_r2_key,
              vtt_ko_r2_key = EXCLUDED.vtt_ko_r2_key
          `, [
            id, media.mp3_r2_key.trim(),
            media.vtt_en_r2_key.trim(),
            media.vtt_ko_r2_key.trim()
          ]);
        }
      }

      await client.query('COMMIT');

      return res.status(req.method === 'POST' ? 201 : 200)
        .json({ ok: true, id });
    } catch (error) {
      await client.query('ROLLBACK');

      if (error.code === '23505') {
        return res.status(409).json({ error: 'Content already exists' });
      }

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Content manager API failed:', error.message);

    return res.status(500).json({
      ok: false,
      error: 'Content operation failed'
    });
  }
};
