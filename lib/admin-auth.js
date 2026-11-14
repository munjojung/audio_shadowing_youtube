const crypto = require('node:crypto');

function isAdmin(req) {
  const expected = process.env.ADMIN_API_TOKEN;

  if (!expected || expected.length < 32) {
    return false;
  }

  const authorization = req.headers.authorization || '';
  const match = /^Bearer ([^\s]+)$/.exec(authorization);

  if (!match) return false;

  const supplied = match[1];

  const a = crypto.createHash('sha256')
    .update(supplied).digest();

  const b = crypto.createHash('sha256')
    .update(expected).digest();

  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!isAdmin(req)) {
    res.status(401).json({
      ok: false,
      error: 'Unauthorized'
    });
    return false;
  }

  return true;
}

module.exports = { isAdmin, requireAdmin };
