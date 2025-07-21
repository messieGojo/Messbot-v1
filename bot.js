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
  console.log(`Nouvelle connexion: ${socket.id}`);

  socket.on('adminNumber', async (number) => {
    console.log(`Tentative de connexion avec le numéro: ${number}`);

       if (!number.match(/^\+\d{10,15}$/)) {
      socket.emit('error', 'Format de numéro invalide. Exemple: +243844899201');
      return;
    }

        if (sock) {
      try {
        await sock.logout();
        console.log('Déconnexion de la session précédente réussie');
      } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
      }
      sock.ev.removeAllListeners();
      sock = null;
      saveCreds = null;
    }

    startBot(number, socket);
  });

  socket.on('disconnect', () => {
    console.log(`Client déconnecté: ${socket.id}`);
  });
});

async function startBot(adminNumber, socket) {
  try {
    console.log(`Démarrage du bot pour ${adminNumber}`);

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
      console.log('Mise à jour de connexion:', connection);

      if (qr) {
        console.log('QR Code généré');
        socket.emit('qrCode', qr);
      }

      if (pairing?.code) {
        console.log('Pairing Code:', pairing.code);
        socket.emit('pairingCode', pairing.code);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log('Déconnexion avec code:', statusCode);

        if (statusCode !== DisconnectReason.loggedOut) {
          console.log('Reconnexion dans 5 secondes...');
          setTimeout(() => startBot(adminNumber, socket), 5000);
        } else {
          socket.emit('error', 'Déconnecté. Veuillez vous reconnecter.');
        }
      }

      if (connection === 'open') {
        console.log('Connecté avec succès à WhatsApp');
        socket.emit('connectionStatus', 'connected');
      }
    });

   sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const msg = messages[0];
        if (!msg?.message || msg.key.fromMe) return;

        const jid = msg.key.remoteJid;
        if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@g.us')) return;

        console.log(`Nouveau message de ${jid}`);
        await ai.execute(msg, sock);
      } catch (error) {
        console.error('Erreur de traitement du message:', error);
      }
    });

  } catch (error) {
    console.error('Erreur critique:', error);
    socket.emit('error', 'Échec du démarrage: ' + error.message);
  }
}


process.on('unhandledRejection', (reason, promise) => {
  console.error('Rejet non géré:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Exception non capturée:', error);
});


server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
