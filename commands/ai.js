const axios = require('axios');

module.exports = {
  name: 'ai',
  description: 'Répond automatiquement à tous les messages',
  author: 'Messie Osango',
  version: '1.3.0',

  execute: async function(msg, sock) {
  
    if (msg.key.remoteJid.endsWith('@g.us') || msg.key.fromMe) return;

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!text?.trim()) return;

    try {
      const { data } = await axios.get('https://messie-flash-api-ia.vercel.app/chat', {
        params: {
          prompt: text,
          apiKey: 'messie12356osango2025jinWoo'
        },
        timeout: 15000
      });

      if (data?.result) {
        await sock.sendMessage(msg.key.remoteJid, { 
          text: data.result,
          mentions: [msg.key.participant || msg.key.remoteJid]
        });
      }
    } catch (error) {
      console.error('Erreur AI:', error.message);
    
    }
  }
};
