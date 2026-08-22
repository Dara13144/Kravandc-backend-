FROM node:20-alpine

# Install OpenSSL and libc compatibility libraries for Prisma query engine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 5000 5050 10000

CMD ["npm", "start"]
