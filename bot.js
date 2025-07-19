const { default: makeWASocket, useMultiFileAuthState, makeInMemoryStore, DisconnectReason } = require("@whiskeysockets/baileys")
const { Boom } = require("@hapi/boom")
const P = require("pino")
const qrcode = require("qrcode-terminal")
const handleAI = require("./commands/ai")

const startBot = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' })
  })

  const store = makeInMemoryStore({ logger: P().child({ level: 'fatal', stream: 'store' }) })
  store.bind(sock.ev)

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        startBot()
      }
    } else if (connection === 'open') {
      console.log('Bot connecté')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
    if (from.endsWith('@g.us')) return

    const message = msg.message.conversation || msg.message.extendedTextMessage?.text || ''

    if (message.toLowerCase() === 'ping') {
      await sock.sendMessage(from, { text: 'pong' })
    } else if (message.toLowerCase().startsWith('ia ')) {
      await handleAI(msg, sock)
    }
  })
}

startBot()
