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
let pairingCode
let socketClient

app.use(express.static(path.join(__dirname, 'public')))

io.on('connection', (socket) => {
  console.log('Client connecté')
  socketClient = socket

  socket.on('admin-number', async (number) => {
    if (!number) return

    const sessionID = makeid(8)
    pairingCode = await startBot(number, sessionID)

    if (pairingCode) {
      socket.emit('pairing-code', pairingCode)
    } else {
      socket.emit('error', 'Erreur lors de la génération du code.')
    }
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

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, pairingCode: code }) => {
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Connexion fermée. Reconnexion:', shouldReconnect)
      if (shouldReconnect) {
        startBot(adminNumber, makeid(8))
      }
    }

    if (code && socketClient) {
      pairingCode = code
      socketClient.emit('pairing-code', pairingCode)
    }

    if (connection === 'open') {
      console.log('✅ Bot connecté avec succès.')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
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

  return pairingCode
}

server.listen(3000, () => {
  console.log('Serveur démarré sur http://localhost:3000')
})
