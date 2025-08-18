const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys')
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

let adminNumber = '243844899201' 


app.post('/set-admin-number', (req, res) => {
  adminNumber = req.body.adminNumber
  res.send({ success: true, message: 'Admin number set' })
})

server.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'))

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
    browser: ['VolTah-Bot', 'Chrome', '1.0.0']
  })


  if (!sock.authState.creds.registered && adminNumber) {
    try {
      const code = await sock.requestPairingCode(adminNumber + '@s.whatsapp.net')
      console.log(`🔑 Pairing code for ${adminNumber}: ${code}`)
      io.emit('pairing-code', code)
    } catch (err) {
      console.error('❌ Failed to generate pairing code:', err)
    }
  }

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'open') {
      console.log('✅ WhatsApp connected!')

      // Envoyer la session Base64 à l’admin
      try {
        const data = fs.readFileSync('./auth/creds.json')
        const b64data = Buffer.from(data).toString('base64')
        await sock.sendMessage(adminNumber + '@s.whatsapp.net', { text: 'SESSION_ID~' + b64data })
        console.log('📦 Session Base64 sent to admin')
      } catch (err) {
        console.error('❌ Failed to send session Base64:', err)
      }

    } else if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error &&
        Boom.isBoom(lastDisconnect.error) &&
        lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut

      console.log('⚠️ Connection closed. Reconnecting:', shouldReconnect)
      if (shouldReconnect) startSock()
    }
  })

  // Réception des messages
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
      } catch (err) {
        console.error('❌ Failed to reply:', err)
      }
    }
  })
}

startSock()
