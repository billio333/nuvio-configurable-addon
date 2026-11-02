const assert=require('node:assert/strict');const {createPool}=require('./pool.cjs');
(async()=>{
let active=0,max=0,stopped=0;
const pool=createPool(2,(entry,args,signal)=>new Promise(resolve=>{
active++;max=Math.max(max,active);let settled=false;
const done=()=>{if(settled)return;settled=true;clearTimeout(t);signal.removeEventListener('abort',cancel);active--;resolve([entry.id]);};
const cancel=()=>{stopped++;done();};const t=setTimeout(done,entry.ms);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
}));
const results=await Promise.all([pool([{id:'a',ms:5},{id:'b',ms:10},{id:'c',ms:5}],[],{deadline:Date.now()+500}),pool([{id:'d',ms:5}],[],{deadline:Date.now()+500})]);
assert.equal(max,2);assert.equal(results.flat().length,4);
const partial=await pool([{id:'fast',ms:5},{id:'slow',ms:500}],[],{deadline:Date.now()+40});
assert.equal(partial.length,1);assert.equal(partial[0].entry.id,'fast');assert.ok(stopped>=1);
const controller=new AbortController();const pending=pool([{id:'cancel',ms:500}],[],{deadline:Date.now()+500,signal:controller.signal});setTimeout(()=>controller.abort(),5);assert.equal((await pending).length,0);
console.log(JSON.stringify({tests:'passed',globalLimit:max,partialResults:partial.length,cancelled:stopped}));
})().catch(e=>{console.error(e);process.exitCode=1;});
