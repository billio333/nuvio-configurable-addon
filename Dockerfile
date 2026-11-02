FROM node:22-alpine
WORKDIR /app
COPY package.json server.cjs provider-worker.cjs ./
USER node
ENV PORT=7000
EXPOSE 7000
CMD ["node","server.cjs"]
