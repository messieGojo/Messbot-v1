const express = require('express')
const http = require('http')
const socketIo = require('socket.io')
const { v4: genId } = require('uuid')
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const NodeCache = require('node-cache')
const P = require('pino')
const aiCommand = require('./commands/ai')

const app = express()
const server = http.createServer(app)
const io = socketIo(server)

app.use(express.static('public'))

let adminNumber = null

io.on('connection', socket => {
  socket.on('admin-number', number => {
    adminNumber = number
  })
})

async function startBot() {
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')
  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
    },
    browser: ['MessBot', 'Safari', '1.0.0']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr, pairingCode }) => {
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error = Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        startBot()
      }
    } else if (connection === 'open') {
      console.log('Bot connecté')
    }

    if (pairingCode && adminNumber) {
      sock.sendMessage(adminNumber + '@s.whatsapp.net', { text: `✅ Ton code de pairing est : *${pairingCode}*.` })
      io.emit('pairing-code', pairingCode)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const sender = msg.key.remoteJid
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    const isCmd = body.startsWith('.')
    const command = body.split(' ')[0].slice(1).toLowerCase()
    const args = body.trim().split(/\s+/).slice(1)

    if (!isCmd) return

    if (command === 'ai') {
      const prompt = args.join(' ')
      const response = await aiCommand(prompt)
      await sock.sendMessage(sender, {
        text: `${response}`
      })
    }
  })
}

startBot()
server.listen(10000, () => {
  console.log('Serveur lancé sur http://localhost:10000')
})
