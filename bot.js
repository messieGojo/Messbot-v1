const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const P = require('pino')
const express = require('express')
const ai = require('./commands/ai')
const fs = require('fs')
const path = require('path')

const PORT = process.env.PORT || 3000

const app = express()
app.get('/', (req, res) => {
  res.send('Bot WhatsApp actif')
})
app.listen(PORT, () => {
  console.log(`Serveur web démarré sur le port ${PORT}`)
})

let sock

async function startBot() {
  const sessionFolder = path.join(__dirname, 'sessions')
  if (fs.existsSync(sessionFolder)) {
    fs.rmSync(sessionFolder, { recursive: true, force: true })
  }
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')

  sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printPairingCode: true,
    printQRInTerminal: false
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, pairing, qr } = update
    if (pairing?.code) {
      console.log('Pairing code:', pairing.code)
    }
    if (qr) {
      console.log('QR code (base64):', qr)
    }
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error && new Boom(lastDisconnect.error).output.statusCode) || null
      if (statusCode === DisconnectReason.loggedOut) {
        if (fs.existsSync(sessionFolder)) {
          fs.rmSync(sessionFolder, { recursive: true, force: true })
        }
      } else {
        setTimeout(() => startBot(), 5000)
      }
    } else if (connection === 'open') {
      console.log('Bot connecté')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return
    if (!msg.key.remoteJid.endsWith('@s.whatsapp.net') && !msg.key.remoteJid.endsWith('@g.us')) return
    try {
      await ai.execute(msg, sock)
    } catch (e) {
      console.error('Erreur lors du traitement du message :', e)
    }
  })
}

startBot()
