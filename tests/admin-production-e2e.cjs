'use strict';
const assert = require('node:assert/strict');
const { chromium, request } = require('playwright');

const BASE = (process.env.ADMIN_E2E_BASE_URL || 'https://shadowing-player-pro.vercel.app').replace(/\/$/, '');
const TOKEN = process.env.ADMIN_API_TOKEN;
const COOKIE_NAME = '__Host-shadowing_admin';
const PAGES = [
  ['통합 대시보드', '/admin.html'],
  ['콘텐츠 관리', '/admin-manager.html'],
  ['학습 일정', '/admin-schedules.html'],
  ['일일 콘텐츠', '/admin-daily.html'],
];
let browser;
let context;
let replay;
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); passed++; }
  catch (e) { console.error(`FAIL ${name}: ${e.message}`); failed++; }
}
async function main() {
  if (!TOKEN) throw new Error('ADMIN_API_TOKEN 환경변수가 없습니다. 토큰 값을 출력하지 말고 현재 PowerShell 세션에 설정하세요.');
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  let savedCookie;
  try {
    await test('일반 플레이어 GET /', async () => {
      const r = await context.request.get('/', { failOnStatusCode: false });
      assert.equal(r.status(), 200);
      assert.match(r.headers()['content-type'] || '', /text\/html/i);
    });
    await test('통합 관리자 화면 및 로그인 UI', async () => {
      const r = await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
      assert.equal(r.status(), 200);
      await page.locator('#token').waitFor();
      await page.locator('#login').waitFor();
    });
    await test('로그인 전 관리자 세션은 401', async () => {
      const r = await context.request.get('/api/admin-session', { failOnStatusCode: false });
      assert.equal(r.status(), 401);
    });
    await test('관리자 로그인 및 HttpOnly 세션 쿠키', async () => {
      await page.locator('#token').fill(TOKEN);
      await page.locator('#login').click();
      await page.locator('#menu').waitFor({ state: 'visible', timeout: 15000 });
      const cookies = await context.cookies(BASE);
      savedCookie = cookies.find(c => c.name === COOKIE_NAME);
      assert.ok(savedCookie, '세션 쿠키가 발급되지 않았습니다');
      assert.equal(savedCookie.httpOnly, true);
      assert.equal(savedCookie.secure, true);
      assert.equal(savedCookie.sameSite, 'Strict');
    });
    await test('로그인 상태 관리자 세션 200', async () => {
      const r = await context.request.get('/api/admin-session', { failOnStatusCode: false });
      assert.equal(r.status(), 200);
      assert.equal((await r.json()).authenticated, true);
    });
    await test('대시보드에 관리자 메뉴 3개 존재', async () => {
      for (const [, path] of PAGES.slice(1)) {
        assert.equal(await page.locator(`a[href="${path}"]`).count(), 1, `${path} 메뉴 없음`);
      }
    });
    for (const [name, path] of PAGES.slice(1)) {
      await test(`${name} 화면 열기 및 세션 유지`, async () => {
        const r = await page.goto(path, { waitUntil: 'domcontentloaded' });
        assert.equal(r.status(), 200);
        const sessionCheck = await context.request.get('/api/admin-session', { failOnStatusCode: false });
        assert.equal(sessionCheck.status(), 200);
        // HTML 및 세션 유효성 검증. 각 페이지의 데이터 렌더링 성공 여부는 별도 검증 필요.
        assert.ok((await page.locator('body').innerText()).trim().length > 0);
      });
    }
    await test('관리자 API GET 인증', async () => {
      const r = await context.request.get('/api/admin-check', { failOnStatusCode: false });
      assert.equal(r.status(), 200);
    });
    await test('관리자 로그아웃 성공', async () => {
      const r = await context.request.delete('/api/admin-session', {
        headers: { 'X-Admin-Request': '1', Origin: BASE },
        failOnStatusCode: false,
      });
      assert.equal(r.status(), 200);
    });
    await test('로그아웃 후 관리자 API 401', async () => {
      const r = await context.request.get('/api/admin-check', { failOnStatusCode: false });
      assert.equal(r.status(), 401);
    });
    await test('로그아웃 전 쿠키 재사용 차단', async () => {
      assert.ok(savedCookie, '재사용 검증용 쿠키가 없음');
      replay = await request.newContext({
        baseURL: BASE,
        extraHTTPHeaders: { Cookie: `${COOKIE_NAME}=${savedCookie.value}` },
      });
      const r = await replay.get('/api/admin-check', { failOnStatusCode: false });
      assert.equal(r.status(), 401, '서버가 폐기된 쿠키를 허용했습니다');
    });
  } finally {
    if (replay) await replay.dispose();
    if (context) await context.close();
    if (browser) await browser.close();
  }
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
main().catch(e => {
  console.error('TEST ERROR:', e.message);
  process.exitCode = 1;
  if (browser) browser.close().catch(() => {});
});
