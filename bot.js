const { default: makeWASocket, useMultiFileAuthState, makeInMemoryStore, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const P = require("pino");
const path = require("path");
const fs = require("fs");
const handleAI = require("./commands/ai");

const startBot = async () => {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./sessions');

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' })
  });

  const store = makeInMemoryStore({ logger: P().child({ level: 'fatal' }) });
  store.bind(sock.ev);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const QRCode = require('qrcode');
      console.log("Scan le QR avec WhatsApp :");
      console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
    }

    if (connection === 'close') {
      const shouldReconnect = (new Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }

    if (connection === 'open') {
      console.log('Bot connecté');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    if (isGroup) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    if (!text) return;

    await handleAI(msg, sock);
  });
};

startBot();
