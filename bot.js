const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
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
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
    },
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', update => {
    const { connection, lastDisconnect, pairingCode } = update
    if (pairingCode) console.log('✅ Ton code de pairing est : *' + pairingCode + '*')
    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error).output.statusCode
      if (code !== DisconnectReason.loggedOut) setTimeout(startBot, 5000)
    }
    if (connection === 'open') console.log('Bot connecté')
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
