const {sourceHealth}=require('./source-health.cjs');
const {createSharedExecutor}=require('./provider-cache.cjs');
function createPool(limit,execute){
 const sharedExecute=createSharedExecutor(execute);
 let active=0;const waiting=[];let batches=0;
 function pump(){while(active<limit&&waiting.length){
  const b=waiting.shift();if(b.finished)continue;if(Date.now()>=b.deadline){b.finish('deadline');continue;}
  const entry=b.pending.shift();if(b.pending.length)waiting.push(b);
  if(!sourceHealth.begin(entry,b.args)){if(!b.pending.length&&!b.running)b.finish('complete');continue;}
  active++;b.running++;
  console.log(JSON.stringify({event:'provider_queue_wait',provider:entry.id,ms:Date.now()-b.created}));
  Promise.resolve().then(()=>sharedExecute(entry,b.args,b.controller.signal,b.deadline)).then(streams=>{
   if(!b.finished){sourceHealth.record(entry,b.args,streams);b.results.push({entry,streams:Array.isArray(streams)?streams:[]});}else sourceHealth.release(entry,b.args);
  },()=>{if(!b.finished)sourceHealth.record(entry,b.args,[],{error:true});else sourceHealth.release(entry,b.args);}).finally(()=>{active--;b.running--;if(!b.finished&&!b.pending.length&&!b.running)b.finish('complete');pump();});
 }}
 return function run(entries,args,{deadline,signal}={}){
  if(batches>=16)return Promise.reject(new Error('Service busy; retry shortly'));batches++;
  return new Promise(resolve=>{
   const b={pending:entries.slice(),args,created:Date.now(),deadline:deadline||Date.now()+18000,controller:new AbortController(),results:[],running:0,finished:false};let timer;const abort=()=>b.finish('client_disconnected');
   b.finish=reason=>{if(b.finished)return;b.finished=true;batches--;clearTimeout(timer);signal?.removeEventListener('abort',abort);b.controller.abort();for(let i=waiting.length-1;i>=0;i--)if(waiting[i]===b)waiting.splice(i,1);console.log(JSON.stringify({event:'batch_finished',reason,completed:b.results.length,unfinished:b.pending.length+b.running}));resolve(b.results);};
   if(!entries.length)return b.finish('complete');if(signal?.aborted)return b.finish('client_disconnected');signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>b.finish('deadline'),Math.max(0,b.deadline-Date.now()));waiting.push(b);pump();
  });
 };
}
module.exports={createPool};
