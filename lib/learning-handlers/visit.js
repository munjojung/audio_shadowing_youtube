'use strict';
const {getPool}=require('../db');
const A=require('../learning-auth');
module.exports=async(req,res)=>{
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'Method not allowed'});}
 if(!A.guard(req,res))return;
 const visitor=A.identify(req);
 if(!visitor)return res.status(401).json({ok:false,error:'Visitor session required'});
 const {visitId,page}=req.body||{};
 if(!A.UUID.test(visitId||'')||!['player','review'].includes(page))return res.status(400).json({ok:false,error:'Invalid visit'});
 try{
  const r=await getPool().query(`INSERT INTO learning_page_visits(id,visitor_id,page)
    SELECT $1,$2,$3 FROM learning_visitors WHERE id=$2 AND revoked_at IS NULL
    ON CONFLICT(id) DO NOTHING RETURNING id`,[visitId,visitor,page]);
  return res.json({ok:true,inserted:r.rowCount===1});
 }catch(e){console.error('Learning visit:',e.message);return res.status(500).json({ok:false,error:'Unable to record visit'});}
};
