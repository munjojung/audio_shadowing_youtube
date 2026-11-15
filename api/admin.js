'use strict';

const handlers = {
  'admin-check': require('../lib/admin-handlers/admin-check'),
  'admin-contents': require('../lib/admin-handlers/admin-contents'),
  'admin-daily': require('../lib/admin-handlers/admin-daily'),
  'admin-learning-stats': require('../lib/admin-handlers/admin-learning-stats'),
  'admin-reviews': require('../lib/admin-handlers/admin-reviews'),
  'admin-schedules': require('../lib/admin-handlers/admin-schedules'),
  'admin-study-guides': require('../lib/admin-handlers/admin-study-guides')
};

module.exports = async (req, res) => {
  const route = req.query.__handler;
  const handler = handlers[route];

  if (!handler) {
    return res.status(404).json({ error: 'Not found' });
  }

  return handler(req, res);
};
