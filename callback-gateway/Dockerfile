FROM node:24-alpine
WORKDIR /app
COPY server.mjs ./
ENV PORT=3105
EXPOSE 3105
USER node
CMD ["node", "server.mjs"]
