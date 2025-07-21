const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const express = require('express')
const P = require('pino')
const ai = require('./commands/ai')

const app = express()
const PORT = process.env.PORT || 3000

app.get('/', (req, res) => res.send('Bot actif'))
app.listen(PORT, () => console.log('Serveur enfin démarré!'))

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['MessBot', 'Chrome', '1.0.0']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    const code = (lastDisconnect?.error && new Boom(lastDisconnect.error).output.statusCode) || 0
    if (connection === 'close' && code !== DisconnectReason.loggedOut) {
      setTimeout(startBot, 1000)
    }
    if (connection === 'open') console.log('Bot connecté')
  })

  sock.ev.on('connection.set', async ({ pairingCode }) => {
    if (pairingCode) console.log('✅ Ton code de pairing est : *' + pairingCode + '*')
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
