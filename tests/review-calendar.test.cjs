'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const apiPath = path.resolve('api/review-calendar.js');
const originalLoad = Module._load;

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

const addDays = (date, offset) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const yesterday = addDays(today, -1);
const tomorrow = addDays(today, 1);

function createHandler(rows, queries) {
  const mockPool = {
    query: async (sql, params) => {
      queries.push({ sql, params });

      if (sql.includes('ORDER BY h.learning_date')) {
        const cutoff = params[1];
        return {
          rows: rows.filter(r =>
            r.date.startsWith(params[0].slice(0, 7)) &&
            r.date <= cutoff &&
            r.finalized &&
            r.published &&
            r.hasMedia
          )
        };
      }

      const date = params[0];
      const item = rows.find(r =>
        r.date === date &&
        r.finalized &&
        r.published &&
        r.hasMedia
      );

      return {
        rowCount: item ? 1 : 0,
        rows: item ? [{
          content_id: item.content_id,
          title: item.title,
          version: 3,
          payload: { questions: [] }
        }] : []
      };
    }
  };

  delete require.cache[apiPath];

  Module._load = function(request, parent, isMain) {
    if (request === '../lib/db' && parent?.filename === apiPath) {
      return { getPool: () => mockPool };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    return require(apiPath);
  } finally {
    Module._load = originalLoad;
  }
}

async function invoke(handler, query) {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };

  await handler({ method: 'GET', query }, res);
  return res;
}

test('calendar includes finalized today and yesterday, excludes future and unfinalized', async () => {
  const rows = [
    { date: yesterday, content_id: 'yesterday', title: 'Yesterday', finalized: true, published: true, hasMedia: true },
    { date: today, content_id: 'today', title: 'Today', finalized: true, published: true, hasMedia: true },
    { date: today, content_id: 'draft', title: 'Draft', finalized: false, published: true, hasMedia: true },
    { date: tomorrow, content_id: 'future', title: 'Future', finalized: true, published: true, hasMedia: true }
  ];

  const queries = [];
  const handler = createHandler(rows, queries);
  const result = await invoke(handler, { month: today.slice(0, 7) });

  assert.equal(result.statusCode, 200);
  assert.ok(result.body.days.some(x => x.content_id === 'today'));
  assert.ok(!result.body.days.some(x => x.content_id === 'future'));
  assert.ok(!result.body.days.some(x => x.content_id === 'draft'));

  assert.ok(
    queries[0].sql.includes('h.learning_date <= $2::date'),
    'SQL must include today'
  );
});

test('today detail is allowed, tomorrow detail is rejected', async () => {
  const queries = [];
  const handler = createHandler([
    { date: today, content_id: 'today', title: 'Today', finalized: true, published: true, hasMedia: true }
  ], queries);

  const current = await invoke(handler, { date: today });
  assert.equal(current.statusCode, 200);
  assert.equal(current.body.contentId, 'today');

  const future = await invoke(handler, { date: tomorrow });
  assert.equal(future.statusCode, 404);
  assert.equal(queries.length, 1);
});
