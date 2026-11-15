'use strict';const {getPool}=require('../db');const {requireAdmin}=require('../admin-auth');
module.exports=async(req,res)=>{if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'Method not allowed'});}if(!await requireAdmin(req,res))return;const days=Number(req.query.days||7);if(![7,30,90].includes(days))return res.status(400).json({ok:false,error:'days must be 7, 30, or 90'});
 try{const db=getPool();const [summary,contents,reviews,visits,daily]=await Promise.all([
 db.query(`SELECT COUNT(*)::int AS sessions,
 COUNT(DISTINCT visitor_id)::int AS visitors,
 COUNT(DISTINCT visitor_id) FILTER (WHERE v.created_at >= now()-($1::int*interval '1 day'))::int AS new_visitors,
 COUNT(DISTINCT visitor_id) FILTER (WHERE v.created_at < now()-($1::int*interval '1 day'))::int AS returning_visitors,
 COALESCE(SUM(s.active_seconds),0)::bigint AS active_seconds,
 COUNT(*) FILTER(WHERE s.completed)::int AS completed_sessions
 FROM learning_sessions s JOIN learning_visitors v ON v.id=s.visitor_id
 WHERE s.started_at>=now()-($1::int*interval '1 day')`,[days]),
 db.query(`SELECT s.content_id,c.title,COUNT(*)::int AS sessions,COUNT(DISTINCT s.visitor_id)::int AS visitors,COALESCE(SUM(s.active_seconds),0)::bigint AS active_seconds,COUNT(*) FILTER(WHERE s.completed)::int AS completed FROM learning_sessions s JOIN contents c ON c.id=s.content_id WHERE s.started_at>=now()-($1::int*interval '1 day') GROUP BY s.content_id,c.title ORDER BY sessions DESC LIMIT 30`,[days]),
 db.query(`SELECT g.content_id,c.title,COUNT(*)::int AS attempts,ROUND(100.0*SUM(a.score)/NULLIF(SUM(a.total),0),1) AS accuracy_percent FROM review_attempts a JOIN review_guides g ON g.id=a.review_guide_id JOIN contents c ON c.id=g.content_id WHERE a.created_at>=now()-($1::int*interval '1 day') GROUP BY g.content_id,c.title ORDER BY attempts DESC LIMIT 30`,[days]),
 db.query(`SELECT COUNT(*)::int AS page_views, COUNT(DISTINCT visitor_id)::int AS unique_clients,
 COUNT(DISTINCT visitor_id) FILTER (WHERE v.created_at >= now()-($1::int*interval '1 day'))::int AS new_clients,
 COUNT(DISTINCT visitor_id) FILTER (WHERE v.created_at < now()-($1::int*interval '1 day'))::int AS returning_clients
 FROM learning_page_visits p JOIN learning_visitors v ON v.id=p.visitor_id
 WHERE p.visited_at >= now()-($1::int*interval '1 day')`,[days]),
 db.query(`WITH dates AS (
   SELECT (timezone('Asia/Seoul',now())::date - offs.n)::date AS day
   FROM generate_series(0,$1::int-1) AS offs(n)
 ), pv AS (
   SELECT (p.visited_at AT TIME ZONE 'Asia/Seoul')::date AS day,
     COUNT(*)::int AS page_views, COUNT(DISTINCT p.visitor_id)::int AS unique_clients
   FROM learning_page_visits p
   WHERE p.visited_at >= ((timezone('Asia/Seoul',now())::date - ($1::int-1))::timestamp AT TIME ZONE 'Asia/Seoul')
   GROUP BY 1
 ), ls AS (
   SELECT (s.started_at AT TIME ZONE 'Asia/Seoul')::date AS day,
     COUNT(*)::int AS sessions, COUNT(DISTINCT s.visitor_id)::int AS learners,
     COALESCE(SUM(s.active_seconds),0)::bigint AS active_seconds
   FROM learning_sessions s
   WHERE s.started_at >= ((timezone('Asia/Seoul',now())::date - ($1::int-1))::timestamp AT TIME ZONE 'Asia/Seoul')
   GROUP BY 1
 )
 SELECT to_char(d.day,'YYYY-MM-DD') AS day,
   COALESCE(pv.page_views,0)::int AS page_views,
   COALESCE(pv.unique_clients,0)::int AS unique_clients,
   COALESCE(ls.sessions,0)::int AS sessions,
   COALESCE(ls.learners,0)::int AS learners,
   COALESCE(ls.active_seconds,0)::bigint AS active_seconds
 FROM dates d LEFT JOIN pv ON pv.day=d.day LEFT JOIN ls ON ls.day=d.day
 ORDER BY d.day`,[days])]);return res.json({ok:true,days,summary:{...summary.rows[0],...visits.rows[0]},contents:contents.rows,reviews:reviews.rows,daily:daily.rows});}catch(e){console.error('Admin learning stats:',e.message);return res.status(500).json({ok:false,error:'Unable to load analytics'});}};
