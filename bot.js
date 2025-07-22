const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const path = require('path')
const aiCommand = require('./commands/ai')
const { makeid } = require('./utils/genid')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

let sock
let socketClient

app.use(express.static(path.join(__dirname, 'public')))

io.on('connection', (socket) => {
  console.log('Client connecté')
  socketClient = socket

  socket.on('admin-number', async (number) => {
    if (!number) return

    const sessionID = makeid(8)
    startBot(number, sessionID)
  })
})

async function startBot(adminNumber, sessionID) {
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${adminNumber}_${sessionID}`)

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, pairingCode: code }) => {
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Connexion fermée. Reconnexion:', shouldReconnect)
      if (shouldReconnect) {
        startBot(adminNumber, makeid(8))
      }
    }

    if (code && socketClient) {
      socketClient.emit('pairing-code', code)
    }

    if (connection === 'open') {
      console.log('✅ Bot connecté avec succès.')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ''

    if (text.toLowerCase().startsWith('!ai')) {
      msg.message.conversation = text.replace(/^!ai\s*/i, '')
      await aiCommand.execute(msg, sock)
    }
  })
}

server.listen(3000, () => {
  console.log('Serveur démarré sur http://localhost:3000')
})
