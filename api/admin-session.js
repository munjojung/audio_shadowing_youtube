const { getPool } = require('../lib/db');
const {bearer,session,sameOrigin,newSession,clearCookie,parseSession} = require('../lib/admin-auth');
module.exports = async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  if (req.method === 'GET') {
    try { const ok = await session(req); return res.status(ok ? 200 : 401).json({ok,authenticated:ok}); }
    catch (error) { console.error('Admin session check failed:', error.message); return res.status(503).json({ok:false,error:'Authentication unavailable'}); }
  }
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow','GET, POST, DELETE');
    return res.status(405).json({ok:false,error:'Method not allowed'});
  }
  if (!sameOrigin(req) || req.headers['x-admin-request'] !== '1') return res.status(403).json({ok:false,error:'Forbidden'});
  if (req.method === 'POST') {
    if (!bearer(req)) return res.status(401).json({ok:false,error:'Unauthorized'});
    try {
      const created = newSession();
      await getPool().query(
        'INSERT INTO admin_sessions (session_hash, expires_at) VALUES ($1, to_timestamp($2))',
        [created.sessionHash, created.expires]
      );
      res.setHeader('Set-Cookie',created.cookie);
      return res.status(200).json({ok:true});
    } catch (error) { console.error('Admin session creation failed:',error.message); return res.status(503).json({ok:false,error:'Session unavailable'}); }
  }
  // Revoke on the server before clearing the browser cookie.
  const parsed = parseSession(req);
  if (parsed) {
    try { await getPool().query('DELETE FROM admin_sessions WHERE session_hash = $1', [parsed.nonceHash]); }
    catch (error) { console.error('Admin session revocation failed:',error.message); return res.status(503).json({ok:false,error:'Logout failed; session not revoked'}); }
  }
  res.setHeader('Set-Cookie',clearCookie());
  return res.status(200).json({ok:true});
};
