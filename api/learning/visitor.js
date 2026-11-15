'use strict';
const crypto=require('node:crypto');const {getPool}=require('../../lib/db');const A=require('../../lib/learning-auth');
module.exports=async(req,res)=>{if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'Method not allowed'});}if(!A.guard(req,res))return;

 try{let id=A.identify(req);if(id){const r=await getPool().query('UPDATE learning_visitors SET last_seen_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id',[id]);if(!r.rowCount)id=null;}
 if(!id){id=crypto.randomUUID();await getPool().query('INSERT INTO learning_visitors(id) VALUES($1)',[id]);}
 A.issue(res,id);return res.json({ok:true,visitorId:id});}catch(e){console.error('Learning visitor:',e.message);return res.status(500).json({ok:false,error:'Unable to register visitor'});}};
