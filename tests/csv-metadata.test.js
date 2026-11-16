'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {csvParse,parseMetadata,main}=require('../scripts/bulk-register-content');
const ID='ZnqY1GxtCDs';
const metadata=`URL: https://www.youtube.com/watch?v=${ID}\nTitle: the ins and outs 전부를 알고 싶다면? #생활패턴영어\nDate: 2026-09-29 00:00:00\n\n--- Description ---\n첫 줄, 쉼표\n01:05  예문: "여행"\n#생활영어`;
test('TXT metadata includes date and multiline description',()=>{
 const meta=parseMetadata(metadata);
 assert.equal(meta.id,ID);assert.equal(meta.video_date,'2026-09-29 00:00:00');assert.match(meta.description,/01:05/);
});
test('legacy CSV migration preserves old values, unknown columns, and writes metadata',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shadowing-csv-'));
 const registry=path.join(dir,'registry.csv');const root=path.join(dir,'lessons');fs.mkdirSync(root);
 fs.writeFileSync(path.join(root,'lesson.txt'),metadata);
 const header='youtube_id,youtube_url,registration_status,mp3_exists,en_vtt_exists,ko_vtt_exists,mp3_path,en_vtt_path,ko_vtt_path,registered_at,last_checked_at,error,custom_note';
 fs.writeFileSync(registry,header+'\n'+`${ID},https://www.youtube.com/watch?v=${ID},registered,True,True,True,old.mp3,en.vtt,ko.vtt,2026-11-14,, ,keep-me`+'\n');
 const oldFetch=global.fetch;const oldToken=process.env.ADMIN_API_TOKEN;
 global.fetch=async()=>({status:200,ok:true,text:async()=>JSON.stringify({ok:true,contents:[{id:ID,title:'the ins and outs 전부를 알고 싶다면? #생활패턴영어',description:'첫 줄, 쉼표\n01:05  예문: "여행"\n#생활영어'}]})});
 process.env.ADMIN_API_TOKEN='test-token';
 try{await main(['--root',root,'--registry',registry,'--url-list',path.join(dir,'missing.txt'),'--dry-run']);}
 finally{global.fetch=oldFetch;if(oldToken===undefined)delete process.env.ADMIN_API_TOKEN;else process.env.ADMIN_API_TOKEN=oldToken;}
 const rows=csvParse(fs.readFileSync(registry,'utf8'));
 assert.equal(rows.length,1);assert.equal(rows[0].custom_note,'keep-me');assert.equal(rows[0].mp3_path,''); // inventory reflects absent MP3
 assert.equal(rows[0].registered_at,'2026-11-14');assert.equal(rows[0].title,'the ins and outs 전부를 알고 싶다면? #생활패턴영어');
 assert.equal(rows[0].description,'첫 줄, 쉼표\n01:05  예문: "여행"\n#생활영어');
 assert.equal(rows[0].video_date,'2026-09-29 00:00:00');
 assert.ok(fs.existsSync(registry+'.before-metadata-columns.bak'));
 assert.equal(fs.readFileSync(registry+'.before-metadata-columns.bak','utf8').split('\n')[0],header);
});
