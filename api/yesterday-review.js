'use strict';
const {getPool}=require('../lib/db');
const seoul=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'Method not allowed'});}
 try{
  const r=await getPool().query(`SELECT h.learning_date::text AS learning_date,h.content_id,c.title,g.id AS review_id,g.version,g.payload
   FROM daily_content_history h JOIN contents c ON c.id=h.content_id
   LEFT JOIN LATERAL (SELECT id,version,payload FROM review_guides WHERE content_id=h.content_id AND status='published' ORDER BY version DESC LIMIT 1) g ON true
   WHERE h.learning_date=($1::date-1) LIMIT 1`,[seoul()]);
  if(!r.rowCount)return res.json({ok:true,available:false,reason:'yesterday_not_finalized'});
  const x=r.rows[0];
  if(!x.review_id)return res.json({ok:true,available:false,reason:'review_not_published',contentId:x.content_id,title:x.title});
  // Never expose answer indices to the browser before submission.
  return res.json({ok:true,available:true,reviewId:x.review_id,contentId:x.content_id,title:x.title,learningDate:x.learning_date,version:x.version,questions:x.payload.questions.map(q=>({id:q.id,type:q.type,question:q.question,options:q.options}))});
 }catch(e){console.error('Yesterday review failed',e.message);return res.status(500).json({ok:false,error:'Review unavailable'});}
};
