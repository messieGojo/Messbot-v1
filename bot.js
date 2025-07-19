const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const ai = require('./commands/ai');

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions');

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', update => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error && new Boom(lastDisconnect.error).output.statusCode) || null;
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log('Reconnexion...');
        startBot();
      } else {
        console.log('Déconnecté (logged out)');
      }
    } else if (connection === 'open') {
      console.log('Bot connecté');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    if (!msg.key.remoteJid.endsWith('@s.whatsapp.net')) return;

    await ai.execute(msg, sock);
  });
}

startBot();
