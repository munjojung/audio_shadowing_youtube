const assert=require('node:assert/strict');
const {validate}=require('../lib/review-validation');
const p={schemaVersion:'1.0',contentId:'7MFVtRS1fRw',questions:[{id:'q1',type:'multiple_choice',question:'What?',options:['A','B'],answer:0,explanation:'Because'}]};
assert.equal(validate(p.contentId,p),null);
assert.match(validate(p.contentId,{...p,questions:[{...p.questions[0],answer:3}]}),/Invalid question/);
assert.match(validate(p.contentId,{...p,contentId:'wrong'}),/Invalid review header/);
console.log('Review JSON validation: 3 passed');
