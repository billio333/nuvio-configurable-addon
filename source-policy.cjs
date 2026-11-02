function createPolicy(){
 const qualities=['2160','1080','720','480','unknown'];const defaults=['1080','720','unknown'];const hidden=new Set(['desiflix','dahmermovies','dahmermovies-tv','topcartoons','showbox','gramcinema']);
 const bad=r=>r.confirmed===true&&['wrong_show','wrong_episode'].includes(r.reason);
 function normalize(c){
  if(!c||!Array.isArray(c.sources)||c.sources.length>100)throw new Error('Invalid sources');
  const ids=a=>{if(!Array.isArray(a)||a.length>100||a.some(x=>typeof x!=='string'||!/^[-A-Za-z0-9_]+$/.test(x)))throw new Error('Invalid provider list');return [...new Set(a)];};
  const resolutions=c.resolutions===undefined?defaults:c.resolutions;if(!Array.isArray(resolutions)||resolutions.some(x=>!qualities.includes(x)))throw new Error('Invalid resolutions');
  const reports=c.reports||[];if(!Array.isArray(reports)||reports.length>200)throw new Error('Too many reports');
  for(const r of reports){if(!r||typeof r.source!=='string'||!/^[-A-Za-z0-9_]+$/.test(r.source)||!['movie','series'].includes(r.type)||!/^tt\d+$|^tmdb:\d+$/.test(r.media)||!['wrong_show','wrong_episode','buffering','http_error','timeout'].includes(r.reason)||typeof r.confirmed!=='boolean')throw new Error('Invalid report');if(r.reason==='wrong_episode'&&(!Number.isInteger(r.season)||r.season<0||!Number.isInteger(r.episode)||r.episode<1))throw new Error('Invalid report episode');}
  return {sources:ids(c.sources).filter(x=>!hidden.has(x)),resolutions:[...new Set(resolutions)],lowPriority:ids(c.lowPriority===undefined?['castle']:c.lowPriority),disabledSources:ids(c.disabledSources||[]),reports:reports.map(r=>({source:r.source,type:r.type,media:r.media,reason:r.reason,confirmed:r.confirmed,...(r.reason==='wrong_episode'?{season:r.season,episode:r.episode}:{})}))};
 }
 function strikes(c,id){return new Set(c.reports.filter(r=>r.source===id&&bad(r)).map(r=>JSON.stringify([r.type,r.media,r.reason==='wrong_show'?'show':[r.season,r.episode]]))).size;}
 function state(c,id){const count=strikes(c,id);return {count,low:c.lowPriority.includes(id)||count>0,quarantined:count>=3,disabled:c.disabledSources.includes(id),unavailable:id==='netmirror',hidden:hidden.has(id)};}
 function blocked(c,id,target){const s=state(c,id);if(s.disabled||s.quarantined||s.unavailable||s.hidden)return true;if(!target)return false;return c.reports.some(r=>r.source===id&&bad(r)&&r.type===target.type&&target.ids.includes(r.media)&&(r.reason==='wrong_show'||(r.season===target.season&&r.episode===target.episode)));}
 return {normalize,strikes,state,blocked};
}
module.exports={createPolicy};
