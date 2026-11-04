'use strict';
const fs = require('node:fs');

function once(text, anchor, replacement, label) {
  if (text.split(anchor).length !== 2) throw new Error(`Levidia integration anchor changed: ${label}`);
  return text.replace(anchor, replacement);
}
function patchServer(text) {
  if (text.includes("id:'levidia'")) return text;
  const inventory = "cachedAt=Date.now();cached=[...cached.filter(e=>e.id!=='pressplay'),{id:'pressplay',name:'PressPlay / MoviesAPI (experimental, slow)',supportedTypes:['movie','tv'],filename:'local:pressplay'}];";
  text = once(text, inventory, inventory + "cached=[...cached.filter(e=>e.id!=='levidia'),{id:'levidia',name:'Levidia / Wootly (experimental)',supportedTypes:['tv'],filename:'local:levidia'}];", 'provider inventory');
  const execute = "if(entry.id==='pressplay')return require('./pressplay.cjs').getStreams(...args,{signal,deadline});return new Promise(resolve=>{";
  text = once(text, execute, "if(entry.id==='pressplay')return require('./pressplay.cjs').getStreams(...args,{signal,deadline});if(entry.id==='levidia')return require('./levidia.cjs').getStreams(...args,{signal,deadline});return new Promise(resolve=>{", 'local execution');
  text = once(text, "deadline=started+(decode(path[0]).sources.includes('pressplay')?60000:18000);", "deadline=started+(decode(path[0]).sources.some(id=>['pressplay','levidia'].includes(id))?60000:18000);", 'request budget');
  return text;
}
function patchPool(text) {
  if (text.includes("['pressplay','levidia'].includes")) return text;
  text = once(text, "waiting.findIndex(b=>b.pending[0]?.id!=='pressplay')", "waiting.findIndex(b=>!['pressplay','levidia'].includes(b.pending[0]?.id))", 'browser queue');
  text = once(text, "if(entry.id==='pressplay')browserActive=true;", "if(['pressplay','levidia'].includes(entry.id))browserActive=true;", 'browser lock start');
  text = once(text, "if(entry.id==='pressplay')browserActive=false;", "if(['pressplay','levidia'].includes(entry.id))browserActive=false;", 'browser lock release');
  return text;
}
function patchProviderCache(text) {
  const updated = "now()+(['pressplay','levidia'].includes(entry.id)?60000:20000)";
  if (text.includes(updated)) return text;
  return once(text, "now()+(entry.id==='pressplay'?60000:20000)", updated, 'provider deadline');
}
function patchTester(text) {
  const updated = "['pressplay','levidia'].includes(source)?65000:25000";
  if (text.includes(updated)) return text;
  return once(text, "source==='pressplay'?65000:25000", updated, 'tester deadline');
}
function patchConfig(text) {
  if (text.includes("'levidia':'Experimental; browser captured")) return text;
  text = once(text, "group:['movy-miami','cno','pressplay'].includes(e.id)?'custom':'original'", "group:['movy-miami','cno','pressplay','levidia'].includes(e.id)?'custom':'original'", 'custom-source group');
  text = once(text, "'pressplay':'Playback confirmed by you for Family Guy S22E1. Browser extraction is slow; 360p and unrestricted Auto are excluded.',", "'pressplay':'Playback confirmed by you for Family Guy S22E1. Browser extraction is slow; 360p and unrestricted Auto are excluded.','levidia':'Experimental; browser captured an HTTP MP4 for Family Guy S22E1. Nuvio playback is unverified.',", 'source note');
  return text;
}
function patchPolicy(text) {
  if (text.includes("['castle','levidia']")) return text;
  return once(text, "lowPriority:ids(c.lowPriority===undefined?['castle']:c.lowPriority)", "lowPriority:ids(c.lowPriority===undefined?['castle','levidia']:c.lowPriority)", 'default priority');
}
function install() {
  const changes = [
    ['server.cjs', patchServer],
    ['pool.cjs', patchPool],
    ['provider-cache.cjs', patchProviderCache],
    ['source-tester.cjs', patchTester],
    ['config-page.cjs', patchConfig],
    ['source-policy.cjs', patchPolicy]
  ];
  for (const [file, patch] of changes) fs.writeFileSync(file, patch(fs.readFileSync(file, 'utf8')));
}
if (require.main === module) install();
module.exports = { install, patchServer, patchPool, patchProviderCache, patchTester, patchConfig, patchPolicy };
