const axios = require('axios');

const API_URL = 'https://messie-flash-api-ia.vercel.app/chat?prompt=';
const API_KEY = 'messie12356osango2025jinWoo';

module.exports = {
  name: 'ai',
  version: '1.1',
  description: 'commande Ai pour messbot.',
  author: 'Messie Osango',

  execute: async function (msg, sock) {
    const from = msg.key.remoteJid;
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      '';

    const prompt = text.trim();
    if (!prompt || prompt.length < 2) return;

    try {
      const response = await axios.get(`${API_URL}${encodeURIComponent(prompt)}&apiKey=${API_KEY}`, {
        timeout: 15000,
        headers: { 'Accept': 'application/json' }
      });

      const r = response.data;
      const answer =
        r?.parts?.[0]?.reponse ||
        r?.response ||
        r?.result ||
        'Désolé, je n’ai pas pu générer de réponse.';

      await sock.sendMessage(from, { text: answer });
    } catch {
      await sock.sendMessage(from, {
        text: '❌ Erreur de connexion à l’IA. Veuillez réessayer plus tard.'
      });
    }
  }
};
