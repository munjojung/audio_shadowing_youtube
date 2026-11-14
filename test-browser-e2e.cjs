// Read-only browser E2E for Shadowing Player Pro. Does not write to Neon/R2.
const { chromium } = require('playwright');
const BASE = process.env.PLAYER_URL || 'https://shadowing-player-pro.vercel.app/';
const ID = process.env.CONTENT_ID || 'tsSHK7o5FbE';
let passed=0, failed=0, skipped=0;
function result(name,ok,detail=''){console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);ok?passed++:failed++;}
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1365,height:850},acceptDownloads:false});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 try {
  const response=await page.goto(`${BASE.replace(/\/$/,'')}/?content=${encodeURIComponent(ID)}`,{waitUntil:'domcontentloaded',timeout:45000});
  result('Player page HTTP 200',response?.status()===200,`HTTP ${response?.status()}`);
  for(const id of ['mainAudio','btnPlayPause','btnLangKo','btnLangEn','toggleLoopBtn','toggleSpeedBtn','speedSlider','currentSubtitleText','toggleGuideBtn']) result(`Control #${id} exists`,await page.locator(`#${id}`).count()===1);
  await page.waitForTimeout(7000);
  const media=await page.locator('#mainAudio').evaluate(a=>({src:a.currentSrc||a.src,readyState:a.readyState,duration:a.duration,error:a.error?.message||null}));
  result('Audio source assigned',!!media.src,JSON.stringify(media));
  if(media.src){
    try{
      await page.locator('#btnPlayPause').click({timeout:5000});
      await page.waitForTimeout(2000);
      const playing=await page.locator('#mainAudio').evaluate(a=>!a.paused && a.currentTime>0);
      result('Actual audio playback advances',playing);
      if(playing) await page.locator('#btnPlayPause').click();
    }catch(e){result('Actual audio playback advances',false,e.message.slice(0,150));}
  }else {skipped++;console.log('SKIP Audio playback (no source loaded)');}
  await page.locator('#toggleSpeedBtn').click();
  await page.locator('#speedSlider').evaluate(el=>{el.value='1.5';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const speed=await page.locator('#mainAudio').evaluate(a=>a.playbackRate);
  result('Playback speed 1.5x',Math.abs(speed-1.5)<0.01,`rate=${speed}`);
  await page.locator('#toggleLoopBtn').click();
  result('Loop panel opens',await page.locator('#panelLoop').isVisible());
  await page.locator('#btnLangEn').click();
  result('EN subtitle button usable',await page.locator('#btnLangEn').count()===1);
  await page.locator('#btnLangKo').click();
  result('KO subtitle button usable',await page.locator('#btnLangKo').count()===1);
  if(errors.length) console.log('PAGE ERRORS:',errors.slice(0,5));
 }catch(e){failed++;console.error('FAIL Browser E2E exception:',e.message);}finally{await browser.close();}
 console.log(`\nRESULT: ${passed} passed, ${failed} failed, ${skipped} skipped`);
 process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
