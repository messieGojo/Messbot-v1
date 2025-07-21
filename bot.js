const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const express = require('express')
const P = require('pino')
const ai = require('./commands/ai')

const app = express()
const PORT = process.env.PORT || 3000

app.get('/', (req, res) => res.send('Bot actif'))
app.listen(PORT, () => console.log('Serveur enfin démarré !'))

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    browser: ['PairBot', 'Chrome', '1.0'],
    printQRInTerminal: false
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, pairingCode }) => {
    if (pairingCode) {
      console.log(`✅ Ton code de pairing est : *${pairingCode}*`)
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error && new Boom(lastDisconnect.error).output.statusCode) || 0
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(startBot, 3000)
      }
    }

    if (connection === 'open') {
      console.log('✅ Bot connecté avec succès.')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return
    if (!msg.key.remoteJid.endsWith('@s.whatsapp.net') && !msg.key.remoteJid.endsWith('@g.us')) return
    try {
      await ai.execute(msg, sock)
    } catch {}
  })
}

startBot()
