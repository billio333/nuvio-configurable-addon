const {parentPort,workerData}=require('node:worker_threads');
const vm=require('node:vm');
(async()=>{
  const {root,entry,args}=workerData;
  if(typeof entry.filename!=='string'||!/^providers\/[A-Za-z0-9_.-]+\.js$/.test(entry.filename))throw new Error('Unsafe provider path');
  const r=await fetch(root+entry.filename,{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('Provider download failed');
  const code=await r.text();
  const module={exports:{}};
  const context=vm.createContext({module,exports:module.exports,fetch,URL,URLSearchParams,Headers,Request,Response,AbortController,AbortSignal,TextEncoder,TextDecoder,Buffer,atob,btoa,crypto:globalThis.crypto,setTimeout,clearTimeout,setInterval,clearInterval,console:{log(){},warn(){},error(){}}});
  new vm.Script(code,{filename:entry.filename}).runInContext(context,{timeout:3000});
  const getStreams=module.exports.getStreams;
  if(typeof getStreams!=='function')throw new Error('Provider has no supported getStreams export');
  const result=await getStreams(...args);
  parentPort.postMessage(Array.isArray(result)?JSON.parse(JSON.stringify(result)):[]);
})().catch(()=>parentPort.postMessage([]));
