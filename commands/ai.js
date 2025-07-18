const axios = require('axios');
const { IA_ENDPOINT, API_KEY } = require('../config');

module.exports = {
  name: 'ask',
  description: 'Pose une question à l’IA',
  async execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    if (!args.length) {
      return sock.sendMessage(from, { text: 'Utilisation : !ask [question]' });
    }

    const prompt = args.join(' ');

    try {
      const res = await axios.get(`${IA_ENDPOINT}?prompt=${encodeURIComponent(prompt)}&apiKey=${API_KEY}`, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' }
      });

      const answer = res.data.answer || 'Aucune réponse.';
      await sock.sendMessage(from, { text: answer });

    } catch (e) {
      await sock.sendMessage(from, { text: '❌ Erreur lors de la requête IA.' });
    }
  }
};
