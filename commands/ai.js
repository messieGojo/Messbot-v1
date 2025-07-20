const axios = require('axios');

module.exports = {
  name: 'ai',
  description: 'Répond automatiquement à tous les messages via l\'IA',
  author: 'Messie Osango',
  version: '1.0.0',

  execute: async function (msg, sock) {
    try {
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text || '';

      const from = msg.key.remoteJid;
      if (!text.trim()) return;

      const apiUrl = `https://messie-flash-api-ia.vercel.app/chat?prompt=${encodeURIComponent(text)}&apiKey=messie12356osango2025jinWoo`;

      const response = await axios.get(apiUrl, { timeout: 10000 });

      const result = response?.data?.result;
      if (!result || typeof result !== 'string') {
        await sock.sendMessage(from, {
          text: '⚠️ Réponse invalide reçue de l’IA.'
        });
        return;
      }

      await sock.sendMessage(from, { text: result });
    } catch (error) {
      console.error('[AI COMMAND ERROR]', error);
      let msgErr = '❌ Erreur lors de la requête à l’IA.';
      if (error.code === 'ECONNABORTED') {
        msgErr = '⏱️ Temps de réponse trop long.';
      } else if (error.response?.status === 401) {
        msgErr = '🔐 Clé API invalide ou non autorisée.';
      }
      await sock.sendMessage(msg.key.remoteJid, { text: msgErr });
    }
  }
};
