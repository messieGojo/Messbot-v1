const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys')
const fs = require('fs')
const pino = require('pino')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const { aiCommand } = require('./commands/ai')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static('public'))
app.use(express.json())

let sock
server.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'))

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: ['Messbot', 'Chrome', '1.0.0']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'open') {
      try {
        const data = fs.readFileSync('./auth/creds.json')
        const b64data = Buffer.from(data).toString('base64')
        io.emit('session-ready', b64data)
      } catch (err) {}
    } else if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error && lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) startSock()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return
    const sender = msg.key.remoteJid
    if (sender.endsWith('@g.us')) return
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    if (text) {
      try {
        const response = await aiCommand(text)
        await sock.sendMessage(sender, { text: response })
      } catch (err) {}
    }
  })
}

startSock()

io.on('connection', (socket) => {
  socket.on('generate-code', async (number) => {
    if (!number) return
    if (!sock || sock.ws.readyState !== 1) {
      socket.emit('pairing-code', '❌ WhatsApp non connecté. Réessayez plus tard.')
      return
    }
    try {
      const code = await sock.requestPairingCode(number + '@s.whatsapp.net')
      socket.emit('pairing-code', code)
    } catch (err) {
      socket.emit('pairing-code', '❌ Erreur lors de la génération du code')
    }
  })
})
