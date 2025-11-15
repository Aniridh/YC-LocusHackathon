import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Resetting demo database...');

  try {
    // Option 1: Use Prisma migrate reset (recommended)
    console.log('Running prisma migrate reset --force...');
    execSync('npx prisma migrate reset --force', { stdio: 'inherit' });

    // Option 2: Nuclear option (uncomment if needed)
    // console.log('Dropping and recreating schema...');
    // await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE;');
    // await prisma.$executeRawUnsafe('CREATE SCHEMA public;');
    // execSync('npx prisma migrate deploy', { stdio: 'inherit' });

    console.log('Running seed script...');
    execSync('npm run seed', { stdio: 'inherit' });

    console.log('✅ Demo reset completed!');
  } catch (error) {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

