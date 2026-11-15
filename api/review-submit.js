'use strict';
const crypto=require('node:crypto');
const {getPool}=require('../lib/db');
const {sameOrigin}=require('../lib/admin-auth');
const {identify}=require('../lib/review-visitor');
const seoul=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'Method not allowed'});}
 if(!sameOrigin(req)||req.headers['content-type']?.split(';')[0]!=='application/json'||req.headers['x-review-request']!=='1')return res.status(403).json({ok:false,error:'Forbidden'});
 const {reviewId,answers,attemptId}=req.body||{};
 if(!Number.isSafeInteger(reviewId)||reviewId<1||!Array.isArray(answers)||answers.length>30||typeof attemptId!=='string'||!/^[a-f0-9-]{36}$/i.test(attemptId))return res.status(400).json({ok:false,error:'Invalid submission'});
 try{
  const r=await getPool().query(`SELECT g.payload,g.content_id FROM review_guides g JOIN daily_content_history h ON h.content_id=g.content_id
   WHERE g.id=$1 AND g.status='published' AND h.learning_date=($2::date-1) LIMIT 1`,[reviewId,seoul()]);
  if(!r.rowCount)return res.status(409).json({ok:false,error:'Review no longer active'});
  const questions=r.rows[0].payload.questions;
  if(answers.length!==questions.length||answers.some((a,i)=>!Number.isInteger(a)||a<0||a>=questions[i].options.length))return res.status(400).json({ok:false,error:'Invalid answers'});
  const score=questions.reduce((n,q,i)=>n+(q.answer===answers[i]?1:0),0);
  const visitor=identify(req,res);
  const hash=crypto.createHash('sha256').update('review-visitor-v1:'+visitor).digest('hex');
  const saved=await getPool().query('INSERT INTO review_attempts(id,review_guide_id,review_date,anonymous_hash,score,total) VALUES($1::uuid,$2,$3::date,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id',[attemptId,reviewId,seoul(),hash,score,questions.length]);
  if(!saved.rowCount)return res.status(409).json({ok:false,error:'이 브라우저의 오늘 복습 결과는 이미 저장되었습니다.'});
  return res.json({ok:true,score,total:questions.length,feedback:questions.map((q,i)=>({id:q.id,correct:q.answer===answers[i],answer:q.answer,explanation:q.explanation}))});
 }catch(e){console.error('Review submission failed',e.message);return res.status(500).json({ok:false,error:'Submission failed'});}
};
