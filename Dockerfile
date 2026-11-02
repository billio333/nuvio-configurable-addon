FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY server.cjs provider-worker.cjs ./
RUN npm run check
USER node
ENV PORT=7000
EXPOSE 7000
CMD ["node","server.cjs"]
