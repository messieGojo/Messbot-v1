const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));
app.use(express.json());

let sock = null;
let starting = false;
let pending = [];
let connected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

function cleanNumber(n) {
  return String(n || '').replace(/[^\d]/g, '');
}

function canRequest() {
  return sock && sock.ws && sock.ws.readyState === 1 && connected;
}

async function startSock() {
  if (starting) return;
  starting = true;
  reconnectAttempts++;

  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
      browser: ['MessBot', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        connected = true;
        starting = false;
        reconnectAttempts = 0;
        io.emit('status', '✅ Prêt');

        if (pending.length) {
          const queue = [...pending];
          pending = [];
          for (const item of queue) {
            try {
              const code = await sock.requestPairingCode(item.number);
              io.to(item.socketId).emit('pairing-code', code);
            } catch (e) {
              io.to(item.socketId).emit('pairing-error', '❌ Échec de génération du code: ' + e.message);
            }
          }
        }
      } else if (connection === 'close') {
        connected = false;
        starting = false;
        io.emit('status', '🔌 Déconnecté');

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          setTimeout(startSock, 2000);
        } else {
          io.emit('status', '❌ Échec de connexion, veuillez redémarrer');
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg?.message || msg.key.fromMe) return;
      const jid = msg.key.remoteJid;
      if (jid.endsWith('@g.us')) return;

      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.buttonsResponseMessage?.selectedButtonId || '';
      if (!text) return;

      try {
        const { aiCommand } = require('./commands/ai');
        const reply = await aiCommand(text);
        if (reply) await sock.sendMessage(jid, { text: reply });
      } catch {}
    });

  } catch (e) {
    starting = false;
    connected = false;
    io.emit('status', '❌ Erreur initialisation');
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) setTimeout(startSock, 3000);
  }
}

io.on('connection', (socket) => {
  socket.emit('status', connected ? '✅ Prêt' : starting ? '⌛ Connexion en cours…' : '❌ Déconnecté');

  socket.on('generate-code', async (raw) => {
    const number = cleanNumber(raw);
    if (!number || number.length < 8) {
      socket.emit('pairing-error', '❌ Numéro invalide.');
      return;
    }

    if (!sock) {
      startSock();
      pending.push({ socketId: socket.id, number });
      socket.emit('status', '⌛ Initialisation en cours…');
      return;
    }

    if (!canRequest()) {
      pending.push({ socketId: socket.id, number });
      socket.emit('status', '⌛ Connexion en cours… code à venir.');
      return;
    }

    try {
      const code = await sock.requestPairingCode(number);
      socket.emit('pairing-code', code);
    } catch (e) {
      socket.emit('pairing-error', '❌ Échec de génération du code: ' + (e.message || 'Erreur inconnue'));
    }
  });
});

process.on('SIGINT', () => {
  if (sock) sock.ws.close();
  process.exit(0);
});

startSock();
server.listen(process.env.PORT || 3000);
