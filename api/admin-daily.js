'use strict';
const { getPool } = require('../lib/db');
const { requireAdmin } = require('../lib/admin-auth');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{11}$/;
const iso = d => d.toISOString().slice(0, 10);
function validDate(s) { if (typeof s !== 'string' || !DATE.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && iso(d) === s; }
function todaySeoul() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
const fail = (res, status, error) => res.status(status).json({ ok: false, error });
async function selectForDay(client, date, scheduleId) {
  const history = await client.query(`SELECT h.content_id, c.title, h.selection_type, h.guide_version
    FROM daily_content_history h JOIN contents c ON c.id=h.content_id WHERE h.learning_date=$1::date`, [date]);
  if (history.rowCount) return { content_id: history.rows[0].content_id, title: history.rows[0].title, source: 'history', selection_type: history.rows[0].selection_type, guide_version: history.rows[0].guide_version, finalized: true };
  const override = await client.query(`SELECT o.content_id,c.title,o.note FROM daily_schedule_overrides o JOIN contents c ON c.id=o.content_id WHERE o.learning_date=$1::date`, [date]);
  if (override.rowCount) return { content_id: override.rows[0].content_id, title: override.rows[0].title, source: 'manual', note: override.rows[0].note, finalized: false };
  const schedule = await client.query(`SELECT id,mode,start_date,interval_days,enabled FROM learning_schedules WHERE id=$1`, [scheduleId]);
  if (!schedule.rowCount) return { error: 'Schedule not found', status: 404 };
  const s = schedule.rows[0];
  if (!s.enabled) return { content_id: null, source: 'none', finalized: false };
  const items = await client.query(`SELECT c.id,c.title FROM schedule_contents sc JOIN contents c ON c.id=sc.content_id WHERE sc.schedule_id=$1 AND c.status='published' ORDER BY sc.position`, [scheduleId]);
  const first = typeof s.start_date === 'string' ? s.start_date.slice(0,10) : iso(s.start_date);
  const elapsed = Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(first+'T00:00:00Z'))/86400000);
  if (elapsed < 0 || !items.rowCount) return { content_id: null, source: 'none', finalized: false };
  const step = s.mode === 'rotation' ? 1 : s.mode === 'weekly' ? 7 : s.interval_days;
  const item = items.rows[Math.floor(elapsed / step) % items.rowCount];
  return { content_id: item.id, title: item.title, source: s.mode, finalized: false };
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','POST','DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, DELETE'); return fail(res,405,'Method not allowed'); }
  if (!requireAdmin(req,res)) return;
  const client = await getPool().connect();
  try {
    if (req.method === 'GET') {
      const date = req.query.date || todaySeoul();
      const scheduleId = Number(req.query.scheduleId || 1);
      if (!validDate(date) || !Number.isSafeInteger(scheduleId) || scheduleId < 1) return fail(res,400,'Invalid date or schedule ID');
      const selection = await selectForDay(client,date,scheduleId);
      if (selection.error) return fail(res,selection.status,selection.error);
      const contents = await client.query(`SELECT id,title FROM contents WHERE status='published' ORDER BY sort_order,id`);
      return res.json({ok:true,date,scheduleId,selection,contents:contents.rows});
    }
    const body = req.body || {};
    const date = body.date;
    if (!validDate(date)) return fail(res,400,'Invalid date');
    await client.query('BEGIN');
    // A date-scoped lock prevents override/finalize races across concurrent requests.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['shadowing-daily:'+date]);
    const existing = await client.query('SELECT content_id FROM daily_content_history WHERE learning_date=$1::date',[date]);
    if (req.method === 'DELETE' || body.action === 'clearOverride') {
      if (existing.rowCount) { await client.query('ROLLBACK'); return fail(res,409,'Date already finalized; override cannot change'); }
      await client.query('DELETE FROM daily_schedule_overrides WHERE learning_date=$1::date',[date]);
      await client.query('COMMIT'); return res.json({ok:true,date,cleared:true});
    }
    if (body.action === 'override') {
      if (existing.rowCount) { await client.query('ROLLBACK'); return fail(res,409,'Date already finalized; override cannot change'); }
      if (typeof body.contentId !== 'string' || !ID.test(body.contentId)) { await client.query('ROLLBACK'); return fail(res,400,'Invalid content ID'); }
      const content = await client.query("SELECT id FROM contents WHERE id=$1 AND status='published'",[body.contentId]);
      if (!content.rowCount) { await client.query('ROLLBACK'); return fail(res,400,'Content must be published'); }
      const note = typeof body.note === 'string' ? body.note.trim().slice(0,1000) : '';
      await client.query(`INSERT INTO daily_schedule_overrides(learning_date,content_id,note,updated_at) VALUES($1::date,$2,$3,now()) ON CONFLICT(learning_date) DO UPDATE SET content_id=EXCLUDED.content_id,note=EXCLUDED.note,updated_at=now()`,[date,body.contentId,note]);
      await client.query('COMMIT'); return res.json({ok:true,date,content_id:body.contentId,source:'manual'});
    }
    if (body.action !== 'finalize') { await client.query('ROLLBACK'); return fail(res,400,'Unknown action'); }
    if (existing.rowCount) { await client.query('ROLLBACK'); return fail(res,409,'Date already finalized; history is immutable'); }
    const scheduleId = Number(body.scheduleId || 1);
    if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) { await client.query('ROLLBACK'); return fail(res,400,'Invalid schedule ID'); }
    const selection = await selectForDay(client,date,scheduleId);
    if (selection.error) { await client.query('ROLLBACK'); return fail(res,selection.status,selection.error); }
    if (!selection.content_id) { await client.query('ROLLBACK'); return fail(res,400,'No recommendation for this date'); }
    const published = await client.query("SELECT id FROM contents WHERE id=$1 AND status='published'",[selection.content_id]);
    if (!published.rowCount) { await client.query('ROLLBACK'); return fail(res,400,'Selected content is not published'); }
    const guide = await client.query("SELECT version FROM study_guides WHERE content_id=$1 AND status='published' ORDER BY version DESC LIMIT 1",[selection.content_id]);
    const version = guide.rowCount ? guide.rows[0].version : null;
    await client.query(`INSERT INTO daily_content_history(learning_date,content_id,selection_type,guide_version) VALUES($1::date,$2,$3,$4)`,[date,selection.content_id,selection.source,version]);
    await client.query('COMMIT');
    return res.status(201).json({ok:true,date,content_id:selection.content_id,title:selection.title,selection_type:selection.source,guide_version:version,finalized:true});
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Admin daily error:',e.message);
    if (e.code === '23505') return fail(res,409,'Date already finalized');
    return fail(res,500,'Daily operation failed');
  } finally { client.release(); }
};
