'use strict';
const crypto=require('node:crypto');
const {sameOrigin}=require('./admin-auth');
const COOKIE='__Host-shadowing_learning';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[a-zA-Z0-9_-]{11}$/;
const TYPES=new Set(['play','pause','seek','ab_repeat','subtitle_jump','study_guide_open','heartbeat','complete']);
function secret(){const s=process.env.LEARNING_SESSION_SECRET;return s&&s.length>=32?s:null;}
function sign(v){return crypto.createHmac('sha256',secret()).update(v).digest('base64url');}
function cookie(req){const pair=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));return pair?pair.slice(COOKIE.length+1):'';}
function identify(req){if(!secret())return null;const v=cookie(req),p=v.split('.');if(p.length!==3||!UUID.test(p[0])||!/^\d{10}$/.test(p[1])||Number(p[1])<Math.floor(Date.now()/1000))return null;const a=Buffer.from(sign(p[0]+'.'+p[1]));const b=Buffer.from(p[2]);return a.length===b.length&&crypto.timingSafeEqual(a,b)?p[0]:null;}
function issue(res,id){const exp=Math.floor(Date.now()/1000)+60*60*24*180;const value=id+'.'+exp;res.setHeader('Set-Cookie',`${COOKIE}=${value}.${sign(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60*60*24*180}`);}
function clear(res){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);}
function guard(req,res){res.setHeader('Cache-Control','no-store');if(!secret()){res.status(503).json({ok:false,error:'Learning analytics not configured'});return false;}if(req.method!=='GET'&&(!sameOrigin(req)||req.headers['content-type']?.split(';')[0]!=='application/json'||req.headers['x-learning-request']!=='1')){res.status(403).json({ok:false,error:'Forbidden'});return false;}return true;}
const int=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max;
module.exports={UUID,ID,TYPES,identify,issue,clear,guard,int};
