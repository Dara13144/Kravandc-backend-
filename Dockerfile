FROM node:20-bookworm-slim

# Install OpenSSL and certificates for Prisma & PostgreSQL connections
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --omit=dev --no-audit --no-fund
RUN npx prisma generate

COPY . .

ENV PORT=10000
ENV NODE_ENV=production

EXPOSE 10000

CMD ["node", "server.js"]
