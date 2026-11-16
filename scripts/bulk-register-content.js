'use strict';
// Shadowing Player Pro: local files -> R2 -> existing authenticated admin API.
// Node >= 18. Default is DRY RUN. Never logs credentials or overwrites R2 objects.
const fs = require('node:fs');
const path = require('node:path');

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const COLS = ['youtube_id','youtube_url','registration_status','mp3_exists','en_vtt_exists','ko_vtt_exists','mp3_path','en_vtt_path','ko_vtt_path','registered_at','last_checked_at','error'];
const DEFAULT_ROOT = 'C:\\python_workspace\\lessonsYouTube';
const DEFAULT_API = 'https://shadowing-player-pro.vercel.app';
function argsOf(argv) {
  const opts = { root: DEFAULT_ROOT, registry: path.resolve('youtube-content-registry.csv'), urlList: path.resolve('listofYouTubes.txt'), api: DEFAULT_API, execute: false };
  for (let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if (arg==='--execute') opts.execute=true;
    else if (arg==='--dry-run') opts.execute=false;
    else if (['--root','--registry','--url-list','--api'].includes(arg)) {
      if (!argv[i+1]) throw Error('Missing value for '+arg);
      opts[{'--root':'root','--registry':'registry','--url-list':'urlList','--api':'api'}[arg]]=argv[++i];
    } else throw Error('Unknown argument: '+arg);
  }
  opts.api=opts.api.replace(/\/$/,'');
  if (!/^https:\/\//.test(opts.api)) throw Error('--api must be HTTPS');
  return opts;
}
function csvParse(text) {
  text=text.replace(/^\uFEFF/,'');
  const records=[]; let record=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) { if(c==='"' && text[i+1]==='"'){cell+='"';i++;} else if(c==='"')quoted=false;else cell+=c; }
    else if(c==='"')quoted=true;
    else if(c===','){record.push(cell);cell='';}
    else if(c==='\n'){record.push(cell.replace(/\r$/,''));if(record.some(v=>v!==''))records.push(record);record=[];cell='';}
    else cell+=c;
  }
  if(quoted) throw Error('Malformed CSV: unmatched quote');
  if(cell||record.length){record.push(cell.replace(/\r$/,''));records.push(record);}
  if(!records.length)return [];
  const [head,...body]=records;
  if(!COLS.every(c=>head.includes(c))) throw Error('Registry CSV headers mismatch');
  return body.map(r=>Object.fromEntries(COLS.map(c=>[c,r[head.indexOf(c)]||''])));
}
function csvEscape(value){const s=String(value??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function csvWrite(file,rows){
  const data='\uFEFF'+COLS.join(',')+'\r\n'+rows.map(r=>COLS.map(c=>csvEscape(r[c])).join(',')).join('\r\n')+'\r\n';
  fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
  const tmp=file+'.tmp-'+process.pid;
  fs.writeFileSync(tmp,data,'utf8');
  try{fs.renameSync(tmp,file);}catch(e){try{fs.unlinkSync(tmp);}catch{}throw e;}
}
function makeRow(id){return Object.fromEntries(COLS.map(c=>[c,c==='youtube_id'?id:c==='youtube_url'?`https://www.youtube.com/watch?v=${id}`:c==='registration_status'?'pending':'']));}
function walk(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(full));
    else if(entry.isFile() && entry.name.toLowerCase().endsWith('.mp3'))out.push(full);
  }
  return out;
}
function discover(root) {
  const found=new Map(),duplicates=new Set();
  for(const mp3 of walk(root)){
    const base=path.basename(mp3).slice(0,-4);
    const match=base.match(/(?:^|_)([A-Za-z0-9_-]{11})$/);
    if(!match)continue;
    const id=match[1];
    const en=path.join(path.dirname(mp3),base+'_en.vtt');
    const ko=path.join(path.dirname(mp3),base+'_ko.vtt');
    const item={id,base,title:base.slice(0,-12).replace(/_/g,' ').trim()||id,mp3,en,ko,
      ready:fs.existsSync(en)&&fs.statSync(en).isFile()&&fs.existsSync(ko)&&fs.statSync(ko).isFile()};
    if(found.has(id))duplicates.add(id);else found.set(id,item);
  }
  return {found,duplicates};
}
// TXT metadata is matched by its URL field, not by the TXT filename.
function parseMetadata(text) {
  text=text.replace(/^\uFEFF/,'');
  const url=text.match(/^URL:\s*(https?:\/\/\S+)\s*$/im);
  const title=text.match(/^Title:\s*(.*?)\s*$/im);
  const desc=text.match(/^---\s*Description\s*---\s*\r?\n([\s\S]*)$/im);
  if(!url || !title || !title[1].trim() || !desc)return null;
  let id;
  try {
    const u=new URL(url[1]);
    if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname) && u.pathname==='/watch')id=u.searchParams.get('v');
    else if(['youtu.be','www.youtu.be'].includes(u.hostname))id=u.pathname.slice(1).split('/')[0];
  }catch{return null;}
  if(!id || !ID_RE.test(id))return null;
  const result={id,title:title[1].trim(),description:desc[1].trim()};
  if(result.title.length>200)throw Error('TXT title exceeds 200 characters for '+id);
  return result;
}
function discoverMetadata(root) {
  const metadata=new Map(),duplicates=new Set();
  function scan(dir){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const full=path.join(dir,entry.name);
      if(entry.isDirectory())scan(full);
      else if(entry.isFile() && entry.name.toLowerCase().endsWith('.txt')){
        const parsed=parseMetadata(fs.readFileSync(full,'utf8'));
        if(!parsed)continue;
        if(metadata.has(parsed.id))duplicates.add(parsed.id);
        else metadata.set(parsed.id,{...parsed,file:full});
      }
    }
  }
  scan(root);
  return {metadata,metadataDuplicates:duplicates};
}
function metadataPatch(existing,meta){
  if(!meta)return null;
  const title=String(existing.title||'').trim();
  const description=String(existing.description||'').trim();
  const nextTitle=(!title || title===existing.id)?meta.title:title;
  const nextDescription=description?existing.description:meta.description;
  if(nextTitle===existing.title && nextDescription===existing.description)return null;
  // PATCH endpoint also receives current status/media, preserving unrelated fields.
  return {id:existing.id,title:nextTitle,description:nextDescription,status:existing.status,
    media:{mp3_r2_key:existing.mp3_r2_key,vtt_en_r2_key:existing.vtt_en_r2_key,vtt_ko_r2_key:existing.vtt_ko_r2_key}};
}
function addUrlList(rows,file){
  if(!fs.existsSync(file))return;
  const text=fs.readFileSync(file,'utf8');
  for(const match of text.matchAll(/(?:youtube\.com\/watch\?[^\s]*?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g)){
    if(!rows.has(match[1]))rows.set(match[1],makeRow(match[1]));
  }
}
function updateFileFields(row,item,now){
  row.mp3_exists=item?'True':'False';row.en_vtt_exists=item&&fs.existsSync(item.en)?'True':'False';row.ko_vtt_exists=item&&fs.existsSync(item.ko)?'True':'False';
  row.mp3_path=item?item.mp3:'';row.en_vtt_path=item&&fs.existsSync(item.en)?item.en:'';row.ko_vtt_path=item&&fs.existsSync(item.ko)?item.ko:'';
  row.last_checked_at=now;
}
async function apiRequest(api,token,method,body){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(api+'/api/admin-contents',{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{throw Error('Admin API returned non-JSON (HTTP '+response.status+')');}
    if(!response.ok)return {status:response.status,data};
    return {status:response.status,data};
  }finally{clearTimeout(timeout);}
}
function createR2Client(){
  const {R2_ACCOUNT_ID,R2_UPLOAD_ACCESS_KEY_ID,R2_UPLOAD_SECRET_ACCESS_KEY,R2_BUCKET_NAME}=process.env;
  if(![R2_ACCOUNT_ID,R2_UPLOAD_ACCESS_KEY_ID,R2_UPLOAD_SECRET_ACCESS_KEY,R2_BUCKET_NAME].every(Boolean))throw Error('Missing R2_ACCOUNT_ID, R2_UPLOAD_ACCESS_KEY_ID, R2_UPLOAD_SECRET_ACCESS_KEY or R2_BUCKET_NAME');
  const {S3Client}=require('@aws-sdk/client-s3');
  return {bucket:R2_BUCKET_NAME,client:new S3Client({region:'auto',endpoint:`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,forcePathStyle:true,credentials:{accessKeyId:R2_UPLOAD_ACCESS_KEY_ID,secretAccessKey:R2_UPLOAD_SECRET_ACCESS_KEY}})};
}
async function uploadFiles(client,bucket,item,keys){
  const {PutObjectCommand}=require('@aws-sdk/client-s3');
  for(const [file,key,type] of [[item.mp3,keys.audio,'audio/mpeg'],[item.ko,keys.ko,'text/vtt; charset=utf-8'],[item.en,keys.en,'text/vtt; charset=utf-8']]){
    await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:fs.createReadStream(file),ContentLength:fs.statSync(file).size,ContentType:type}));
    console.log('  R2 uploaded:',key);
  }
}
// Optional lesson JSON synchronization. Existing MP3/VTT registration remains unchanged.
async function syncLessonJson(opts, token, registered, planned=new Set()) {
  const {found,duplicates}=discover(opts.root);
  let saved=0, unchanged=0, errors=0, missing=0;
  for (const [id,item] of found) {
    if(duplicates.has(id)||(!registered.has(id)&&!planned.has(id)))continue;
    for(const [filename,endpoint,field] of [
      ['study-guide.json','/api/admin-study-guides','guides'],
      ['review-quiz.json','/api/admin-reviews','reviews']]) {
      const file=path.join(path.dirname(item.mp3),filename);
      if(!fs.existsSync(file)){missing++;continue;}
      try {
        if(fs.statSync(file).size>1024*1024)throw Error('JSON exceeds 1 MB');
        const payload=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
        if(payload?.contentId!==id)throw Error('contentId does not match MP3 YouTube ID');
        if(field==='guides') {
          if(!Array.isArray(payload.sections))throw Error('Study Guide sections must be an array');
        } else {
          if(payload.schemaVersion!=='1.0'||!Array.isArray(payload.questions)||payload.questions.length!==10)throw Error('Review must have schemaVersion 1.0 and 10 questions');
          for(const q of payload.questions)if(q.type!=='multiple_choice'||!Array.isArray(q.options)||q.options.length!==4||!Number.isInteger(q.answer)||q.answer<0||q.answer>3)throw Error('Invalid review question '+q.id);
        }
        // New content does not exist in Neon during dry-run; validate JSON locally.
        if(planned.has(id) && !registered.has(id)) {
          console.log('DRY RUN JSON (NEW CONTENT):',id,filename);
          continue;
        }
        const url=opts.api+endpoint+'?id='+encodeURIComponent(id);
        const r=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
        const data=await r.json();
        if(!r.ok||!data.ok)throw Error('Version lookup failed HTTP '+r.status+': '+(data.error||''));
        const versions=data[field]||data.studyGuides||data.study_guides||[];
        if(!Array.isArray(versions))throw Error('Unexpected version response');
        // Compare with all versions to avoid producing duplicates on repeated runs.
        const normalize=x=>JSON.stringify(sortJson(x));
        if(versions.some(v=>normalize(typeof v.payload==='string'?JSON.parse(v.payload):v.payload)===normalize(payload))){unchanged++;console.log('JSON UNCHANGED:',id,filename);continue;}
        if(!opts.execute){console.log('DRY RUN JSON:',id,filename);continue;}
        const post=await fetch(opts.api+endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Admin-Request':'1'},body:JSON.stringify({contentId:id,payload,publish:false}),signal:AbortSignal.timeout(20000)});
        const result=await post.json();
        if(!post.ok||!result.ok)throw Error('Save failed HTTP '+post.status+': '+(result.error||''));
        saved++;console.log('JSON DRAFT SAVED:',id,filename,'version',result.version);
      }catch(e){errors++;console.error('JSON FAILED:',id,filename,e.message);}
    }
  }
  console.log(`JSON sync: saved=${saved}, unchanged=${unchanged}, missing=${missing}, errors=${errors}`);
  if(errors)process.exitCode=1;
}
function sortJson(v){
  if(Array.isArray(v))return v.map(sortJson);
  if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sortJson(v[k])]));
  return v;
}

async function main(argv=process.argv.slice(2)){
  const opts=argsOf(argv);
  if(!fs.existsSync(opts.root)||!fs.statSync(opts.root).isDirectory())throw Error('Content folder not found: '+opts.root);
  const rows=new Map();
  if(fs.existsSync(opts.registry))for(const r of csvParse(fs.readFileSync(opts.registry,'utf8')))if(ID_RE.test(r.youtube_id))rows.set(r.youtube_id,r);
  addUrlList(rows,opts.urlList);
  const {found,duplicates}=discover(opts.root);
  const {metadata,metadataDuplicates}=discoverMetadata(opts.root);
  for(const id of found.keys())if(!rows.has(id))rows.set(id,makeRow(id));
  const now=new Date().toISOString();
  for(const [id,row] of rows)updateFileFields(row,found.get(id),now);
  const save=()=>csvWrite(opts.registry,[...rows.values()].sort((a,b)=>a.youtube_id.localeCompare(b.youtube_id)));
  // Always produce an up-to-date inventory even when credentials are not configured.
  save();
  const token=process.env.ADMIN_API_TOKEN;
  if(!token)throw Error('ADMIN_API_TOKEN is required to compare against actual Neon records (CSV inventory was refreshed)');
  const lookup=await apiRequest(opts.api,token,'GET');
  if(lookup.status!==200||!lookup.data?.ok||!Array.isArray(lookup.data.contents))throw Error('Admin API lookup failed: HTTP '+lookup.status+' '+(lookup.data?.error||''));
  if(lookup.data.contents.length>=500)throw Error('Admin API returns at most 500 records; refusing incomplete duplicate detection');
  const registered=new Map(lookup.data.contents.map(c=>[c.id,c]));
  let done=0,skipped=0,missing=0,errors=0,updated=0,updateReady=0;
  const planned=new Set();
  let r2=null;
  for(const [id,row] of [...rows.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
    const item=found.get(id);
    if(metadataDuplicates.has(id)){
      row.registration_status='error';row.error='Multiple TXT metadata files for same YouTube ID';errors++;save();console.error('DUPLICATE TXT:',id);continue;
    }
    const meta=metadata.get(id);
    if(registered.has(id)){
      row.registration_status='registered';row.error='';skipped++;
      const patch=metadataPatch(registered.get(id),meta);
      if(patch){
        if(!opts.execute){updateReady++;console.log('DRY RUN UPDATE METADATA:',id);}
        else try{
          const result=await apiRequest(opts.api,token,'PATCH',patch);
          if(result.status!==200 || !result.data?.ok)throw Error('Metadata PATCH failed: HTTP '+result.status+' '+(result.data?.error||''));
          updated++;console.log('UPDATED METADATA:',id);
        }catch(error){row.registration_status='error';row.error=String(error.message).slice(0,400);errors++;console.error('FAILED METADATA:',id,row.error);}
      }else console.log('EXISTS (Neon):',id);
      save();continue;
    }
    // No DB registration: never trust the CSV's prior registered status.
    row.registration_status='pending';row.registered_at='';
    if(duplicates.has(id)){row.registration_status='error';row.error='Duplicate local MP3 for same ID';errors++;save();console.log('DUPLICATE:',id);continue;}
    if(!item||!item.ready){row.registration_status='missing_files';row.error='MP3, EN VTT or KO VTT missing';missing++;save();console.log('MISSING:',id);continue;}
    if(!/^[A-Za-z0-9_-]{1,150}$/.test(item.base)||item.title.length>200){row.registration_status='error';row.error='Invalid filename or title';errors++;save();continue;}
    if(!opts.execute){row.registration_status='pending';row.error='';console.log('DRY RUN READY:',id,item.base);planned.add(id);save();continue;}
    try{
      if(!r2)r2=createR2Client();
      const {buildObjectKeys,inspectR2Objects}=require('./r2-upload-state');
      const keyBase=item.base===id ? `lesson_${id}` : item.base;
      const keys=buildObjectKeys(id,keyBase);
      const state=await inspectR2Objects(r2.client,r2.bucket,keys);
      if(state.state==='PARTIAL')throw Error('Partial R2 upload; manual review required (no overwrite)');
      if(state.state==='EMPTY')await uploadFiles(r2.client,r2.bucket,item,keys);
      else console.log('  R2 objects already complete:',id);
      const body={id,title:meta?.title||item.title,status:'published',description:meta?.description||'',media:{mp3_r2_key:keys.audio,vtt_en_r2_key:keys.en,vtt_ko_r2_key:keys.ko}};
      const result=await apiRequest(opts.api,token,'POST',body);
      if(result.status===201&&result.data?.ok){row.registration_status='registered';row.registered_at=new Date().toISOString();row.error='';registered.set(id,body);done++;console.log('REGISTERED:',id);}
      else if(result.status===409){ // Another registration may have raced; verify it exists.
        const check=await apiRequest(opts.api,token,'GET');
        if(check.status===200&&check.data?.contents?.some(c=>c.id===id)){row.registration_status='registered';row.error='';registered.set(id,check.data.contents.find(c=>c.id===id));skipped++;console.log('EXISTS after conflict:',id);}
        else throw Error('Registration conflict (409) but record not confirmed');
      }else throw Error('Neon registration failed: HTTP '+result.status+' '+(result.data?.error||''));
    }catch(error){row.registration_status='error';row.error=String(error.message).slice(0,400);errors++;console.error('FAILED:',id,row.error);}
    save();
  }
  await syncLessonJson(opts,token,registered,planned);
  console.log(`Finished: new=${done}, already_in_Neon=${skipped}, missing_files=${missing}, metadata_updated=${updated}, metadata_update_ready=${updateReady}, errors=${errors}; CSV=${opts.registry}`);
  if(errors)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error('STOPPED:',e.message);process.exitCode=1;});
module.exports={argsOf,csvParse,csvWrite,discover,makeRow,addUrlList,updateFileFields,parseMetadata,discoverMetadata,metadataPatch,main};
