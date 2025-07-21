import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import Boom from '@hapi/boom';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import ai from './commands/ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const PORT = process.env.PORT || 10000;
let sock = null;

async function startBot(adminNumber, socket) {
  try {
    const { state } = await useMultiFileAuthState(
      path.join(__dirname, 'sessions', adminNumber.replace('+', ''))
    );

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      browser: ['Chrome (Linux)', '', '']
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, pairingCode } = update;
      
      if (pairingCode) {
        console.log('PAIRING CODE:', pairingCode);
        socket.emit('pairingCode', pairingCode);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => startBot(adminNumber, socket), 5000);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg?.message || msg.key.fromMe) return;
      await ai.execute(msg, sock);
    });

  } catch (error) {
    console.error('ERREUR:', error);
    socket.emit('error', 'Échec de connexion');
    setTimeout(() => startBot(adminNumber, socket), 10000);
  }
}

io.on('connection', (socket) => {
  socket.on('adminNumber', (number) => {
    if (!number.match(/^\+\d{10,15}$/)) {
      return socket.emit('error', 'Format: +243844899201');
    }
    if (sock) {
      sock.end(undefined);
      sock = null;
    }
    startBot(number, socket);
  });
});

server.listen(PORT, () => {
  console.log(`Serveur actif sur le port ${PORT}`);
});
