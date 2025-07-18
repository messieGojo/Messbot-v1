const { default: makeWASocket, useSingleFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const { IA_ENDPOINT, API_KEY, OWNER } = require('./config');
const { state, saveState } = useSingleFileAuthState('./sessions/auth.json');

async function startBot() {
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveState);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    if (!text) return;

    try {
      const res = await axios.get(`${IA_ENDPOINT}?prompt=${encodeURIComponent(text)}&apiKey=${API_KEY}`, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' }
      });

      const answer = res.data.answer || '...';
      await sock.sendMessage(from, { text: answer });
    } catch (e) {
      await sock.sendMessage(from, { text: '❌ Erreur IA.' });
    }
  });

  sock.ev.on('connection.update', ({ connection }) => {
    if (connection === 'open') {
      console.log('✅ Bot connecté à WhatsApp');
    }
  });
}

startBot();
