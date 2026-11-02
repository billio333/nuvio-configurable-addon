const {Worker}=require('node:worker_threads');
function createService({factory=(entry,root)=>new Worker(require.resolve('./netmirror-worker.cjs'),{workerData:{entry,root},resourceLimits:{maxOldGenerationSizeMb:96}}),warmMs=120000,jobMs=60000,idleMs=600000,cooldownMs=60000}={}){
  let worker=null,phase='idle',busy=null,timer,idleTimer,retryAt=0,serial=0;const cache=new Map();
  const log=(event,data={})=>console.log(JSON.stringify({provider:'netmirror',event,...data}));
  const complete=value=>{if(!busy)return;const job=busy;busy=null;clearTimeout(timer);if(value.length){cache.set(job.key,{until:Date.now()+15000,value});while(cache.size>16)cache.delete(cache.keys().next().value);}job.resolve(value);};
  function stop(reason,failed=false){const old=worker;worker=null;phase=failed?'cooldown':'idle';retryAt=failed?Date.now()+cooldownMs:0;clearTimeout(timer);clearTimeout(idleTimer);complete([]);cache.clear();if(old)old.terminate().catch(()=>{});log(reason);}
  function idle(){clearTimeout(idleTimer);idleTimer=setTimeout(()=>stop('idle_session_released'),idleMs);idleTimer.unref?.();}
  function start(entry,root){
    phase='warming';log('session_warming');
    let current;try{current=factory(entry,root);worker=current;}catch{stop('session_start_failed',true);return;}
    timer=setTimeout(()=>{if(worker===current)stop('session_warm_timeout',true);},warmMs);
    current.on('message',message=>{
      if(worker!==current)return;
      if(message.kind==='ready'){clearTimeout(timer);phase='ready';log('session_ready');idle();}
      else if(message.kind==='failed')stop('session_initialization_failed',true);
      else if(message.kind==='result'&&busy&&message.id===busy.id){const value=Array.isArray(message.streams)?message.streams:[];log('session_job_completed',{count:value.length});complete(value);idle();}
    });
    current.on('error',()=>{if(worker===current)stop('session_worker_error',true);});
    current.on('exit',()=>{if(worker===current)stop('session_worker_exit',true);});
  }
  function wait(promise,signal,deadline){return new Promise(resolve=>{
    let settled=false;let timeout;const done=value=>{if(settled)return;settled=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);resolve(value);};const abort=()=>done([]);
    if(signal?.aborted||Date.now()>=deadline)return done([]);
    signal?.addEventListener('abort',abort,{once:true});timeout=setTimeout(abort,Math.max(1,deadline-Date.now()));promise.then(done,()=>done([]));
  });}
  async function request(entry,args,{root,signal,deadline}){
    if(signal?.aborted||Date.now()>=deadline)return [];
    if(!worker){if(Date.now()<retryAt){log('session_retry_cooldown');return [];}start(entry,root);return [];}
    if(phase!=='ready'){log('session_not_ready',{phase});return [];}
    const key=JSON.stringify(args);const hit=cache.get(key);if(hit&&hit.until>Date.now())return hit.value;cache.delete(key);
    if(busy){if(busy.key===key)return wait(busy.promise,signal,deadline);log('session_busy_other_title');return [];}
    clearTimeout(idleTimer);let resolve;const promise=new Promise(r=>resolve=r);busy={id:++serial,key,promise,resolve};
    timer=setTimeout(()=>stop('session_job_timeout',true),jobMs);log('session_job_started');
    try{worker.postMessage({kind:'run',id:busy.id,args});}catch{stop('session_post_failed',true);}
    return wait(promise,signal,deadline);
  }
  return {request,status:()=>({phase,busy:!!busy,worker:!!worker}),close:()=>stop('session_closed')};
}
module.exports={createService};
