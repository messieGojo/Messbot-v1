const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const express = require('express')
const http = require('http')
const socketIo = require('socket.io')
const { v4: uuidv4 } = require('uuid')
const aiCommand = require('./commands/ai')

const app = express()
const server = http.createServer(app)
const io = socketIo(server)
const port = process.env.PORT || 10000
let adminNumber = null

app.use(express.static('public'))
app.use(express.json())

io.on('connection', (socket) => {
  socket.on('admin-number', (number) => {
    adminNumber = number
  })
})

server.listen(port, () => {})

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '22.04.4']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, pairingCode } = update
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        startBot()
      }
    } else if (connection === 'open') {
    } else if (pairingCode && adminNumber) {
      const code = pairingCode
      io.emit('pairing-code', code)
      await sock.sendMessage(adminNumber + '@s.whatsapp.net', { text: `✅ Ton code de pairing est : *${code}*.` })
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const sender = msg.key.remoteJid
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    const lowerText = text.toLowerCase()

    if (lowerText.startsWith('!ai')) {
      const prompt = text.slice(3).trim()
      const response = await aiCommand(prompt)
      await sock.sendMessage(sender, {
        text: `${response}`
      })
    }
  })
}

startBot()
