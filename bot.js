import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import { execute as aiExecute } from './commands/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 10000;
let sock = null;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function startBot(adminNumber, socket) {
  try {
    const { state } = await useMultiFileAuthState(path.join(__dirname, 'sessions', adminNumber.replace('+', '')));
    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      connectTimeoutMs: 60000,
      browser: ['Chrome (Linux)', '', '']
    });

    sock.ev.on('connection.update', (update) => {
      if (update.pairingCode) socket.emit('pairingCode', update.pairingCode);
      if (update.connection === 'close') handleDisconnect(update.lastDisconnect, adminNumber, socket);
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg?.message || msg.key.fromMe) return;
      await aiExecute(msg, sock);
    });

  } catch (error) {
    socket.emit('error', 'Erreur de connexion');
    setTimeout(() => startBot(adminNumber, socket), 10000);
  }
}

function handleDisconnect(lastDisconnect, adminNumber, socket) {
  const statusCode = lastDisconnect?.error?.output?.statusCode;
  if (statusCode !== DisconnectReason.loggedOut) {
    setTimeout(() => startBot(adminNumber, socket), 5000);
  }
}

io.on('connection', (socket) => {
  socket.on('adminNumber', (number) => {
    if (!number.match(/^\+\d{10,15}$/)) return socket.emit('error', 'Format: +243XXXXXX');
    if (sock) sock.end();
    startBot(number, socket);
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
