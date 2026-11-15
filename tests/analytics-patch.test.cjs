
const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');

// 통계 스크립트가 정확히 한 번 연결되어 있는지 확인
assert.equal(
  (html.match(/<script src="\/scripts\/learning-analytics\.js" defer><\/script>/g) || []).length,
  1
);

// 기존 MP3 플레이어가 유지되어 있는지 확인
assert.match(html, /<audio id="mainAudio"/);

// 통계 스크립트 확인
const js = fs.readFileSync('scripts/learning-analytics.js', 'utf8');

assert.match(js, /recordVisit\(\)/);
assert.match(js, /addEventListener\('play'/);
assert.match(js, /addEventListener\('pause'/);
assert.match(js, /addEventListener\('ended'/);

// 접속 통계 API 확인
const api = fs.readFileSync('api/learning/visit.js', 'utf8');
assert.match(api, /learning_page_visits/);

console.log('Analytics static checks passed');
