'use strict';
const ID=/^[A-Za-z0-9_-]{11}$/;
function validate(contentId,p) {
 if(!ID.test(contentId||'')||!p||typeof p!=='object'||Array.isArray(p)||p.contentId!==contentId||p.schemaVersion!=='1.0'||!Array.isArray(p.questions)||p.questions.length<1||p.questions.length>30) return 'Invalid review header';
 const seen=new Set();
 for(const q of p.questions){
  if(!q||typeof q.id!=='string'||!/^q[A-Za-z0-9_-]{0,30}$/.test(q.id)||seen.has(q.id)) return 'Invalid or duplicate question ID';
  seen.add(q.id);
  if(q.type!=='multiple_choice'||typeof q.question!=='string'||!q.question.trim()||q.question.length>500||!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some(x=>typeof x!=='string'||!x.trim()||x.length>300)||!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length||typeof q.explanation!=='string'||q.explanation.length>1000) return 'Invalid question: '+q.id;
 }
 return null;
}
module.exports={validate,ID};
