FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN rm -rf src/test && find src -name '*.test.ts' -delete && find src -name '*.spec.ts' -delete
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
