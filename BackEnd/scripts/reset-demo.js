"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
async function main() {
    console.log('🔄 Resetting demo database...');
    try {
        console.log('Running prisma migrate reset --force...');
        (0, child_process_1.execSync)('npx prisma migrate reset --force', { stdio: 'inherit' });
        console.log('Running seed script...');
        (0, child_process_1.execSync)('npm run seed', { stdio: 'inherit' });
        console.log('✅ Demo reset completed!');
    }
    catch (error) {
        console.error('❌ Reset failed:', error);
        process.exit(1);
    }
}
main()
    .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
});
//# sourceMappingURL=reset-demo.js.map