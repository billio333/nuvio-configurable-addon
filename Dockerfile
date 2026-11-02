FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY server.cjs provider-worker.cjs config-page.cjs pool.cjs pool.test.cjs source-policy.cjs castle-guards.cjs quality.test.cjs ./
RUN npm run check && node --check config-page.cjs && node --check source-policy.cjs && node --check castle-guards.cjs && node pool.test.cjs && node quality.test.cjs
USER node
ENV PORT=7000
EXPOSE 7000
CMD ["node","server.cjs"]
