'use strict';

const handlers = {
  visitor: require('../lib/learning-handlers/visitor'),
  visit: require('../lib/learning-handlers/visit'),
  session: require('../lib/learning-handlers/session'),
  'session-end': require('../lib/learning-handlers/session-end'),
  events: require('../lib/learning-handlers/events'),
  progress: require('../lib/learning-handlers/progress'),
  privacy: require('../lib/learning-handlers/privacy')
};

module.exports = async (req, res) => {
  const route = req.query.__handler;
  const handler = handlers[route];

  if (!handler) {
    return res.status(404).json({ error: 'Not found' });
  }

  return handler(req, res);
};
