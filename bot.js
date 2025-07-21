const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const fs = require('fs')
const P = require('pino')
const ai = require('./commands/ai')
const configPath = './config.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

app.post('/set-admin', async (req, res) => {
  const admin = req.body.admin
  const content = `module.exports = {\n  OWNER: '${admin}',\n  BOT: ''\n}`
  fs.writeFileSync(configPath, content)
  const code = await startBot()
  res.send(code)
})

app.listen(PORT, () => console.log('Serveur démarré'))

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')
  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false
  })

  let pairCode = ''

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, pairingCode } = update
    if (pairingCode) {
      pairCode = pairingCode
    }
    if (connection === 'close') {
      const code = (lastDisconnect?.error && new Boom(lastDisconnect.error).output.statusCode) || 0
      if (code !== DisconnectReason.loggedOut) setTimeout(startBot, 5000)
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

  await new Promise(resolve => setTimeout(resolve, 5000))
  return pairCode ? `<h2>Code de Pairing : <input value="${pairCode}" readonly id="code"><button onclick="copyCode()">Copier</button><script>function copyCode(){navigator.clipboard.writeText(document.getElementById('code').value)}</script>` : '<h2>Erreur : aucun code de pairing généré.</h2>'
}
