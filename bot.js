const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const P = require('pino')
const fs = require('fs')
const path = require('path')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const { makeid } = require('./utils/genid')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

let socketClient = null
let adminNumber = null

app.use(express.static('public'))

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

io.on('connection', (socket) => {
  console.log(' Client connecté à Socket.io')
  socketClient = socket

  socket.on('admin-number', async (number) => {
    console.log(' Numéro admin reçu :', number)
    adminNumber = number
    await startBot()
  })
})

const commands = new Map()
const commandsPath = path.join(__dirname, 'commands')
fs.readdirSync(commandsPath).forEach(file => {
  const command = require(`./commands/${file}`)
  commands.set(command.name, command)
})


async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')

  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    browser: ['MessBot', 'Safari', '1.0']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update

    if (qr) {
      const code = makeid(8)
      console.log('🔐 Code d’appairage :', code)
      if (socketClient) {
        socketClient.emit('pairing-code', code)
      }
    }

    if (connection === 'close') {
      const reason = new Boom(update.lastDisconnect?.error)?.output.statusCode
      console.log('❌ Déconnecté. Raison :', reason)
    } else if (connection === 'open') {
      console.log('✅ Bot connecté à WhatsApp')
    }
  })

  
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const sender = msg.key.remoteJid
    if (!sender.endsWith('@s.whatsapp.net')) return

    const isAdmin = adminNumber && sender === `${adminNumber}@s.whatsapp.net`
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    const [cmdName, ...args] = body.trim().split(/\s+/)

    if (commands.has(cmdName)) {
      const command = commands.get(cmdName)
      try {
        await command.execute(sock, msg, args, sender, isAdmin)
      } catch (err) {
        console.error(`Erreur dans la commande "${cmdName}":`, err)
      }
    }
  })
}

server.listen(process.env.PORT || 3000, () => {
  console.log(' Serveur web actif sur le port 3000')
})
