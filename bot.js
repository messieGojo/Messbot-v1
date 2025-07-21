const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const pino = require('pino')
const ai = require('./commands/ai')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static('public'))
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'))

const PORT = process.env.PORT || 3000

let sock = null
let saveCreds = null

io.on('connection', (socket) => {
  socket.on('adminNumber', async (number) => {
    if (sock) {
      try {
        await sock.logout()
      } catch (error) {}
      sock.ev.removeAllListeners()
      sock = null
      saveCreds = null
    }
    startBot(number, socket)
  })
})

async function startBot(adminNumber, socket) {
  try {
    const { state, saveCreds: save } = await useMultiFileAuthState('./sessions')
    saveCreds = save

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      printPairingCode: false
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr, pairing } = update

      if (qr) {
        socket.emit('qrCode', qr)
      }

      if (pairing?.code) {
        socket.emit('pairingCode', pairing.code)
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true

        if (shouldReconnect) {
          setTimeout(() => startBot(adminNumber, socket), 5000)
        }
      }

      if (connection === 'open') {
        socket.emit('connectionStatus', 'connected')
      }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return
        if (!msg.key.remoteJid.endsWith('@s.whatsapp.net') && !msg.key.remoteJid.endsWith('@g.us')) return
        await ai.execute(msg, sock)
      } catch (error) {}
    })

  } catch (error) {
    socket.emit('error', 'Échec du démarrage du bot')
  }
}

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`)
})

process.on('unhandledRejection', (reason, promise) => {})
process.on('uncaughtException', (error) => {})
