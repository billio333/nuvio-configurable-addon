const fs=require('node:fs');
function once(text,anchor,replacement){if(text.split(anchor).length!==2)throw Error('Cno source integration anchor changed');return text.replace(anchor,replacement);}
function patchServer(text){
 if(text.includes("id:'cno'"))return text;
 return once(text,'return cached;}',"return [...cached.filter(e=>e.id!=='cno'),{id:'cno',name:'Cno - direct HLS (experimental)',supportedTypes:['movie','tv'],filename:'local:cno'}];}");
}
function patchWorker(text){
 if(text.includes("entry.id==='cno'"))return text;
 const anchor="log('worker_started',{adapterVersion:'0.1.5-health1'});";
 return once(text,anchor,anchor+"if(entry.id==='cno'){stage='running_local_cno';const streams=await require('./cno.cjs').getStreams(...args,{fetch:tracedFetch,log});log('provider_completed',{isArray:true,count:streams.length});parentPort.postMessage(streams);return;}");
}
if(require.main===module){const server=patchServer(fs.readFileSync('server.cjs','utf8')),worker=patchWorker(fs.readFileSync('provider-worker.cjs','utf8'));fs.writeFileSync('server.cjs',server);fs.writeFileSync('provider-worker.cjs',worker);}
module.exports={patchServer,patchWorker};
