const makeWASocket = require('@adiwajshing/baileys').default
const { useSingleFileAuthState, DisconnectReason } = require('@adiwajshing/baileys')
const { Boom } = require('@hapi/boom')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const fs = require('fs')
const crypto = require('crypto')
const path = require('path')

const AUTH_FILE = './auth_info.json'
const COMMANDS_DIR = './commands/ai'

const { state, saveCreds } = useSingleFileAuthState(AUTH_FILE)
const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static('public'))

server.listen(3000, () => {
  console.log('Serveur lancé sur http://localhost:3000')
})

let sock
let ADMIN_NUMBER = ''
let pairingCode = ''
const genID = crypto.randomBytes(4).toString('hex').toUpperCase()

const commands = new Map()

function loadCommands() {
  if (!fs.existsSync(COMMANDS_DIR)) fs.mkdirSync(COMMANDS_DIR)
  const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.js'))
  for (const file of files) {
    const command = require(path.resolve(COMMANDS_DIR, file))
    if (command.name && typeof command.run === 'function') commands.set(command.name.toLowerCase(), command)
  }
}

async function startBot() {
  loadCommands()
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  })

  sock.ev.on('creds.update', saveCreds)

  if (!fs.existsSync(AUTH_FILE) && ADMIN_NUMBER) {
    pairingCode = await sock.requestPairingCode(`${ADMIN_NUMBER}@s.whatsapp.net`)
    io.emit('pairing-code', { code: pairingCode })
    io.emit('genid', genID)
    console.log(`GEN ID : ${genID}`)
  }

  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'close') {
      const reason = new Boom(update.lastDisconnect?.error)?.output?.statusCode
      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(startBot, 3000)
      }
    } else if (update.connection === 'open') {
      io.emit('connected')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0]
    if (!m.message || m.key.fromMe) return
    const body = m.message.conversation || m.message.extendedTextMessage?.text || ''
    const args = body.trim().split(/\s+/)
    const command = args.shift()?.toLowerCase() || ''

    if (commands.has(command)) {
      try {
        await commands.get(command).run({ sock, m, args })
      } catch {
        await sock.sendMessage(m.key.remoteJid, { text: 'Erreur' })
      }
    } else {
      try {
        if (commands.has('default')) {
          await commands.get('default').run({ sock, m, args: [body] })
        }
      } catch {
        await sock.sendMessage(m.key.remoteJid, { text: 'Je ne comprends pas.' })
      }
    }
  })
}

io.on('connection', (socket) => {
  socket.on('admin-number', (number) => {
    ADMIN_NUMBER = number.startsWith('+') ? number.slice(1) : number
    startBot()
  })
})
