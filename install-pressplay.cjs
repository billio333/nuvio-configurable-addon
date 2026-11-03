const fs=require('node:fs');
function once(text,anchor,replacement){if(text.split(anchor).length!==2)throw Error('PressPlay integration anchor changed');return text.replace(anchor,replacement);}
function patchServer(text){
 if(!text.includes('(2160|1080|720|480|360)'))text=once(text,'(2160|1080|720|480)','(2160|1080|720|480|360)');
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
 return text;
}
if(require.main===module){
 const server=patchServer(fs.readFileSync('server.cjs','utf8')),tester=patchTester(fs.readFileSync('source-tester.cjs','utf8')),provider=patchProvider(fs.readFileSync('pressplay.cjs','utf8'));
 const assert=require('node:assert/strict');const vm=require('node:vm');
 const start=server.indexOf('function resolution(s){'),end=server.indexOf('\nfunction execute',start);
 assert.ok(start>=0&&end>start);const resolution=vm.runInNewContext('('+server.slice(start,end).trim()+')');
 assert.equal(resolution({quality:'360p'}),'360');assert.equal(resolution({title:'Example 360p'}),'360');assert.equal(resolution({quality:'2160p'}),'2160');assert.equal(resolution({quality:'1080p'}),'1080');assert.equal(resolution({quality:'unknown'}),'unknown');
 assert.equal(patchProvider(provider),provider);assert.ok(!provider.includes('Auto | Playback unverified'));
 fs.writeFileSync('server.cjs',server);fs.writeFileSync('source-tester.cjs',tester);fs.writeFileSync('pressplay.cjs',provider);
}
module.exports={patchServer,patchTester,patchProvider};
