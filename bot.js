import makeWASocket, { useSingleFileAuthState } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const AUTH_FILE = './auth_info.json'
const COMMANDS_DIR = './commands/ai'

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static('public'))

let ADMIN_NUMBER = ''
let pairingCode = ''
const { state, saveCreds } = useSingleFileAuthState(AUTH_FILE)
const commands = new Map()

function generateGenID() {
  return crypto.randomBytes(4).toString('hex').toUpperCase()
}

function loadCommands() {
  if (!fs.existsSync(COMMANDS_DIR)) fs.mkdirSync(COMMANDS_DIR)
  fs.readdirSync(COMMANDS_DIR).forEach(file => {
    const command = require(path.join(COMMANDS_DIR, file))
    if (command.name && command.run) commands.set(command.name.toLowerCase(), command)
  })
}

const startBot = async () => {
  const sock = makeWASocket({ auth: state, printQRInTerminal: false })
  sock.ev.on('creds.update', saveCreds)

  if (!fs.existsSync(AUTH_FILE) && ADMIN_NUMBER) {
    pairingCode = await sock.requestPairingCode(`${ADMIN_NUMBER}@s.whatsapp.net`)
    const genid = generateGenID()
    console.log(`✅ GEN ID : ${genid}`)
    io.emit('pairing-code', pairingCode)
    io.emit('genid', genid)
  }

  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'close') {
      const reason = new Boom(update.lastDisconnect?.error)?.output?.statusCode
      if (reason !== 401) setTimeout(startBot, 5000)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0]
    if (!m.message) return
    const body = m.message.conversation || m.message.extendedTextMessage?.text || ''
    const args = body.trim().split(/\s+/)
    const command = args.shift().toLowerCase()

    if (commands.has(command)) {
      try {
        await commands.get(command).run({ sock, m, args })
      } catch {
        await sock.sendMessage(m.key.remoteJid, { text: 'Erreur' })
      }
    } else {
      try {
        const aiDefault = require('./commands/ai/default')
        await aiDefault.run({ sock, m, args: [body] })
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

server.listen(3000, () => {
  console.log('✅ Interface disponible sur http://localhost:3000')
})

loadCommands()
