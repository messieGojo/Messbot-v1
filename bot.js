const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const fs = require('fs')
const pino = require('pino')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static('public'))
app.use(express.json())

let sock
let pendingPairRequests = []

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
    const { connection } = update
    if (connection === 'open') {
      pendingPairRequests.forEach(async (req) => {
        try {
          const code = await sock.requestPairingCode(req.number + '@s.whatsapp.net')
          req.socket.emit('pairing-code', code)
        } catch {
          req.socket.emit('pairing-code', '❌ Erreur lors de la génération du code')
        }
      })
      pendingPairRequests = []
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return
    const sender = msg.key.remoteJid
    if (sender.endsWith('@g.us')) return

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    if (text) {
      await sock.sendMessage(sender, { text: `Vous avez écrit: ${text}` })
    }
  })
}

startSock()

io.on('connection', (socket) => {
  socket.on('generate-code', async (number) => {
    if (!sock || sock.ws.readyState !== 1) {
      pendingPairRequests.push({ socket, number })
      socket.emit('pairing-code', '⌛ Connexion en cours… code généré dès que possible.')
      return
    }
    try {
      const code = await sock.requestPairingCode(number + '@s.whatsapp.net')
      socket.emit('pairing-code', code)
    } catch {
      socket.emit('pairing-code', '❌ Erreur lors de la génération du code')
    }
  })
})
