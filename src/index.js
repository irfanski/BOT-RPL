import dotenv from 'dotenv';
import fs from 'fs';
import { testConnection } from './config/database.js';
import startBot from './services/baileys.js';

dotenv.config();

// Banner
console.log(`
╔════════════════════════════════════════╗
║                                        ║
║        🤖 BOT WHATSAPP LOKER 🤖        ║
║                                        ║
║  Sistem Lowongan Kerja via WhatsApp    ║
║                                        ║
╚════════════════════════════════════════╝
`);

// Buat folder yang dibutuhkan
const folders = ['./sessions', './uploads', './uploads/cv'];
folders.forEach(folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    console.log(`✅ Folder created: ${folder}`);
  }
});

// Main function
async function main() {
  try {
    // Test koneksi database
    await testConnection();

    // Start WhatsApp bot
    console.log('🚀 Starting WhatsApp bot...\n');
    await startBot();

  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n👋 Bot stopped. Goodbye!');
  process.exit(0);
});

// Run
main();