'use strict';
const { getPool } = require('../lib/db');
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const validDate = s => DATE.test(s) && !Number.isNaN(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
module.exports = async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'Method not allowed'});}
  const month = typeof req.query.month==='string'?req.query.month:'';
  const date = typeof req.query.date==='string'?req.query.date:'';
  if ((month && date) || (!month && !date) || (month && !MONTH.test(month)) || (date && !validDate(date))) return res.status(400).json({ok:false,error:'Invalid date or month'});
  const current = today();
  try {
    const pool=getPool();
    if(month){
      // Only finalized, playable past lessons; never expose future administrator schedules.
      const result=await pool.query(`SELECT to_char(h.learning_date,'YYYY-MM-DD') AS date,h.content_id,c.title,
        EXISTS(SELECT 1 FROM review_guides g WHERE g.content_id=h.content_id AND g.status='published') AS has_review
        FROM daily_content_history h JOIN contents c ON c.id=h.content_id
        JOIN content_media m ON m.content_id=c.id
        WHERE h.learning_date >= $1::date AND h.learning_date < ($1::date + interval '1 month')
          AND h.learning_date <= $2::date AND c.status='published'
          AND NULLIF(m.mp3_r2_key,'') IS NOT NULL
        ORDER BY h.learning_date`,[month+'-01',current]);
      return res.status(200).json({ok:true,month,days:result.rows});
    }
    if(date>current) return res.status(404).json({ok:false,error:'Past lessons only'});
    const result=await pool.query(`SELECT h.content_id,c.title,g.version,g.payload
      FROM daily_content_history h JOIN contents c ON c.id=h.content_id
      JOIN content_media m ON m.content_id=c.id
      LEFT JOIN LATERAL (SELECT version,payload FROM review_guides
        WHERE content_id=h.content_id AND status='published' ORDER BY version DESC LIMIT 1) g ON true
      WHERE h.learning_date=$1::date AND c.status='published'
        AND NULLIF(m.mp3_r2_key,'') IS NOT NULL LIMIT 1`,[date]);
    if(!result.rowCount) return res.status(404).json({ok:false,error:'No finalized lesson for this date'});
    const row=result.rows[0];
    const questions=Array.isArray(row.payload?.questions)?row.payload.questions.map((q,i)=>({
      number:i+1,question:q.question,options:q.options,
      answer:q.answer,explanation:q.explanation
    })):[];
    return res.status(200).json({ok:true,date,contentId:row.content_id,title:row.title,
      reviewVersion:row.version,questions});
  }catch(e){console.error('Review calendar failed:',e.message);return res.status(500).json({ok:false,error:'Review calendar unavailable'});}
};
