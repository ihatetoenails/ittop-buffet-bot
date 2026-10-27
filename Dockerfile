FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY assets ./assets
COPY data ./data

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
