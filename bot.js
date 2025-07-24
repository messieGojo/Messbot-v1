const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const express = require('express')
const http = require('http')
const socketIO = require('socket.io')
const aiCommand = require('./commands/ai')
const { randomBytes } = require('crypto')

const app = express()
const server = http.createServer(app)
const io = socketIO(server)

const PORT = process.env.PORT || 3000
const { state, saveCreds } = useSingleFileAuthState('./auth_info.json')

async function startBot() {
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    defaultQueryTimeoutMs: undefined
  })

  sock.ev.on('creds.update', saveCreds)

  if (!fs.existsSync('./auth_info.json')) {
    const code = await sock.requestPairingCode('243844899201@s.whatsapp.net')
    console.log(`✅ Ton code de pairing est : *${code}*.`)
    io.emit('pairing-code', code)
  }

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return
    const sender = msg.key.remoteJid
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    const id = randomBytes(4).toString('hex')
    const response = await aiCommand(text, id)
    await sock.sendMessage(sender, { text: response })
  })
}

startBot()

io.on('connection', socket => {
  socket.on('admin-number', number => {
    console.log(`Admin connecté : ${number}`)
  })
})

server.listen(PORT, () => {
  console.log(`Serveur WebSocket en ligne sur le port ${PORT}`)
})
