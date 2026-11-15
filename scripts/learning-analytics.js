/* Shadowing Player Pro: optional, fail-open anonymous aggregate telemetry. */
(()=>{'use strict';
 const audio=document.getElementById('mainAudio');if(!audio||!globalThis.crypto?.randomUUID)return;
 const HEADER={'Content-Type':'application/json','X-Learning-Request':'1'};
 const ID=/^[a-zA-Z0-9_-]{11}$/;
 let sessionId=null,contentId=null,starting=false,enabled=true,lastTick=0,pendingSeconds=0;
 async function post(path,data){const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:HEADER,body:JSON.stringify(data),cache:'no-store',keepalive:true});if(!r.ok)throw Error('telemetry HTTP '+r.status);return r.json();}
 async function recordVisit(){try{await post('/api/learning/visitor',{});await post('/api/learning/visit',{visitId:crypto.randomUUID(),page:'player'});}catch(e){console.info('[Analytics] visit skipped:',e.message);}}
 void recordVisit();
 function currentId(){
  const params=new URLSearchParams(location.search),requested=params.get('content');
  if(requested&&ID.test(requested))return requested;
  const catalog=window.ShadowingCatalog?.getToday?.();if(catalog?.source==='r2'&&ID.test(catalog.base))return catalog.base;
  const src=audio.currentSrc||audio.src||'';
  const match=src.match(/(?:^|\/)([A-Za-z0-9_-]{11})\//);return match?.[1]||null;
 }
 async function start(){if(!enabled||starting||sessionId)return;const id=currentId();if(!id)return;starting=true;
  try{await post('/api/learning/visitor',{});const sid=crypto.randomUUID();await post('/api/learning/session',{sessionId:sid,contentId:id,source:'player'});sessionId=sid;contentId=id;lastTick=performance.now();pendingSeconds=0;}
  catch(e){console.info('[Analytics] optional telemetry unavailable:',e.message);}
  finally{starting=false;}}
 async function send(type,seconds=0){if(!sessionId||!enabled)return;const payload={sessionId,events:[{eventId:crypto.randomUUID(),type,positionSeconds:Math.max(0,Math.floor(audio.currentTime||0)),...(seconds?{durationSeconds:seconds}:{})}]};
  try{await post('/api/learning/events',payload);}catch(e){console.info('[Analytics] event skipped:',e.message);}}
 function tick(flush=false){
  const now=performance.now();
  if(!sessionId){lastTick=now;return;}
  if(!audio.paused&&!audio.ended&&!document.hidden&&lastTick){
   pendingSeconds+=Math.min(30,Math.max(0,(now-lastTick)/1000));
  }
  lastTick=now;
  const seconds=Math.floor(pendingSeconds);
  if(seconds >= (flush?1:15)){
   pendingSeconds-=seconds;
   void send('heartbeat',Math.min(60,seconds));
  }
 }
 audio.addEventListener('play',()=>{void (async()=>{await start();await send('play');})();});
 audio.addEventListener('pause',()=>{tick(true);void send('pause');});
 audio.addEventListener('ended',()=>{tick(true);void send('complete');sessionId=null;contentId=null;});
 audio.addEventListener('loadedmetadata',()=>{const id=currentId();if(sessionId&&id!==contentId){sessionId=null;contentId=null;}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)tick(true);lastTick=performance.now();});
 setInterval(tick,15000);
})();
