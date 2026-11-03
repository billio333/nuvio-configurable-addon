const fs=require('node:fs');
function once(text,anchor,replacement){if(text.split(anchor).length!==2)throw Error('PressPlay integration anchor changed');return text.replace(anchor,replacement);}
function patchServer(text){
 if(!text.includes('(2160|1080|720|480|360)'))text=once(text,'(2160|1080|720|480)','(2160|1080|720|480|360)');
 const concurrency="Math.max(1,Math.min(6,Number.parseInt(process.env.PROVIDER_CONCURRENCY||'4',10)||4))";
 if(!text.includes('process.env.PROVIDER_CONCURRENCY')){
  text=once(text,'createPool(2,execute)','createPool('+concurrency+',execute)');
  text=once(text,'globalWorkers:2,','globalWorkers:'+concurrency+',');
 }
 if(text.includes("id:'pressplay'"))return text;
 text=once(text,'cachedAt=Date.now();',"cachedAt=Date.now();cached=[...cached.filter(e=>e.id!=='pressplay'),{id:'pressplay',name:'PressPlay / MoviesAPI (experimental, slow)',supportedTypes:['movie','tv'],filename:'local:pressplay'}];");
 text=once(text,'function execute(entry,args,signal,deadline){return new Promise(resolve=>{',"function execute(entry,args,signal,deadline){if(entry.id==='pressplay')return require('./pressplay.cjs').getStreams(...args,{signal,deadline});return new Promise(resolve=>{");
 text=once(text,'deadline=started+18000;',"deadline=started+(decode(path[0]).sources.includes('pressplay')?60000:18000);");
 return once(text,'requestBudgetMs:18000,','requestBudgetMs:18000,pressplayRequestBudgetMs:60000,');
}
function patchTester(text){return text.includes("source==='pressplay'?65000:25000")?text:once(text,'},25000);',"},source==='pressplay'?65000:25000);");}
function patchProvider(text){
 const auto="  streams.push({name:'PressPlay / MoviesAPI',title:'PressPlay / MoviesAPI | Auto | Playback unverified',quality:'unknown',url:resolved,headers:forUrl(resolved)});\n";
 if(text.includes(auto))text=once(text,auto,'');
 const old='   if(variant.url===resolved)continue;';
 const fixed='   if(!Number.isFinite(variant.height)||variant.height<=360)continue;';
 if(!text.includes(fixed))text=once(text,old,fixed);
 if(!text.includes("phase:'browser_launch'")){
  text=once(text,'  if(signal?.aborted)return [];',"  log({stage:'timing',phase:'browser_launch',phaseMs:Date.now()-started,nodeRssMiB:Math.round(process.memoryUsage().rss/1048576)});\n  if(signal?.aborted)return [];");
  text=once(text,'  const pending=page.waitForResponse',"  const playlistWaitStarted=Date.now();\n  const pending=page.waitForResponse");
  text=once(text,'  const response=await pending;if(!response)',"  const response=await pending;log({stage:'timing',phase:'playlist_wait',phaseMs:Date.now()-playlistWaitStarted});if(!response)");
  text=once(text,'  const r=await fetch(master,',"  const masterFetchStarted=Date.now();\n  const r=await fetch(master,");
  text=once(text,'  const resolved=r.url||master;',"  log({stage:'timing',phase:'master_fetch',phaseMs:Date.now()-masterFetchStarted});\n  const resolved=r.url||master;");
  text=once(text," finally{signal?.removeEventListener('abort',close);if(browser)await browser.close().catch(()=>{});busy=false;}"," finally{const cleanupStarted=Date.now();signal?.removeEventListener('abort',close);if(browser)await browser.close().catch(()=>{});busy=false;log({stage:'timing',phase:'cleanup',phaseMs:Date.now()-cleanupStarted,nodeRssMiB:Math.round(process.memoryUsage().rss/1048576)});}");
 }
 return text;
}
if(require.main===module){
 const server=patchServer(fs.readFileSync('server.cjs','utf8')),tester=patchTester(fs.readFileSync('source-tester.cjs','utf8')),provider=patchProvider(fs.readFileSync('pressplay.cjs','utf8'));
 const assert=require('node:assert/strict');const vm=require('node:vm');
 const start=server.indexOf('function resolution(s){'),end=server.indexOf('\nfunction execute',start);
 assert.ok(start>=0&&end>start);const resolution=vm.runInNewContext('('+server.slice(start,end).trim()+')');
 assert.equal(resolution({quality:'360p'}),'360');assert.equal(resolution({title:'Example 360p'}),'360');assert.equal(resolution({quality:'2160p'}),'2160');assert.equal(resolution({quality:'1080p'}),'1080');assert.equal(resolution({quality:'unknown'}),'unknown');
 assert.equal(patchProvider(provider),provider);assert.equal(patchServer(server),server);assert.ok(!provider.includes('Auto | Playback unverified'));
 const expression="Math.max(1,Math.min(6,Number.parseInt(process.env.PROVIDER_CONCURRENCY||'4',10)||4))";
 for(const [value,expected] of [[undefined,4],['1',1],['6',6],['100',6],['-2',1],['bad',4]])assert.equal(vm.runInNewContext(expression,{process:{env:value===undefined?{}:{PROVIDER_CONCURRENCY:value}}}),expected);
 assert.ok(server.includes('createPool('+expression+',execute)'));assert.ok(server.includes('globalWorkers:'+expression+','));
 for(const phase of ['browser_launch','playlist_wait','master_fetch','cleanup'])assert.ok(provider.includes("phase:'"+phase+"'"));
 fs.writeFileSync('server.cjs',server);fs.writeFileSync('source-tester.cjs',tester);fs.writeFileSync('pressplay.cjs',provider);
}
module.exports={patchServer,patchTester,patchProvider};
