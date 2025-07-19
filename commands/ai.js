const axios = require('axios')

module.exports = async function handleAI(msg, sock) {
  const text = msg.message.conversation || msg.message.extendedTextMessage?.text
  const from = msg.key.remoteJid
  try {
    const res = await axios.get(`https://messie-flash-api-ia.vercel.app/chat?prompt=${encodeURIComponent(text)}&apiKey=messie12356osango2025jinWoo`)
    await sock.sendMessage(from, { text: res.data.result })
  } catch (e) {
    await sock.sendMessage(from, { text: 'Erreur de connexion au serveur !'})
  }
}
