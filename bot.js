const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
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

let socketClient = null
let adminNumber = null
let pairingCode = null

function generatePairingCode(length = 6) {
  const numbers = '0123456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length))
  }
  return code
}

app.use(express.static('public'))

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

io.on('connection', (socket) => {
  console.log('client connecté ')
  socketClient = socket

  socket.on('disconnect', () => {
    console.log(' client déconnecté ')
    socketClient = null
  })

  socket.on('admin-number', async (number) => {
    try {
      console.log(`[ADMIN] Registration attempt: ${number}`)
      adminNumber = number.replace(/\D/g, '') 
      pairingCode = generatePairingCode()
      
      console.log(`[PAIRING] Generated code: ${pairingCode}`)
      
      if (socketClient) {
        socketClient.emit('pairing-code', {
          code: pairingCode,
          expiresIn: 300 
        })
      }
      
      await startBot()
    } catch (error) {
      console.error('[ERROR] Admin registration failed:', error)
      if (socketClient) socketClient.emit('pairing-error', error.message)
    }
  })
})

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')

  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    browser: ['MessBot', 'Chrome', '1.0']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'open') {
      console.log('[WHATSAPP] Connected successfully')
      if (socketClient) {
        socketClient.emit('connection-status', {
          connected: true,
          pairingCode: pairingCode,
          adminNumber: adminNumber
        })
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const sender = msg.key.remoteJid
    if (sender.endsWith('@s.whatsapp.net') {
      const isAdmin = adminNumber && sender === `${adminNumber}@s.whatsapp.net`
      
      if (isAdmin && msg.message.conversation?.toLowerCase() === '!code') {
        await sock.sendMessage(sender, { 
          text: ` le pairing code est : ${pairingCode}`
        })
      }
    }
  })
}

server.listen(process.env.PORT || 3000, () => {
  console.log('serveur démarré sur le port 3000')
})
