import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion 
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import handleMessage from './messageHandler.js';

const logger = pino({ level: 'silent' });

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    generateHighQualityLinkPreview: true
  });

  // Event: Update koneksi
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Scan QR Code ini dengan WhatsApp kamu:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = 
        (lastDisconnect?.error instanceof Boom) &&
        lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut;

      console.log('Connection closed. Reconnecting:', shouldReconnect);

      if (shouldReconnect) {
        startBot();
      }
    } else if (connection === 'open') {
      console.log('✅ Bot WhatsApp connected!\n');
    }
  });

  // Event: Update kredensial
  sock.ev.on('creds.update', saveCreds);

  // Event: Pesan masuk
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const msg = messages[0];
    if (!msg.message) return;
    if (msg.key.fromMe) return;

    await handleMessage(sock, msg);
  });

  return sock;
}

export default startBot;