FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY server.cjs provider-worker.cjs config-page.cjs pool.cjs pool.test.cjs source-policy.cjs castle-guards.cjs quality.test.cjs source-health.cjs health-panel.cjs health.test.cjs preferences.test.cjs source-tester.cjs tester.test.cjs movy.cjs movy.test.cjs install-movy.cjs cno-probe.cjs cno-probe.test.cjs cno.cjs cno.test.cjs install-cno.cjs ./
RUN node install-movy.cjs && node install-cno.cjs && node cno-probe.cjs && npm run check && node --check config-page.cjs && node --check source-policy.cjs && node --check castle-guards.cjs && node --check source-health.cjs && node --check source-tester.cjs && node --check movy.cjs && node --check cno-probe.cjs && node --check cno.cjs && node pool.test.cjs && node quality.test.cjs && node health.test.cjs && node preferences.test.cjs && node tester.test.cjs && node movy.test.cjs && node cno-probe.test.cjs && node cno.test.cjs
USER node
ENV PORT=7000
EXPOSE 7000
CMD ["node","-e","require('./server.cjs');(async()=>{const url='https://pressplayz.top/watch/tv-family-guy-fjboc?season=22&episode=1';const r=await fetch(url,{signal:AbortSignal.timeout(10000)});const html=await r.text();const $=require('cheerio').load(html);const clean=v=>{try{const u=new URL(v,url);return u.origin+u.pathname;}catch{return null;}};const scripts=$('script[src]').map((i,e)=>clean($(e).attr('src'))).get().slice(0,30);const islands=$('astro-island').map((i,e)=>{let keys=[];try{keys=Object.keys(JSON.parse($(e).attr('props')||'{}')).slice(0,30);}catch{}return {component:clean($(e).attr('component-url')),name:$(e).attr('component-export')||null,propKeys:keys};}).get().slice(0,25);const frames=$('iframe[src]').map((i,e)=>clean($(e).attr('src'))).get().slice(0,10);console.log(JSON.stringify({event:'pressplay_structure',status:r.status,scripts,islands,frames}));})().catch(e=>console.log(JSON.stringify({event:'pressplay_structure_failed',error:e.name})));" ]
