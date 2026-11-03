const cancelledResults=new WeakSet();
function cancelledResult(){const value=[];cancelledResults.add(value);return value;}
function isCancelledResult(value){return Array.isArray(value)&&cancelledResults.has(value);}
function createSharedExecutor(execute,{now=Date.now,ttl=30000,maxEntries=64,maxEntryBytes=131072,log=data=>console.log(JSON.stringify(data))}={}){
 const cache=new Map(),pending=new Map();
 const copy=x=>JSON.parse(JSON.stringify(x));
 function expiry(streams){let until=now()+ttl;
  if(!streams.length)return 0;
  for(const s of streams){if(!s||typeof s.url!=='string')return 0;let u;try{u=new URL(s.url);}catch{return 0;}if(!['https:','http:'].includes(u.protocol))return 0;
   for(const key of ['exp','expires','Expires']){const v=Number(u.searchParams.get(key));if(Number.isFinite(v)&&v>1000000000)until=Math.min(until,(v>100000000000? v:v*1000)-10000);}
   const d=u.searchParams.get('X-Amz-Date'),duration=Number(u.searchParams.get('X-Amz-Expires'));
   if(d){const m=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(d);if(!m||!Number.isFinite(duration)||duration<=0)return 0;until=Math.min(until,Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])+duration*1000-10000);}
  }return until;
 }
 return function run(entry,args,signal,deadline){
  if(signal?.aborted||deadline<=now())return Promise.resolve(cancelledResult());
  const key=JSON.stringify([entry.id,entry.filename||'',args]);const hit=cache.get(key);
  if(hit&&hit.until>now()){log({event:'provider_cache_hit',provider:entry.id});return Promise.resolve(copy(hit.streams));}cache.delete(key);
  let task=pending.get(key);if(task?.controller.signal.aborted){pending.delete(key);task=null;}
  if(!task){
   task={controller:new AbortController(),users:0,done:false};pending.set(key,task);const started=now();
   task.promise=Promise.resolve().then(()=>execute(entry,args,task.controller.signal,now()+(entry.id==='pressplay'?60000:20000))).then(value=>{
    task.done=true;const streams=Array.isArray(value)?value:[];
    if(!task.controller.signal.aborted){try{const until=expiry(streams),encoded=JSON.stringify(streams);if(until>now()&&Buffer.byteLength(encoded)<=maxEntryBytes){cache.delete(key);cache.set(key,{until,streams:JSON.parse(encoded)});while(cache.size>maxEntries)cache.delete(cache.keys().next().value);}}catch{}}
    log({event:'provider_extraction_finished',provider:entry.id,ms:now()-started,count:streams.length,cancelled:task.controller.signal.aborted});return streams;
   },error=>{task.done=true;throw error;}).finally(()=>{if(pending.get(key)===task)pending.delete(key);});
   task.promise.catch(()=>{});
  }else log({event:'provider_shared_request',provider:entry.id});
  task.users++;
  return new Promise((resolve,reject)=>{
   let settled=false,timer;
   const finish=(value,error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);task.users--;if(!task.users&&!task.done)task.controller.abort();if(error)reject(error);else resolve(value);};
   const cancel=()=>finish(cancelledResult());
   signal?.addEventListener('abort',cancel,{once:true});if(Number.isFinite(deadline))timer=setTimeout(cancel,Math.max(0,deadline-now()));
   task.promise.then(value=>{if(settled)return;if(signal?.aborted||deadline<=now())return cancel();try{finish(copy(value));}catch(error){finish(null,error);}},error=>{if(signal?.aborted||deadline<=now())cancel();else finish(null,error);});
   if(signal?.aborted)cancel();
  });
 };
}
module.exports={createSharedExecutor,isCancelledResult};
