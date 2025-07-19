const axios = require('axios');

module.exports = {
  name: 'ai',
  description: 'Répond automatiquement à tous les messages via l\'IA',
  author: 'Messie Osango',
  version: '1.0.0',

  execute: async function(msg, sock) {
    try {
      const text = 
        msg.message?.conversation || 
        msg.message?.extendedTextMessage?.text || 
        '';
      
      const from = msg.key.remoteJid;

      if (!text.trim()) return;

      const apiUrl = `https://messie-flash-api-ia.vercel.app/chat?prompt=${encodeURIComponent(text)}&apiKey=messie12356osango2025jinWoo`;
      
      const axiosConfig = {
        timeout: 10000
      };

      const response = await axios.get(apiUrl, axiosConfig);

      if (response?.data?.result) {
        await sock.sendMessage(from, { text: response.data.result });
      } else {
        await sock.sendMessage(from, {
          text: 'L\'IA n\'a pas pu générer de réponse valide.'
        });
      }
    } catch (error) {
      console.error('Erreur dans la commande AI:', error);
      
      let errorMessage = 'Une erreur est survenue lors du traitement de votre demande.';
      
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'La requête a pris trop de temps, veuillez réessayer.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Erreur d\'authentification avec l\'API IA.';
      }
      
      await sock.sendMessage(from, { text: errorMessage });
    }
  },
};
