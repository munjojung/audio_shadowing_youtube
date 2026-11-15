'use strict';
const crypto=require('node:crypto');
const NAME='__Host-shadowing_review';
function key(){const s=process.env.REVIEW_COOKIE_SECRET||process.env.ADMIN_SESSION_SECRET;if(!s||s.length<32)throw Error('Review cookie signing secret unavailable');return s;}
function sign(value){return crypto.createHmac('sha256',key()).update('review-v1:'+value).digest('hex');}
function identify(req,res){
 const cookies=String(req.headers.cookie||'').split(';').map(s=>s.trim());
 const raw=cookies.find(s=>s.startsWith(NAME+'='))?.slice(NAME.length+1);
 if(raw){const m=/^([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(raw);if(m){const expected=sign(m[1]);if(crypto.timingSafeEqual(Buffer.from(m[2],'hex'),Buffer.from(expected,'hex')))return m[1];}}
 const id=crypto.randomBytes(16).toString('hex');
 res.setHeader('Set-Cookie',`${NAME}=${id}.${sign(id)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`);
 return id;
}
module.exports={identify};
