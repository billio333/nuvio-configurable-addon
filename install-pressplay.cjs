const fs=require('node:fs');
function once(text,anchor,replacement){if(text.split(anchor).length!==2)throw Error('PressPlay integration anchor changed');return text.replace(anchor,replacement);}
function patchServer(text){
 if(!text.includes('(2160|1080|720|480|360)'))text=once(text,'(2160|1080|720|480)','(2160|1080|720|480|360)');
 const concurrency="Math.max(1,Math.min(6,Number.parseInt(process.env.PROVIDER_CONCURRENCY||'4',10)||4))";
 if(!text.includes('process.env.PROVIDER_CONCURRENCY')){text=once(text,'createPool(2,execute)','createPool('+concurrency+',execute)');text=once(text,'globalWorkers:2,','globalWorkers:'+concurrency+',');}
 if(text.includes("id:'pressplay'"))return text;
 text=once(text,'cachedAt=Date.now();',"cachedAt=Date.now();cached=[...cached.filter(e=>e.id!=='pressplay'),{id:'pressplay',name:'PressPlay / MoviesAPI (experimental, slow)',supportedTypes:['movie','tv'],filename:'local:pressplay'}];");
 text=once(text,'function execute(entry,args,signal,deadline){return new Promise(resolve=>{',"function execute(entry,args,signal,deadline){if(entry.id==='pressplay')return require('./pressplay.cjs').getStreams(...args,{signal,deadline});return new Promise(resolve=>{");
 text=once(text,'deadline=started+18000;',"deadline=started+(decode(path[0]).sources.includes('pressplay')?60000:18000);");
 return once(text,'requestBudgetMs:18000,','requestBudgetMs:18000,pressplayRequestBudgetMs:60000,');
}
function patchTester(text){return text.includes("source==='pressplay'?65000:25000")||text.includes("['pressplay','levidia'].includes(source)?65000:25000")?text:once(text,'},25000);',"},source==='pressplay'?65000:25000);");}
function patchProvider(text){
 const auto="  streams.push({name:'PressPlay / MoviesAPI',title:'PressPlay / MoviesAPI | Auto | Playback unverified',quality:'unknown',url:resolved,headers:forUrl(resolved)});\n";
 if(text.includes(auto))text=once(text,auto,'');
 const old='   if(variant.url===resolved)continue;',fixed='   if(!Number.isFinite(variant.height)||variant.height<=360)continue;';
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
function patchReuse(text){
 if(text.includes('async function borrowBrowser('))return text;
 const helpers=`let busy=false;
let heldBrowser=null,idleTimer=null,heldSince=0,heldUses=0,lastBrowserReused=false;
async function borrowBrowser(options){
 clearTimeout(idleTimer);idleTimer=null;
 if(heldBrowser&&heldBrowser.isConnected()){lastBrowserReused=true;heldUses++;return heldBrowser;}
 lastBrowserReused=false;const b=await chromium.launch(options);heldBrowser=b;heldSince=Date.now();heldUses=1;
 b.on('disconnected',()=>{if(heldBrowser===b)heldBrowser=null;});return b;
}
async function releaseBrowser(b,discard){
 if(!b.isConnected())return;
 if(discard||heldUses>=5||Date.now()-heldSince>=180000){if(heldBrowser===b)heldBrowser=null;await b.close().catch(()=>{});return;}
 clearTimeout(idleTimer);idleTimer=setTimeout(()=>{if(!busy&&heldBrowser===b){heldBrowser=null;b.close().catch(()=>{});}},60000);idleTimer.unref?.();
}`;
 text=once(text,'let busy=false;',helpers);
 text=once(text,'busy=true;let browser;','busy=true;let browser,context;');
 text=once(text,'browser=await chromium.launch({','browser=await borrowBrowser({');
 text=once(text,'const context=await browser.newContext();const page=await context.newPage();','context=await browser.newContext();const page=await context.newPage();');
 text=once(text,"phase:'browser_launch',phaseMs:","phase:'browser_launch',browserReused:lastBrowserReused,phaseMs:");
 return once(text,"if(browser)await browser.close().catch(()=>{});busy=false;log({stage:'timing'","if(context)await context.close().catch(()=>{});if(browser)await releaseBrowser(browser,!!signal?.aborted||!context);busy=false;log({stage:'timing'");
}
function patchConfig(text){
 if(text.includes('Your added sources'))return text;
 const metadata=".map(e=>({id:e.id,name:e.name,group:['movy-miami','cno','pressplay'].includes(e.id)?'custom':'original',note:({'4khdhub':'User-reported working previously. Recently missing results: unresolved; not a current playback guarantee.','pressplay':'Playback confirmed by you for Family Guy S22E1. Browser extraction is slow; 360p and unrestricted Auto are excluded.','cno':'Returned one link in your test; repeat-request cache tested. Playback confirmation not recorded.','movy-miami':'Experimental custom source. Working playback has not been established.'})[e.id]||'Playback not verified in this project.'}));";
 text=once(text,'.map(e=>({id:e.id,name:e.name}));',metadata);
 text=once(text,"$('sources').innerHTML=entries.map(e=>{const s=p.state(c,e.id);","$('sources').innerHTML=['original','custom'].map(group=>'<details '+(group==='custom'?'open':'')+'><summary>'+(group==='custom'?'Your added sources':'Original sources')+' ('+entries.filter(e=>e.group===group).length+')</summary>'+entries.filter(e=>e.group===group).map(e=>{const s=p.state(c,e.id);");
 text=once(text,"}).join('');\n  $('reports')","}).join('')+'</details>').join('');\n  $('reports')");
 text=once(text,"+esc(e.name)+'</label><label>","+esc(e.name)+'</label><p>'+esc(e.note)+'</p><label>");
 text=once(text,'healthPanel(visible)',"('<details><summary>Live source observations (not playback verification)</summary>'+healthPanel(visible)+'</details>')");
 return text;
}
if(require.main===module){
 const server=patchServer(fs.readFileSync('server.cjs','utf8')),tester=patchTester(fs.readFileSync('source-tester.cjs','utf8')),provider=patchReuse(patchProvider(fs.readFileSync('pressplay.cjs','utf8'))),config=patchConfig(fs.readFileSync('config-page.cjs','utf8'));
 const assert=require('node:assert/strict');const vm=require('node:vm');
 const start=server.indexOf('function resolution(s){'),end=server.indexOf('\nfunction execute',start);
 assert.ok(start>=0&&end>start);const resolution=vm.runInNewContext('('+server.slice(start,end).trim()+')');
 assert.equal(resolution({quality:'360p'}),'360');assert.equal(resolution({title:'Example 360p'}),'360');assert.equal(resolution({quality:'2160p'}),'2160');assert.equal(resolution({quality:'1080p'}),'1080');assert.equal(resolution({quality:'unknown'}),'unknown');
 assert.equal(patchReuse(provider),provider);assert.equal(patchProvider(provider),provider);assert.equal(patchServer(server),server);assert.equal(patchConfig(config),config);assert.ok(!provider.includes('Auto | Playback unverified'));
 const expression="Math.max(1,Math.min(6,Number.parseInt(process.env.PROVIDER_CONCURRENCY||'4',10)||4))";
 for(const [value,expected] of [[undefined,4],['1',1],['6',6],['100',6],['-2',1],['bad',4]])assert.equal(vm.runInNewContext(expression,{process:{env:value===undefined?{}:{PROVIDER_CONCURRENCY:value}}}),expected);
 assert.ok(server.includes('createPool('+expression+',execute)'));assert.ok(server.includes('globalWorkers:'+expression+','));
 for(const phase of ['browser_launch','playlist_wait','master_fetch','cleanup'])assert.ok(provider.includes("phase:'"+phase+"'"));
 new vm.Script(provider);new vm.Script(config);
 fs.writeFileSync('server.cjs',server);fs.writeFileSync('source-tester.cjs',tester);fs.writeFileSync('pressplay.cjs',provider);fs.writeFileSync('config-page.cjs',config);
 const html=require('./config-page.cjs').renderConfig([{id:'4khdhub',name:'4KHDHub'},{id:'pressplay',name:'PressPlay'},{id:'cno',name:'Cno'}],{sources:[]});
 assert.ok(html.includes('Your added sources'));assert.ok(html.includes('Original sources'));assert.ok(html.includes('Recently missing results: unresolved'));
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
}
module.exports={patchServer,patchTester,patchProvider,patchReuse,patchConfig};
