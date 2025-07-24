const { default: makeWASocket, useSingleFileAuthState } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

const AUTH_FILE = './auth_info.json'
const DEFAULT_COMMAND = './commands/ai/default'
const { state, saveCreds } = useSingleFileAuthState(AUTH_FILE)

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static('public'))
server.listen(3000, () => console.log('http://localhost:3000'))

let ADMIN_NUMBER = ''
let pairingCode = ''
let genID = crypto.randomBytes(4).toString('hex').toUpperCase()

async function startBot() {
  const sock = makeWASocket({ auth: state, printQRInTerminal: false })
  sock.ev.on('creds.update', saveCreds)

  if (!fs.existsSync(AUTH_FILE) && ADMIN_NUMBER) {
    pairingCode = await sock.requestPairingCode(`${ADMIN_NUMBER}@s.whatsapp.net`)
    io.emit('pairing-code', pairingCode)
    io.emit('genid', genID)
    console.log(`GEN ID : ${genID}`)
  }

  sock.ev.on('connection.update', update => {
    if (update.connection === 'close') {
      const reason = new Boom(update.lastDisconnect?.error)?.output?.statusCode
      if (reason !== 401) setTimeout(startBot, 3000)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0]
    if (!m.message || m.key.fromMe) return
    const body = m.message.conversation || m.message.extendedTextMessage?.text || ''
    const args = body.trim().split(/\s+/)
    const command = args.shift().toLowerCase()

    try {
      const cmd = require(DEFAULT_COMMAND)
      const res = await cmd.run({ sock, m, args: [body] })
      if (res) await sock.sendMessage(m.key.remoteJid, { text: res })
    } catch {
      await sock.sendMessage(m.key.remoteJid, { text: 'Erreur' })
    }
  })
}

io.on('connection', socket => {
  socket.on('admin-number', number => {
    ADMIN_NUMBER = number.startsWith('+') ? number.slice(1) : number
    startBot()
  })
})
