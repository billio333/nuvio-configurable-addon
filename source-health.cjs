function createHealth({now=Date.now,threshold=8,windowMs=86400000,cooldownMs=900000}={}){
 const states=new Map();
 const key=(entry,args)=>entry.id+':'+(args[1]==='tv'?'tv':'movie');
 function get(entry,args){const k=key(entry,args);if(!states.has(k))states.set(k,{id:entry.id,type:args[1]==='tv'?'tv':'movie',attempts:0,hits:0,empty:new Map(),lastHit:null,lastAttempt:null,until:0,probing:false,cycles:0,errors:0});return states.get(k);}
 function configured(entry){return entry.id!=='showbox'||!!process.env.SHOWBOX_UI_TOKEN;}
 function allow(entry,args){if(!configured(entry))return false;const s=states.get(key(entry,args));return !s||(s.until<=now()&&!s.probing);}
 function begin(entry,args){if(!allow(entry,args))return false;const s=get(entry,args);if(s.until)s.probing=true;return true;}
 function release(entry,args){const s=states.get(key(entry,args));if(s)s.probing=false;}
 function record(entry,args,streams,{error=false}={}){
  if(!args[0])return;const s=get(entry,args);const t=now();s.probing=false;s.attempts++;s.lastAttempt=t;
  for(const [title,at] of s.empty)if(at<t-windowMs)s.empty.delete(title);
  const count=Array.isArray(streams)?streams.filter(x=>x&&typeof x.url==='string'&&/^https?:\/\//.test(x.url)).length:0;
  if(count){s.hits++;s.lastHit=t;s.empty.clear();s.until=0;s.errors=0;return;}
  if(error)s.errors++;else{s.errors=0;s.empty.set(String(args[0]),t);}
  if(s.empty.size>=threshold||s.errors>=3){s.until=t+cooldownMs;s.cycles++;console.log(JSON.stringify({event:'source_cooldown',provider:entry.id,type:s.type,reason:s.errors>=3?'execution_errors':'repeated_empty_adapter_results',distinctTitles:s.empty.size,until:s.until}));}
 }
 function snapshot(){const output={};for(const s of states.values()){(output[s.id]||=[]).push({type:s.type,attempts:s.attempts,hits:s.hits,distinctEmptyTitles:s.empty.size,lastHit:s.lastHit,lastAttempt:s.lastAttempt,cooldownUntil:s.until,phase:s.until>now()?'cooldown':s.probing?'probing':s.until?'retry_available':'active',cycles:s.cycles,suggestDisable:s.cycles>=3});}if(!process.env.SHOWBOX_UI_TOKEN)output.showbox=[{phase:'needs_configuration',note:'Requires SHOWBOX_UI_TOKEN in Render environment settings; never place tokens in the install URL.'}];return output;}
 return {allow,begin,release,record,snapshot};
}
const sourceHealth=createHealth();module.exports={createHealth,sourceHealth};
