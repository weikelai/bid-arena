FROM node:22.15.0-alpine
WORKDIR /app
COPY agent-worker/worker.mjs ./worker.mjs
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8090/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","worker.mjs"]
