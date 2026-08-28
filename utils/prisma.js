require('dotenv').config();

// Ensure DATABASE_URL fallback if Render or hosting platform environment variable is missing
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgres')) {
  process.env.DATABASE_URL = "postgresql://postgres.irdgcydgnsocsgybivvm:Kv1234567892453345@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
}

if (!process.env.DIRECT_URL || !process.env.DIRECT_URL.startsWith('postgres')) {
  process.env.DIRECT_URL = "postgresql://postgres.irdgcydgnsocsgybivvm:Kv1234567892453345@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";
}

const { PrismaClient } = require('@prisma/client');

let prisma;

if (!global.__prisma) {
  global.__prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}
prisma = global.__prisma;

module.exports = prisma;
