const {createPolicy}=require('./source-policy.cjs');
function buildProbe(config,source,type,media,season,episode,allResolutions,origin){
 if(!/^[-A-Za-z0-9_]+$/.test(source))throw new Error('Choose a source.');
 if(!['movie','series'].includes(type)||!/^tt\d+$|^tmdb:\d+$/.test(media))throw new Error('Use an IMDb ID such as tt23148340, or tmdb:12345.');
 let id=media;
 if(type==='series'){if(!Number.isInteger(season)||season<0||!Number.isInteger(episode)||episode<1)throw new Error('Enter a valid season and episode.');id+=':'+season+':'+episode;}
 const c={...config,sources:[source],resolutions:allResolutions?['2160','1080','720','480','unknown']:config.resolutions};
 const bytes=new TextEncoder().encode(JSON.stringify(c));const token=btoa(String.fromCharCode(...bytes)).split('+').join('-').split('/').join('_').split('=').join('');
 return origin+'/'+token+'/stream/'+type+'/'+encodeURIComponent(id)+'.json';
}
function testerApp(build,config,entries){
 const $=id=>document.getElementById('probe-'+id);let running=false,controller=null,stopped=false;const summaries=[];
 function outputSummary(){$('report').value=JSON.stringify(summaries,null,2);}
 function card(source){const box=document.createElement('div');box.className='source';const heading=document.createElement('h3');heading.textContent=entries.find(e=>e.id===source)?.name||source;box.append(heading);const status=document.createElement('p');status.textContent='Testing...';box.append(status);$('results').append(box);return {box,status};}
 async function run(ids){
  if(running)return;running=true;stopped=false;summaries.length=0;$('results').replaceChildren();outputSummary();$('one').disabled=true;$('candidates').disabled=true;$('stop').disabled=false;
  const type=$('type').value,media=$('media').value.trim(),season=Number($('season').value),episode=Number($('episode').value),all=$('allres').checked;
  try{for(const source of ids){
   if(stopped)break;const view=card(source);const started=performance.now();let timer,timedOut=false;controller=new AbortController();
   try{
    const url=build(config,source,type,media,season,episode,all,location.origin);
    timer=setTimeout(()=>{timedOut=true;controller.abort();},25000);
    const response=await fetch(url,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error('Service HTTP '+response.status);
    const data=await response.json();if(data.error)throw new Error(data.error);if(!Array.isArray(data.streams))throw new Error('Invalid stream response');
    const seconds=Number(((performance.now()-started)/1000).toFixed(2));view.status.textContent=data.streams.length+' links returned in '+seconds+' seconds. '+(data.streams.length?'Playback and content correctness are not verified.':'This can mean no content, filtering, a block/cooldown, or provider failure.');
    summaries.push({source,type,media,season:type==='series'?season:null,episode:type==='series'?episode:null,count:data.streams.length,seconds,allResolutions:all,status:'responded',sampleTitles:data.streams.slice(0,3).map(s=>s.title||s.name||'')});
    if(data.streams.length){
     const select=document.createElement('button');select.type='button';select.textContent='Select this source in my configuration';select.onclick=()=>{const checkbox=Array.from(document.querySelectorAll('input[name=source]')).find(x=>x.value===source);if(!checkbox||checkbox.disabled){view.status.textContent+=' Source is disabled or quarantined; review its controls first.';return;}checkbox.checked=true;select.textContent='Selected — generate a replacement install URL in the main controls';};view.box.append(select);
     for(const stream of data.streams.slice(0,5)){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=stream.name||source;const text=document.createElement('pre');text.textContent=stream.title||'';details.append(summary,text);if(typeof stream.url==='string'&&/^https?:\/\//.test(stream.url)){const link=document.createElement('a');link.href=stream.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open returned link (may download; not playback-verified)';details.append(link);}view.box.append(details);}
    }
   }catch(error){const message=stopped?'Stopped':timedOut?'Browser test timed out; service may be waking or overloaded':error.message;view.status.textContent=message;summaries.push({source,type,media,status:'error',message,seconds:Number(((performance.now()-started)/1000).toFixed(2))});}
   finally{clearTimeout(timer);controller=null;outputSummary();}
  }}finally{running=false;$('one').disabled=false;$('candidates').disabled=false;$('stop').disabled=true;}
 }
 $('one').onclick=()=>run([$('source').value]);$('candidates').onclick=()=>run(['dooflix','fibwatch','hdghartv'].filter(id=>entries.some(e=>e.id===id)));$('stop').onclick=()=>{stopped=true;controller?.abort();};$('copy').onclick=()=>{$('report').focus();$('report').select();navigator.clipboard?.writeText($('report').value).catch(()=>{});};
}
function renderSourceTester(entries,config){
 const policy=createPolicy();const available=entries.filter(e=>!policy.blocked(config,e.id)).map(e=>({id:e.id,name:e.name}));const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const json=x=>JSON.stringify(x).replace(/</g,'\\u003c');
 return '<section><h2>Source tester — revision 1</h2><p>Test one provider without changing your installed addon. Uses the settings and reports from the URL loaded in this page; generate and reopen a new settings URL before testing newly staged reports. Source cooldowns and content blocks still apply. Tests make real source requests and contribute completed observations to source health.</p><label>Source<select id="probe-source">'+available.map(e=>'<option value="'+esc(e.id)+'" '+(e.id==='dooflix'?'selected':'')+'>'+esc(e.name)+'</option>').join('')+'</select></label><label>Type<select id="probe-type"><option value="series">Series</option><option value="movie">Movie</option></select></label><label>Media ID<input id="probe-media" value="tt23148340"></label><label>Season<input id="probe-season" type="number" min="0" value="1"></label><label>Episode<input id="probe-episode" type="number" min="1" value="1"></label><label><input id="probe-allres" type="checkbox">Ignore resolution filtering for this diagnostic only</label><p>Default test: Crystal Lake S1E1. Use a title you know a source carries. Returned links do not prove the correct video plays.</p><button id="probe-one" type="button">Test selected source</button><button id="probe-candidates" type="button">Test DooFlix, FibWatch and HDGharTV sequentially</button><button id="probe-stop" type="button" disabled>Stop tests</button><div id="probe-results"></div><label>Diagnostic summary<textarea id="probe-report" readonly></textarea></label><button id="probe-copy" type="button">Copy diagnostic summary</button><p>The summary excludes playback URLs and your configuration token; it includes the tested media ID and sample result titles. Selecting a provider here only stages a checkbox: generate and install the replacement URL to apply it.</p></section><script>('+testerApp.toString()+')('+buildProbe.toString()+','+json(config)+','+json(available)+');</script>';
}
module.exports={buildProbe,renderSourceTester};
