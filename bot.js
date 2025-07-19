const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const axios = require('axios')
const config = require('./config')

const { state, saveState } = useSingleFileAuthState('./sessions/auth.json')

async function connectBot() {
  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state
  })

  sock.ev.on('creds.update', saveState)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        console.log('Tentative de reconnexion...')
        connectBot()
      } else {
        console.log('Déconnecté. Veuillez reconnecter manuellement.')
      }
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
