'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {argsOf,csvParse,csvWrite,discover,makeRow}=require('../scripts/bulk-register-content');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'shadowing-bulk-'));
try{
 const id='nWxAzrhMg_E';const sub=path.join(temp,'lesson');fs.mkdirSync(sub);
 for(const name of [`lesson_${id}.mp3`,`lesson_${id}_en.vtt`,`lesson_${id}_ko.vtt`])fs.writeFileSync(path.join(sub,name),'test');
 const result=discover(temp);assert.equal(result.found.get(id).ready,true);
 const row=makeRow(id);row.error='comma, quote " and newline\ncheck';
 const csv=path.join(temp,'reg.csv');csvWrite(csv,[row]);
 assert.deepEqual(csvParse(fs.readFileSync(csv,'utf8')),[row]);
 assert.equal(argsOf(['--root',temp,'--execute']).execute,true);
 assert.equal(argsOf(['--root',temp,'--dry-run']).execute,false);
 const bare=path.join(temp,'bare');fs.mkdirSync(bare);
 for(const name of [`${id}.mp3`,`${id}_en.vtt`,`${id}_ko.vtt`])fs.writeFileSync(path.join(bare,name),'test');
 const discovered=discover(bare);assert.equal(discovered.found.get(id).base,id);
 const keyBase=discovered.found.get(id).base===id ? `lesson_${id}` : discovered.found.get(id).base;
 assert.equal(keyBase,`lesson_${id}`);
 console.log('Bulk registry tests passed');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
