const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const P = require('pino')
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
      } catch {}
      sock = null
    }
    startBot(number, socket)
  })
})

async function startBot(adminNumber, socket) {
  const { state, saveCreds: save } = await useMultiFileAuthState('./sessions')
  saveCreds = save

  sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printPairingCode: false
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', update => {
    const { connection, lastDisconnect, pairing } = update

    if (pairing?.code) {
      socket.emit('pairingCode', pairing.code)
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error && new Boom(lastDisconnect.error).output.statusCode) || 0
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(() => startBot(adminNumber, socket), 5000)
      }
    }

    if (connection === 'open') {
      console.log('Bot connecté en tant que:', adminNumber)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return
    if (!msg.key.remoteJid.endsWith('@s.whatsapp.net') && !msg.key.remoteJid.endsWith('@g.us')) return
    try {
      await ai.execute(msg, sock)
    } catch {}
  })
}

server.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`))
