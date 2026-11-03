const fs=require('node:fs');
function once(text,anchor,replacement){if(text.split(anchor).length!==2)throw Error('PressPlay integration anchor changed');return text.replace(anchor,replacement);}
function patchServer(text){
 if(text.includes("id:'pressplay'"))return text;
 text=once(text,'cachedAt=Date.now();',"cachedAt=Date.now();cached=[...cached.filter(e=>e.id!=='pressplay'),{id:'pressplay',name:'PressPlay / MoviesAPI (experimental, slow)',supportedTypes:['movie','tv'],filename:'local:pressplay'}];");
 text=once(text,'function execute(entry,args,signal,deadline){return new Promise(resolve=>{',"function execute(entry,args,signal,deadline){if(entry.id==='pressplay')return require('./pressplay.cjs').getStreams(...args,{signal,deadline});return new Promise(resolve=>{");
 text=once(text,'deadline=started+18000;',"deadline=started+(decode(path[0]).sources.includes('pressplay')?60000:18000);");
 return once(text,'requestBudgetMs:18000,','requestBudgetMs:18000,pressplayRequestBudgetMs:60000,');
}
function patchTester(text){return text.includes("source==='pressplay'?65000:25000")?text:once(text,'},25000);',"},source==='pressplay'?65000:25000);");}
if(require.main===module){const server=patchServer(fs.readFileSync('server.cjs','utf8')),tester=patchTester(fs.readFileSync('source-tester.cjs','utf8'));fs.writeFileSync('server.cjs',server);fs.writeFileSync('source-tester.cjs',tester);}
module.exports={patchServer,patchTester};
