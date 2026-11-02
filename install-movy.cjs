const fs=require('node:fs');
function once(text,anchor,replacement){if(text.split(anchor).length!==2)throw Error('Movy integration anchor changed; review installer');return text.replace(anchor,replacement);}
function patchServer(text){
 if(text.includes("id:'movy-miami'"))return text;
 return once(text,'cached=data.scrapers;',"cached=[...data.scrapers.filter(e=>e.id!=='movy-miami'),{id:'movy-miami',name:'Movy - Miami (experimental)',supportedTypes:['movie','tv'],filename:'local:movy-miami'}];");
}
function patchWorker(text){
 if(text.includes("entry.id==='movy-miami'"))return text;
 return once(text,"log('worker_started',{adapterVersion:'0.1.5-health1'});","log('worker_started',{adapterVersion:'0.1.5-health1'});if(entry.id==='movy-miami'){stage='running_local_movy';const streams=await require('./movy.cjs').getStreams(...args,{fetch:tracedFetch,log});log('provider_completed',{isArray:true,count:streams.length});parentPort.postMessage(streams);return;}");
}
if(require.main===module){const server=patchServer(fs.readFileSync('server.cjs','utf8')),worker=patchWorker(fs.readFileSync('provider-worker.cjs','utf8'));fs.writeFileSync('server.cjs',server);fs.writeFileSync('provider-worker.cjs',worker);}
module.exports={patchServer,patchWorker};
