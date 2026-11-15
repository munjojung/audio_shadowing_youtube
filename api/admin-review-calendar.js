 'use strict';
const {getPool}=require('../lib/db');
const {requireAdmin}=require('../lib/admin-auth');
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function iso(d){return d.toISOString().slice(0,10);}
function parse(s){if(!DATE.test(s||''))return null;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.valueOf())&&iso(d)===s?d:null;}
function add(d,n){return new Date(d.valueOf()+n*86400000);}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'Method not allowed'});}
 if(!await requireAdmin(req,res))return;
 const day=parse(req.query?.date);
 if(!day)return res.status(400).json({ok:false,error:'Invalid date'});
 const date=iso(day),learningDate=iso(add(day,-1));
 try{
  const pool=getPool();
  const history=await pool.query(`SELECT h.content_id,c.title FROM daily_content_history h JOIN contents c ON c.id=h.content_id WHERE h.learning_date=$1::date LIMIT 1`,[learningDate]);
  let content=history.rows[0]||null,selectionSource=content?'history':null;
  if(!content){
   const manual=await pool.query(`SELECT o.content_id,c.title FROM daily_schedule_overrides o JOIN contents c ON c.id=o.content_id WHERE o.learning_date=$1::date LIMIT 1`,[learningDate]);
   if(manual.rows.length){content=manual.rows[0];selectionSource='manual';}
  }
  if(!content){
   const s=await pool.query(`SELECT s.id,s.mode,s.interval_days,to_char(s.start_date,'YYYY-MM-DD') AS start_date,
     COALESCE(json_agg(json_build_object('id',c.id,'title',c.title) ORDER BY sc.position) FILTER (WHERE c.id IS NOT NULL AND c.status='published'),'[]'::json) items
     FROM learning_schedules s LEFT JOIN schedule_contents sc ON sc.schedule_id=s.id LEFT JOIN contents c ON c.id=sc.content_id
     WHERE s.enabled=true GROUP BY s.id ORDER BY s.id DESC LIMIT 1`);
   if(s.rows.length){const schedule=s.rows[0],elapsed=Math.round((parse(learningDate)-parse(schedule.start_date))/86400000);
    if(elapsed>=0&&schedule.items.length){const step=schedule.mode==='rotation'?1:schedule.mode==='weekly'?7:schedule.interval_days;
     if(Number.isInteger(step)&&step>0){const item=schedule.items[Math.floor(elapsed/step)%schedule.items.length];content={content_id:item.id,title:item.title};selectionSource=schedule.mode;}
    }
   }
  }
  if(!content)return res.json({ok:true,date,learningDate,contentId:null,contentTitle:null,selectionSource:null,reviewStatus:'none',publishedVersion:null,questionCount:0,note:'대상 학습일에 확정 이력·수동 지정·활성 일정의 콘텐츠가 없습니다.'});
  const versions=await pool.query(`SELECT version,status,payload FROM review_guides WHERE content_id=$1 ORDER BY version DESC`,[content.content_id]);
  const published=versions.rows.find(x=>x.status==='published');
  const status=published?'published':versions.rows.length?'draft':'none';
  return res.json({ok:true,date,learningDate,contentId:content.content_id,contentTitle:content.title,selectionSource,reviewStatus:status,publishedVersion:published?.version??null,questionCount:Array.isArray(published?.payload?.questions)?published.payload.questions.length:0,payload:published?.payload??null,note:selectionSource==='history'?'확정 학습 이력을 기준으로 조회했습니다.':'미확정 날짜는 현재 일정 설정을 기준으로 예상합니다. 실제 확정 시 달라질 수 있습니다.'});
 }catch(e){console.error('Admin review calendar failed:',e.message);return res.status(500).json({ok:false,error:'Review calendar lookup failed'});}
};
