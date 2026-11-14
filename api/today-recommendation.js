const { getPool } = require('../lib/db');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function seoulToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}
function dayIndex(date) {
  return Date.parse(`${date}T00:00:00Z`) / 86400000;
}
function unavailable(res, date, reason) {
  return res.status(200).json({ ok: true, date, available: false, reason });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Public endpoint: do not accept a date parameter, to avoid exposing future overrides.
  const date = seoulToday();
  if (!validDate(date)) return res.status(500).json({ ok: false, error: 'Invalid server date' });
  try {
    const pool = getPool();
    const history = await pool.query(`
      SELECT h.content_id, c.title, h.selection_type, h.guide_version
      FROM daily_content_history h
      JOIN contents c ON c.id = h.content_id
      WHERE h.learning_date = $1::date
      LIMIT 1
    `, [date]);

    let chosen;
    let source;
    let guideVersion = null;
    let confirmed = false;

    if (history.rowCount) {
      const h = history.rows[0];
      chosen = { id: h.content_id, title: h.title };
      source = h.selection_type;
      guideVersion = h.guide_version;
      confirmed = true;
    } else {
      const override = await pool.query(`
        SELECT o.content_id, c.title
        FROM daily_schedule_overrides o
        JOIN contents c ON c.id = o.content_id
        WHERE o.learning_date = $1::date
        LIMIT 1
      `, [date]);
      if (override.rowCount) {
        chosen = { id: override.rows[0].content_id, title: override.rows[0].title };
        source = 'manual';
      } else {
        const schedules = await pool.query(`
          SELECT id, mode, to_char(start_date, 'YYYY-MM-DD') AS start_date, interval_days
          FROM learning_schedules
          WHERE enabled = true
          ORDER BY id DESC LIMIT 1
        `);
        if (!schedules.rowCount) return unavailable(res, date, 'no_active_schedule');
        const schedule = schedules.rows[0];
        const elapsed = dayIndex(date) - dayIndex(schedule.start_date);
        if (!Number.isInteger(elapsed) || elapsed < 0) return unavailable(res, date, 'schedule_not_started');

        const contents = await pool.query(`
          SELECT c.id, c.title
          FROM schedule_contents sc
          JOIN contents c ON c.id = sc.content_id
          WHERE sc.schedule_id = $1 AND c.status = 'published'
          ORDER BY sc.position
        `, [schedule.id]);
        if (!contents.rowCount) return unavailable(res, date, 'no_published_contents');
        const step = schedule.mode === 'rotation' ? 1 : schedule.mode === 'weekly' ? 7 : Number(schedule.interval_days);
        if (!Number.isSafeInteger(step) || step < 1) throw new Error('Invalid schedule interval');
        chosen = contents.rows[Math.floor(elapsed / step) % contents.rows.length];
        source = schedule.mode;
      }

      // The current published guide is informational until the day is confirmed.
      const guide = await pool.query(`
        SELECT version FROM study_guides
        WHERE content_id = $1 AND status = 'published'
        ORDER BY version DESC LIMIT 1
      `, [chosen.id]);
      guideVersion = guide.rowCount ? guide.rows[0].version : null;
    }

    return res.status(200).json({
      ok: true, date, available: true,
      content_id: chosen.id, title: chosen.title,
      source, confirmed, guide_version: guideVersion
    });
  } catch (err) {
    console.error('Today recommendation failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Recommendation temporarily unavailable' });
  }
};
