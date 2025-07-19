const axios = require('axios')

module.exports = async (msg, sock) => {
  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text
  if (!text) return

  try {
    const res = await axios.get(`https://messie-flash-api-ia.vercel.app/chat?prompt=${encodeURIComponent(text)}&key=messie12356osango2025jinWoo`)
    const reply = res.data?.response || "Aucune réponse reçue"
    await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg })
  } catch {
    await sock.sendMessage(msg.key.remoteJid, { text: "❌ Erreur IA. Serveur indisponible ou mauvais paramètre." }, { quoted: msg })
  }
}
