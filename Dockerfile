FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY server.cjs provider-worker.cjs config-page.cjs pool.cjs pool.test.cjs source-policy.cjs castle-guards.cjs quality.test.cjs source-health.cjs health-panel.cjs health.test.cjs preferences.test.cjs source-tester.cjs tester.test.cjs ./
RUN npm run check && node --check config-page.cjs && node --check source-policy.cjs && node --check castle-guards.cjs && node --check source-health.cjs && node --check health-panel.cjs && node --check source-tester.cjs && node pool.test.cjs && node quality.test.cjs && node health.test.cjs && node preferences.test.cjs && node tester.test.cjs
USER node
ENV PORT=7000
EXPOSE 7000
CMD ["node","server.cjs"]
