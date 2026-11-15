'use strict';
const {getPool}=require('../lib/db');
const {requireAdmin}=require('../lib/admin-auth');
const {validate,ID}=require('../lib/review-validation');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({ok:false,error:'Method not allowed'});}
 if(!await requireAdmin(req,res))return;
 try{
  if(req.method==='GET'){
   if(!ID.test(req.query.id||''))return res.status(400).json({ok:false,error:'Invalid content ID'});
   const r=await getPool().query('SELECT id,content_id,version,status,payload,created_at,published_at FROM review_guides WHERE content_id=$1 ORDER BY version DESC',[req.query.id]);
   return res.json({ok:true,reviews:r.rows});
  }
  const {contentId,payload,publish=false}=req.body||{};
  const err=validate(contentId,payload);
  if(err||typeof publish!=='boolean')return res.status(400).json({ok:false,error:err||'Invalid publish flag'});
  const c=await getPool().connect();
  try{
   await c.query('BEGIN');
   const content=await c.query('SELECT id FROM contents WHERE id=$1 FOR UPDATE',[contentId]);
   if(!content.rowCount){await c.query('ROLLBACK');return res.status(404).json({ok:false,error:'Content not found'});}
   const next=await c.query('SELECT COALESCE(MAX(version),0)+1 AS v FROM review_guides WHERE content_id=$1',[contentId]);
   const version=Number(next.rows[0].v);
   if(publish)await c.query("UPDATE review_guides SET status='draft' WHERE content_id=$1 AND status='published'",[contentId]);
   await c.query("INSERT INTO review_guides(content_id,version,status,payload,published_at) VALUES($1,$2,$3,$4::jsonb,CASE WHEN $3='published' THEN now() ELSE NULL END)",[contentId,version,publish?'published':'draft',JSON.stringify(payload)]);
   await c.query('COMMIT');
   return res.status(201).json({ok:true,contentId,version,status:publish?'published':'draft'});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }catch(e){console.error('Review admin failed',e.message);return res.status(500).json({ok:false,error:'Review operation failed'});}
};
