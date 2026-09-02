FROM node:20-alpine

# Install OpenSSL and libc compatibility libraries for Prisma query engine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --omit=dev
RUN npx prisma generate

COPY . .

ENV PORT=10000
ENV NODE_ENV=production

EXPOSE 10000

CMD ["node", "server.js"]
