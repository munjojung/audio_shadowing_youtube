
const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');

// ?듦퀎 ?ㅽ겕由쏀듃媛 ?뺥솗????踰??곌껐?섏뼱 ?덈뒗吏 ?뺤씤
assert.equal(
  (html.match(/<script src="\/scripts\/learning-analytics\.js" defer><\/script>/g) || []).length,
  1
);

// 湲곗〈 MP3 ?뚮젅?댁뼱媛 ?좎??섏뼱 ?덈뒗吏 ?뺤씤
assert.match(html, /<audio id="mainAudio"/);

// ?듦퀎 ?ㅽ겕由쏀듃 ?뺤씤
const js = fs.readFileSync('scripts/learning-analytics.js', 'utf8');

assert.match(js, /recordVisit\(\)/);
assert.match(js, /addEventListener\('play'/);
assert.match(js, /addEventListener\('pause'/);
assert.match(js, /addEventListener\('ended'/);

// ?묒냽 ?듦퀎 API ?뺤씤
const api = fs.readFileSync('lib/learning-handlers/visit.js', 'utf8');
assert.match(api, /learning_page_visits/);

console.log('Analytics static checks passed');
