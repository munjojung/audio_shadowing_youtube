const crypto = require('node:crypto');
const { getPool } = require('./db');
const COOKIE = '__Host-shadowing_admin';
const TTL = 60 * 60 * 2;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function bearer(req) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected || expected.length < 32) return false;
  const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
  if (!match) return false;
  return crypto.timingSafeEqual(Buffer.from(hash(match[1]), 'hex'), Buffer.from(hash(expected), 'hex'));
}
function cookieValue(req) {
  const pair = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  return pair ? pair.slice(COOKIE.length + 1) : '';
}
function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  return value && value.length >= 32 ? value : null;
}
function signature(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}
function parseSession(req) {
  if (!secret()) return null;
  const parts = cookieValue(req).split('.');
  if (parts.length !== 3) return null;
  const [expires, nonce, mac] = parts;
  if (!/^\d{10,13}$/.test(expires) || !/^[a-f0-9]{32}$/.test(nonce)) return null;
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return null;
  const expected = Buffer.from(signature(expires + '.' + nonce));
  const supplied = Buffer.from(mac);
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  return { expires: Number(expires), nonceHash: hash(nonce) };
}
// DB-backed sessions allow immediate revocation across Vercel instances.
async function session(req) {
  const parsed = parseSession(req);
  if (!parsed) return false;
  const result = await getPool().query(
    'SELECT 1 FROM admin_sessions WHERE session_hash = $1 AND expires_at > now() LIMIT 1',
    [parsed.nonceHash]
  );
  return result.rowCount > 0;
}
async function isAdmin(req) { return bearer(req) || await session(req); }
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin || origin === 'null') return false;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  try { return new URL(origin).origin === proto + '://' + host; } catch { return false; }
}
async function requireAdmin(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let authorized = false;
  try { authorized = await isAdmin(req); }
  catch (error) { console.error('Admin session validation failed:', error.message); res.status(503).json({ok:false,error:'Authentication unavailable'}); return false; }
  if (!authorized) { res.status(401).json({ok:false,error:'Unauthorized'}); return false; }
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && !bearer(req)) {
    if (!sameOrigin(req) || req.headers['x-admin-request'] !== '1') {
      res.status(403).json({ok:false,error:'Forbidden: CSRF validation failed'}); return false;
    }
  }
  return true;
}
function newSession() {
  if (!secret()) throw Error('ADMIN_SESSION_SECRET not configured');
  const expires = Math.floor(Date.now() / 1000) + TTL;
  const nonce = crypto.randomBytes(16).toString('hex');
  const value = expires + '.' + nonce;
  return {
    sessionHash: hash(nonce),
    expires,
    cookie: `${COOKIE}=${value}.${signature(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`
  };
}
function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; }
module.exports = {bearer,session,isAdmin,requireAdmin,sameOrigin,newSession,clearCookie,parseSession};
