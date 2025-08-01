const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason, getAggregateVotesInPollMessage } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
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

let adminNumber = ''

app.post('/set-admin-number', (req, res) => {
  adminNumber = req.body.adminNumber
  res.sendStatus(200)
})

server.listen(3000, () => {})

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: ['GojoBot', 'Chrome', '1.0.0']
  })

  if (!sock.authState.creds.registered && adminNumber) {
    const code = await sock.requestPairingCode(adminNumber + '@s.whatsapp.net')
    io.emit('qr', code)
  }

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update
    const shouldReconnect = lastDisconnect?.error && Boom.isBoom(lastDisconnect.error) && lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
    if (connection === 'close' && shouldReconnect) {
      startSock()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return
    const sender = msg.key.remoteJid
    if (sender.endsWith('@g.us')) return
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    if (text) {
      const response = await aiCommand(text)
      await sock.sendMessage(sender, { text: response })
    }
  })
}

startSock()
