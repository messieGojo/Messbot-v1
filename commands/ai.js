const axios = require('axios');
const config = require('../config');

module.exports = async function handleAI(msg, sock) {
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const from = msg.key.remoteJid;
    try {
        const res = await axios.get(`${config.IA_ENDPOINT}${encodeURIComponent(text)}&apiKey=${config.IA_KEY}`);
        await sock.sendMessage(from, { text: res.data.reply }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: 'Erreur IA' }, { quoted: msg });
    }
};
