const {sourceHealth}=require('./source-health.cjs');
const {createSharedExecutor,isCancelledResult}=require('./provider-cache.cjs');
function createPool(limit,execute){
 const sharedExecute=createSharedExecutor(execute);
 let active=0,browserActive=false;const waiting=[];let batches=0;
 function pump(){while(active<Math.min(limit,2)&&waiting.length&&!browserActive){
  for(let i=waiting.length-1;i>=0;i--){const b=waiting[i];if(b.finished)waiting.splice(i,1);else if(Date.now()>=b.deadline)b.finish('deadline');}
  if(!waiting.length)return;
  let index=waiting.findIndex(b=>b.pending[0]?.id!=='pressplay');
  if(index<0){if(active)return;index=0;}
  const b=waiting.splice(index,1)[0];
  const entry=b.pending.shift();if(b.pending.length)waiting.push(b);
  if(!sourceHealth.begin(entry,b.args)){if(!b.pending.length&&!b.running)b.finish('complete');continue;}
  active++;b.running++;if(entry.id==='pressplay')browserActive=true;
  console.log(JSON.stringify({event:'provider_queue_wait',provider:entry.id,ms:Date.now()-b.created}));
  Promise.resolve().then(()=>sharedExecute(entry,b.args,b.controller.signal,b.deadline)).then(streams=>{
   if(b.finished||b.controller.signal.aborted||isCancelledResult(streams)||Date.now()>=b.deadline){
    sourceHealth.release(entry,b.args);
    if(!b.finished&&(isCancelledResult(streams)||Date.now()>=b.deadline))b.finish('deadline');
    return;
   }
   sourceHealth.record(entry,b.args,streams);b.results.push({entry,streams:Array.isArray(streams)?streams:[]});
  },()=>{
   if(b.finished||b.controller.signal.aborted||Date.now()>=b.deadline){sourceHealth.release(entry,b.args);if(!b.finished)b.finish('deadline');}
   else sourceHealth.record(entry,b.args,[],{error:true});
  }).finally(()=>{active--;b.running--;if(entry.id==='pressplay')browserActive=false;if(!b.finished&&!b.pending.length&&!b.running)b.finish('complete');pump();});
 }}
 return function run(entries,args,{deadline,signal}={}){
  if(batches>=16)return Promise.reject(new Error('Service busy; retry shortly'));batches++;
  return new Promise(resolve=>{
   const b={pending:entries.slice().sort((a,b)=>Number(a.id==='pressplay')-Number(b.id==='pressplay')),args,created:Date.now(),deadline:deadline||Date.now()+18000,controller:new AbortController(),results:[],running:0,finished:false};let timer;const abort=()=>b.finish('client_disconnected');
   b.finish=reason=>{if(b.finished)return;b.finished=true;batches--;clearTimeout(timer);signal?.removeEventListener('abort',abort);b.controller.abort();for(let i=waiting.length-1;i>=0;i--)if(waiting[i]===b)waiting.splice(i,1);console.log(JSON.stringify({event:'batch_finished',reason,completed:b.results.length,unfinished:b.pending.length+b.running}));resolve(b.results);};
   if(!entries.length)return b.finish('complete');if(signal?.aborted)return b.finish('client_disconnected');signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>b.finish('deadline'),Math.max(0,b.deadline-Date.now()));waiting.push(b);pump();
  });
 };
}
module.exports={createPool};
