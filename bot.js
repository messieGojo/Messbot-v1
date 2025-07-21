const express = require('express')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { Boom } = require('@hapi/boom')
const P = require('pino')
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')

const app = express()
const server = http.createServer(app)
const PORT = process.env.PORT || 3000

app.use(express.static('public'))
app.use(express.json())

let ADMIN_NUMBER = null
let pairCode = null

app.post('/admin', async (req, res) => {
  const { number } = req.body
  if (!number || !number.startsWith('+')) return res.status(400).json({ error: 'Numéro invalide' })

  ADMIN_NUMBER = number
  fs.writeFileSync('./config.js', `module.exports = { adminNumber: "${number}" }`)

  const { state, saveCreds } = await useMultiFileAuthState('./sessions')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['MessBot', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: true,
    defaultQueryTimeoutMs: undefined,
    pairingCode: number
  })

  sock.ev.on('connection.update', ({ pairingCode: code, connection }) => {
    if (code && !pairCode) {
      pairCode = code
      res.json({ pairingCode: code })
    }
  })

  sock.ev.on('creds.update', saveCreds)
})


app.get('/paircode', (req, res) => {
  if (!pairCode) return res.status(404).json({ error: 'Code non encore généré' })
  res.json({ pairingCode: pairCode })
})

server.listen(PORT, () => {
  console.log('Serveur enfin démarré !')
})
