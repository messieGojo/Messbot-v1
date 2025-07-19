const { default: makeWASocket, DisconnectReason } = require('@adiwajshing/baileys')
const pino = require('pino')
const fs = require('fs')
const axios = require('axios')
const config = require('./config')

const AUTH_FILE = './sessions/auth.json'

let authState = { creds: {}, keys: {} }

if (fs.existsSync(AUTH_FILE)) {
  authState = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'))
}

async function connectBot() {
  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: authState
  })

  sock.ev.on('creds.update', (creds) => {
    authState.creds = creds
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authState, null, 2))
  })

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) connectBot()
    } else if (connection === 'open') {
      console.log('BOT CONNECTÉ')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!messages || !messages[0]?.message) return

    const msg = messages[0]
    const from = msg.key.remoteJid
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''

    if (!text) return

    try {
      const res = await axios.get(`${config.IA_ENDPOINT}${encodeURIComponent(text)}&apiKey=${config.IA_KEY}`)
      await sock.sendMessage(from, { text: res.data.reply || 'Réponse vide' }, { quoted: msg })
    } catch {
      await sock.sendMessage(from, { text: 'Erreur IA' }, { quoted: msg })
    }
  })
}

connectBot()
