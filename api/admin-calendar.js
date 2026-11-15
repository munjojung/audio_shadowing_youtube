'use strict';
const {getPool}=require('../lib/db');
const {requireAdmin}=require('../lib/admin-auth');
const MONTH=/^(\d{4})-(0[1-9]|1[0-2])$/;
const iso=d=>d.toISOString().slice(0,10);
const add=(d,n)=>new Date(d.getTime()+n*86400000);
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'Method not allowed'});}
 if(!await requireAdmin(req,res))return;
 const m=MONTH.exec(req.query?.month||'');if(!m)return res.status(400).json({ok:false,error:'Invalid month (YYYY-MM)'});
 const year=Number(m[1]);if(year<2000||year>2100)return res.status(400).json({ok:false,error:'Invalid year'});
 const start=new Date(Date.UTC(year,Number(m[2])-1,1)),end=new Date(Date.UTC(year,Number(m[2]),1));
 const from=iso(add(start,-1)),to=iso(add(end,-1));
 try{
  const db=getPool();const [hist,manual,schedules,guides]=await Promise.all([
   db.query(`SELECT to_char(h.learning_date,'YYYY-MM-DD') AS day,h.content_id,c.title FROM daily_content_history h JOIN contents c ON c.id=h.content_id WHERE h.learning_date BETWEEN $1::date AND $2::date`,[from,to]),
   db.query(`SELECT to_char(o.learning_date,'YYYY-MM-DD') AS day,o.content_id,c.title FROM daily_schedule_overrides o JOIN contents c ON c.id=o.content_id WHERE o.learning_date BETWEEN $1::date AND $2::date`,[from,to]),
   db.query(`SELECT s.id,s.mode,s.interval_days,to_char(s.start_date,'YYYY-MM-DD') AS start_date,COALESCE(json_agg(json_build_object('id',c.id,'title',c.title) ORDER BY sc.position) FILTER(WHERE c.id IS NOT NULL AND c.status='published'),'[]'::json) AS items FROM learning_schedules s LEFT JOIN schedule_contents sc ON sc.schedule_id=s.id LEFT JOIN contents c ON c.id=sc.content_id WHERE s.enabled=true GROUP BY s.id ORDER BY s.id DESC LIMIT 1`),
   db.query(`SELECT content_id,version,status,jsonb_array_length(CASE WHEN jsonb_typeof(payload::jsonb->'questions')='array' THEN payload::jsonb->'questions' ELSE '[]'::jsonb END) AS question_count FROM review_guides ORDER BY content_id,version DESC`)
  ]);
  const h=new Map(hist.rows.map(r=>[r.day,r])),o=new Map(manual.rows.map(r=>[r.day,r]));
  const s=schedules.rows[0];const first=s?new Date(s.start_date+'T00:00:00Z'):null;
  const byGuide=new Map();for(const g of guides.rows){const old=byGuide.get(g.content_id)||{draft:false,published:null};if(g.status==='published'&&!old.published)old.published=g;else if(g.status!=='published')old.draft=true;byGuide.set(g.content_id,old);}
  function choose(day){const date=iso(day);if(h.has(date))return {...h.get(date),source:'history'};if(o.has(date))return {...o.get(date),source:'manual'};if(!s||!first||!s.items.length)return null;const elapsed=Math.round((day-first)/86400000);const step=s.mode==='rotation'?1:s.mode==='weekly'?7:Number(s.interval_days);if(elapsed<0||!Number.isInteger(step)||step<1)return null;const item=s.items[Math.floor(elapsed/step)%s.items.length];return {content_id:item.id,title:item.title,source:'schedule'};}
  const rows=[];for(let d=new Date(start);d<end;d=add(d,1)){const learning=choose(d),previous=choose(add(d,-1));const guide=previous?byGuide.get(previous.content_id):null;const published=guide?.published;rows.push({date:iso(d),learning:learning?{contentId:learning.content_id,title:learning.title,source:learning.source}:null,review:previous?{learningDate:iso(add(d,-1)),contentId:previous.content_id,title:previous.title,source:previous.source,status:published?'published':guide?.draft?'draft':'none',version:published?.version??null,questionCount:published?Number(published.question_count):0}:null});}
  return res.json({ok:true,month:req.query.month,days:rows,notice:'History is final; manual and schedule entries may change before daily finalization.'});
 }catch(e){console.error('Admin calendar:',e.message);return res.status(500).json({ok:false,error:'Calendar lookup failed'});}
};
