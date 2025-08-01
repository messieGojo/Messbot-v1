const express = require('express')
const http = require('http')
const socketIo = require('socket.io')
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const P = require('pino')
const path = require('path')
const aiCommand = require('./commands/ai')

const app = express()
const server = http.createServer(app)
const io = socketIo(server)

app.use(express.static(path.join(__dirname, 'public')))

let pairingCode = generatePairCode()
let adminSocket = null

function generatePairCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
    if (i === 3) code += '-'
  }
  return code
}

io.on('connection', (socket) => {
  adminSocket = socket
  socket.emit('pairing-code', pairingCode)
})

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
    },
    printQRInTerminal: false,
    browser: ['AI-Bot', 'Chrome', '1.0']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error = Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        setTimeout(startBot, 5000)
      }
    }
    
    pairingCode = generatePairCode()
    if (adminSocket) adminSocket.emit('pairing-code', pairingCode)
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const sender = msg.key.remoteJid
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''

    if (text) {
      const response = await aiCommand(text) // Utilisation directe sans préfixe
      await sock.sendMessage(sender, { text: response })
    }
  })
}

startBot()
server.listen(10000, () => console.log('Server running on port 10000'))
