import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import path from 'path'
import { fileURLToPath } from 'url'
import aiCommand from './commands/ai.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = createServer(app)
const io = new Server(server)

let sock
let pairingCode
let socketClient

app.use(express.static(path.join(__dirname, 'public')))

io.on('connection', (socket) => {
  console.log('Client connecté')
  socketClient = socket

  socket.on('admin-number', async (number) => {
    if (!number) return

    pairingCode = await startBot(number)

    if (pairingCode) {
      socket.emit('pairing-code', pairingCode)
    } else {
      socket.emit('error', 'Erreur lors de la génération du code.')
    }
  })
})

async function startBot(adminNumber) {
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, pairingCode: code }) => {
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Connexion fermée. Reconnexion:', shouldReconnect)
      if (shouldReconnect) {
        startBot(adminNumber)
      }
    }

    if (code && socketClient) {
      pairingCode = code
      socketClient.emit('pairing-code', pairingCode)
    }

    if (connection === 'open') {
      console.log('✅ Bot connecté avec succès.')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ''

    if (text.toLowerCase().startsWith('!ai')) {
      msg.message.conversation = text.replace(/^!ai\s*/i, '')
      await aiCommand.execute(msg, sock)
    }
  })

  return pairingCode
}

server.listen(3000, () => {
  console.log('Serveur démarré sur http://localhost:3000')
})
