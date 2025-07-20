const axios = require('axios');

const API_URL = 'https://messie-flash-api-ia.vercel.app/chat?prompt=';
const API_KEY = 'messie12356osango2025jinWoo';

module.exports = {
  name: 'ai',
  version: '1.0',
  description: 'Commande IA sans mot-clé, répond automatiquement à chaque message.',
  author: 'Messie Osango',

  execute: async function (msg, sock) {
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text || '';

    const from = msg.key.remoteJid;
    if (!text.trim()) return;

    try {
      const res = await axios.get(`${API_URL}${encodeURIComponent(text)}&apiKey=${API_KEY}`, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' }
      });

      let answer = 'Désolé, aucune réponse obtenue.';

      if (res.data?.parts?.[0]?.reponse) {
        answer = res.data.parts[0].reponse;
      } else if (res.data?.response) {
        answer = res.data.response;
      } else if (res.data?.result) {
        answer = res.data.result;
      }

      await sock.sendMessage(from, { text: answer });
    } catch (error) {
      console.error('Erreur API IA:', error?.message || error);
      await sock.sendMessage(from, {
        text: '❌ Erreur de connexion à l’IA. Veuillez réessayer plus tard.'
      });
    }
  }
};
