FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN apk add --no-cache chromium && npm install --omit=dev --ignore-scripts && npm install --no-save --omit=dev --ignore-scripts playwright-core
COPY B2.png logo.png logo-data.cjs stream-format.cjs stream-format.test.cjs server.cjs provider-worker.cjs config-page.cjs pool.cjs pool.test.cjs provider-cache.cjs provider-cache.test.cjs source-policy.cjs castle-guards.cjs quality.test.cjs source-health.cjs health-panel.cjs health.test.cjs preferences.test.cjs source-tester.cjs tester.test.cjs movy.cjs movy.test.cjs install-movy.cjs cno-probe.cjs cno-probe.test.cjs cno.cjs cno.test.cjs install-cno.cjs pressplay.cjs install-pressplay.cjs pressplay.test.cjs streamingunity-probe.cjs ./
RUN node install-movy.cjs && node install-cno.cjs && node install-pressplay.cjs && node streamingunity-probe.cjs --install && node cno-probe.cjs && npm run check && node --check config-page.cjs && node --check stream-format.cjs && node --check source-policy.cjs && node --check castle-guards.cjs && node --check source-health.cjs && node --check source-tester.cjs && node --check movy.cjs && node --check cno-probe.cjs && node --check cno.cjs && node --check pressplay.cjs && node --check install-pressplay.cjs && node --check provider-cache.cjs && node --check streamingunity-probe.cjs && node pool.test.cjs && node provider-cache.test.cjs && node quality.test.cjs && node health.test.cjs && node preferences.test.cjs && node tester.test.cjs && node movy.test.cjs && node cno-probe.test.cjs && node cno.test.cjs && node pressplay.test.cjs && node stream-format.test.cjs
USER node
ENV PORT=7000
EXPOSE 7000
CMD ["node","server.cjs"]
