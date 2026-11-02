FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY server.cjs provider-worker.cjs config-page.cjs pool.cjs pool.test.cjs netmirror-service.cjs netmirror-worker.cjs netmirror.test.cjs ./
RUN npm run check && node --check config-page.cjs && node --check pool.cjs && node --check netmirror-service.cjs && node --check netmirror-worker.cjs && node pool.test.cjs && node netmirror.test.cjs
USER node
ENV PORT=7000
EXPOSE 7000
CMD ["node","server.cjs"]
