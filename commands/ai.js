const axios = require('axios');

module.exports = {
  name: 'ai',
  description: 'Répond automatiquement à tous les messages via l\'IA',
  author: 'Messie Osango',
  version: '1.0.0',

  execute: async function(msg, sock) {
    try {
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const from = msg.key.remoteJid;

      if (!text.trim()) return;

      const response = await axios.get(
        `https://messie-flash-api-ia.vercel.app/chat`,
        {
          params: {
            prompt: text,
            apiKey: 'messie12356osango2025jinWoo'
          },
          timeout: 15000
        }
      );

      if (!response.data?.result) {
        throw new Error('Réponse vide de l\'API');
      }

      await sock.sendMessage(from, { text: response.data.result });

    } catch (error) {
      console.error('Erreur AI:', error.message);
      
      const errorMsg = error.response?.status === 401 
        ? 'Clé API invalide'
        : error.code === 'ECONNABORTED'
          ? 'Le serveur met trop de temps à répondre'
          : error.message.includes('vide')
            ? 'L\'IA n\'a pas pu générer de réponse'
            : 'Erreur de connexion au serveur AI';

      await sock.sendMessage(from, { text: errorMsg });
    }
  }
};
