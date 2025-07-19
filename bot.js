const { default: makeWASocket, useMultiFileAuthState, makeInMemoryStore, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');

const handleAI = require('./commands/ai');

const startBot = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions');

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' })
  });

  const store = makeInMemoryStore({ logger: P().child({ level: 'fatal' }) });
  store.bind(sock.ev);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startBot();
      }
    } else if (connection === 'open') {
      console.log('Bot connecté');
    } else if (update.qr) {
      console.log('QR CODE :', update.qr);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const message = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    if (message.toLowerCase() === 'ping') {
      await sock.sendMessage(from, { text: 'pong' });
    } else {
      await handleAI(msg, sock);
    }
  });
};

startBot();
