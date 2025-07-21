const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pino = require('pino');
const path = require('path');
const ai = require('./commands/ai');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

let sock = null;
let saveCreds = null;

io.on('connection', (socket) => {
  socket.on('adminNumber', async (number) => {
    if (!number.match(/^\+\d{10,15}$/)) {
      socket.emit('error', 'Format de numéro invalide');
      return;
    }

    if (sock) {
      try {
        await sock.logout();
      } catch (error) {}
      sock.ev.removeAllListeners();
      sock = null;
      saveCreds = null;
    }

    startBot(number, socket);
  });
});

async function startBot(adminNumber, socket) {
  try {
    const { state, saveCreds: save } = await useMultiFileAuthState(
      path.join(__dirname, 'sessions', adminNumber.replace('+', ''))
    );
    saveCreds = save;

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: true,
      printPairingCode: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr, pairing } = update;

      if (qr) {
        socket.emit('qrCode', qr);
      }

      if (pairing?.code) {
        socket.emit('pairingCode', pairing.code);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => startBot(adminNumber, socket), 5000);
        }
      }

      if (connection === 'open') {
        socket.emit('connectionStatus', 'connected');
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const msg = messages[0];
        if (!msg?.message || msg.key.fromMe) return;
        const jid = msg.key.remoteJid;
        if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@g.us')) return;
        await ai.execute(msg, sock);
      } catch (error) {}
    });

  } catch (error) {
    socket.emit('error', error.message);
  }
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
