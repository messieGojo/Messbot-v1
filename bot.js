const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const express = require('express')
const P = require('pino')
const ai = require('./commands/ai')

const app = express()
const PORT = process.env.PORT || 3000

app.get('/', (req, res) => res.send('Bot actif'))
app.listen(PORT, () => console.log('Serveur web démarré'))

async function startBot() {
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    printPairingCode: true, 
    browser: ['MessBot', 'Safari', '1.0']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, pairing } = update

    if (pairing?.code) {
      console.log('\n╭──CODE D’APPAIRAGE──╮')
      console.log(`   ${pairing.code}`)
      console.log('╰──────────────────╯\n')
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error && new Boom(lastDisconnect.error).output.statusCode) || 0
      if (code !== DisconnectReason.loggedOut) {
        console.log('Déconnexion. Reconnexion dans 5s...')
        setTimeout(startBot, 5000)
      } else {
        console.log('Déconnecté définitivement.')
      }
    }

    if (connection === 'open') {
      console.log('✅ Bot connecté via code d’appairage')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return
    if (!msg.key.remoteJid.endsWith('@s.whatsapp.net') && !msg.key.remoteJid.endsWith('@g.us')) return

    try {
      await ai.execute(msg, sock)
    } catch (err) {
      console.error('Erreur message :', err)
    }
  })
}

startBot()
