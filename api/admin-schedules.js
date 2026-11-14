const { getPool } = require('../lib/db');
const { requireAdmin } = require('../lib/admin-auth');
const ID = /^[A-Za-z0-9_-]{11}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const iso = d => d.toISOString().slice(0,10);
function parseDate(s) { if (!DATE.test(s || '')) return null; const d = new Date(s+'T00:00:00Z'); return !Number.isNaN(d.valueOf()) && iso(d)===s ? d : null; }
function addDays(d,n) { return new Date(d.valueOf()+n*86400000); }
function error(res,code,msg){return res.status(code).json({ok:false,error:msg});}
module.exports = async (req,res) => {
 res.setHeader('Cache-Control','no-store');
 if (!['GET','POST','PATCH'].includes(req.method)){res.setHeader('Allow','GET, POST, PATCH');return error(res,405,'Method not allowed');}
 if (!requireAdmin(req,res)) return;
 const pool=getPool();
 try {
  if(req.method==='GET') {
   const list=await pool.query(`SELECT s.id,s.name,s.mode,to_char(s.start_date,'YYYY-MM-DD') start_date,s.interval_days,s.enabled,
     COALESCE(json_agg(json_build_object('id',c.id,'title',c.title,'status',c.status,'position',sc.position) ORDER BY sc.position) FILTER(WHERE c.id IS NOT NULL),'[]'::json) AS items
     FROM learning_schedules s LEFT JOIN schedule_contents sc ON sc.schedule_id=s.id LEFT JOIN contents c ON c.id=sc.content_id GROUP BY s.id ORDER BY s.id DESC`);
   if(req.query.preview === undefined) return res.json({ok:true,schedules:list.rows});
   const sid=Number(req.query.preview),days=Number(req.query.days||7),start=req.query.start || new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   if(!Number.isSafeInteger(sid)||sid<1||![7,30].includes(days)||!parseDate(start)) return error(res,400,'Invalid preview parameters');
   const schedule=list.rows.find(x=>Number(x.id)===sid);if(!schedule)return error(res,404,'Schedule not found');
   const end=iso(addDays(parseDate(start),days-1));
   const [overrides,history]=await Promise.all([
    pool.query(`SELECT to_char(o.learning_date,'YYYY-MM-DD') AS learning_day,o.content_id,c.title FROM daily_schedule_overrides o JOIN contents c ON c.id=o.content_id WHERE o.learning_date BETWEEN $1::date AND $2::date`,[start,end]),
    pool.query(`SELECT to_char(h.learning_date,'YYYY-MM-DD') AS learning_day,h.content_id,c.title,h.selection_type,h.guide_version FROM daily_content_history h JOIN contents c ON c.id=h.content_id WHERE h.learning_date BETWEEN $1::date AND $2::date`,[start,end])
   ]);
   const ov=new Map(overrides.rows.map(x=>[x.learning_day,x]));const hist=new Map(history.rows.map(x=>[x.learning_day,x]));
   const first=parseDate(schedule.start_date);const published=schedule.items.filter(x=>x.status==='published');
   const rows=Array.from({length:days},(_,i)=>{
    const day=iso(addDays(parseDate(start),i));const elapsed=Math.round((parseDate(day)-first)/86400000);
    const h=hist.get(day),o=ov.get(day);let chosen=null,source='none';
    if(h){chosen={id:h.content_id,title:h.title};source='history';}
    else if(o){chosen={id:o.content_id,title:o.title};source='manual';}
    else if(schedule.enabled && elapsed>=0 && published.length){const step=schedule.mode==='rotation'?1:schedule.mode==='weekly'?7:schedule.interval_days;chosen=published[Math.floor(elapsed/step)%published.length];source=schedule.mode;}
    return {date:day,content_id:chosen?.id||null,title:chosen?.title||null,source,guide_version:h?.guide_version??null};
   });
   return res.json({ok:true,schedule,preview:rows,notes:'History is immutable in preview; only published contents participate in automatic selection.'});
  }
  if(req.method==='POST'){
   const b=req.body||{};const name=typeof b.name==='string'?b.name.trim():'';
   const ids=b.content_ids;const mode=b.mode;
   if(!name||name.length>150||!['rotation','weekly','interval'].includes(mode)||!parseDate(b.start_date)||!Number.isInteger(b.interval_days??7)||(b.interval_days??7)<1||(b.interval_days??7)>365||!Array.isArray(ids)||ids.length<1||ids.length>100||ids.some(x=>typeof x!=='string'||!ID.test(x))||new Set(ids).size!==ids.length) return error(res,400,'Invalid schedule');
   const client=await pool.connect();try{
    await client.query('BEGIN');
    const c=await client.query(`SELECT id,status FROM contents WHERE id=ANY($1::varchar[])`,[ids]);
    if(c.rowCount!==ids.length||c.rows.some(x=>x.status!=='published')){await client.query('ROLLBACK');return error(res,400,'All schedule contents must be published');}
    const s=await client.query(`INSERT INTO learning_schedules(name,mode,start_date,interval_days,enabled) VALUES($1,$2,$3::date,$4,false) RETURNING id`,[name,mode,b.start_date,b.interval_days??7]);
    for(let i=0;i<ids.length;i++)await client.query(`INSERT INTO schedule_contents(schedule_id,content_id,position) VALUES($1,$2,$3)`,[s.rows[0].id,ids[i],i]);
    await client.query('COMMIT');return res.status(201).json({ok:true,id:s.rows[0].id,enabled:false});
   }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  const b=req.body||{};if(!Number.isSafeInteger(b.id)||b.id<1||typeof b.enabled!=='boolean')return error(res,400,'Invalid update');
  const client=await pool.connect();try{
   await client.query('BEGIN');
   const found=await client.query('SELECT id FROM learning_schedules WHERE id=$1 FOR UPDATE',[b.id]);
   if(!found.rowCount){await client.query('ROLLBACK');return error(res,404,'Schedule not found');}
   if(b.enabled){
    const bad=await client.query(`SELECT 1 FROM schedule_contents sc JOIN contents c ON c.id=sc.content_id WHERE sc.schedule_id=$1 AND c.status<>'published' LIMIT 1`,[b.id]);
    const count=await client.query('SELECT count(*)::int n FROM schedule_contents WHERE schedule_id=$1',[b.id]);
    if(bad.rowCount||!count.rows[0].n){await client.query('ROLLBACK');return error(res,400,'Schedule contains unpublished or no contents');}
    await client.query('UPDATE learning_schedules SET enabled=false WHERE enabled=true AND id<>$1',[b.id]);
   }
   await client.query('UPDATE learning_schedules SET enabled=$2 WHERE id=$1',[b.id,b.enabled]);
   await client.query('COMMIT');return res.json({ok:true,id:b.id,enabled:b.enabled});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }catch(e){console.error('Schedule admin error:',e.message);return error(res,500,'Schedule operation failed');}
};

