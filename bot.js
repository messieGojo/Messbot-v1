if (!globalThis.crypto) {
  globalThis.crypto = require('crypto').webcrypto
}

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const P = require('pino')
const fs = require('fs')
const path = require('path')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const commands = new Map()
const commandsPath = path.join(__dirname, 'commands')
fs.readdirSync(commandsPath).forEach(file => {
  const filePath = path.join(commandsPath, file)
  const command = require(filePath)
  if (command.name) {
    commands.set(command.name.toLowerCase(), command)
  }
})

let socketClient = null
let sock = null
let adminNumber = null

app.use(express.static('public'))

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

io.on('connection', (socket) => {
  socketClient = socket

  socket.on('disconnect', () => {
    socketClient = null
  })

  socket.on('admin-number', async (number) => {
    if (!number.match(/^\d+$/)) {
      if (socketClient) socketClient.emit('admin-number-error', 'Numéro invalide')
      return
    }
    adminNumber = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`
    if (socketClient) socketClient.emit('admin-number-status', { success: true })
  })

  socket.on('start-pairing', async () => {
    try {
      if (!adminNumber) {
        throw new Error('Admin number not set')
      }
      if (socketClient) socketClient.emit('pairing-start')
      await startBot()
    } catch (error) {
      if (socketClient) socketClient.emit('pairing-error', error.message)
    }
  })
})

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')

  sock = makeWASocket({
    version: (await fetchLatestBaileysVersion()).version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    browser: ['MessBot', 'Chrome', '1.0']
  })

  sock.ev.on('creds.update', saveCreds)

  if (!fs.existsSync('./sessions/creds.json')) {
    try {
      if (socketClient) socketClient.emit('pairing-generating')
      const code = await sock.requestPairingCode(adminNumber)
      if (socketClient) {
        socketClient.emit('pairing-code', {
          code: code,
          expiresIn: 300
        })
      }
    } catch (error) {
      if (socketClient) socketClient.emit('pairing-error', 'Failed to generate pairing code')
      throw error
    }
  }

  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'open') {
      if (socketClient) {
        socketClient.emit('connection-status', {
          connected: true
        })
      }
    }
    if (update.connection === 'close') {
      const reason = new Boom(update.lastDisconnect?.error)?.output?.statusCode
      if (reason !== 401) {
        setTimeout(startBot, 5000)
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return
    const sender = msg.key.remoteJid
    const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    if (!messageContent) return

    const args = messageContent.trim().split(/\s+/)
    const cmdName = args.shift().toLowerCase()
    if (commands.has(cmdName)) {
      try {
        await commands.get(cmdName).run({ sock, msg, args })
      } catch {
        await sock.sendMessage(sender, { text: 'Command error' })
      }
    }
  })
}

server.listen(process.env.PORT || 3000)
