const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const config = require('./config');

const { state, saveState } = useSingleFileAuthState('./sessions/auth.json');

async function connectBot() {
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
    });

    sock.ev.on('creds.update', saveState);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectBot();
        } else if (connection === 'open') {
            console.log('BOT CONNECTÉ');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (!messages || !messages[0]?.message) return;

        const msg = messages[0];
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (!text) return;

        try {
            const res = await axios.get(`${config.IA_ENDPOINT}${encodeURIComponent(text)}&apiKey=${config.IA_KEY}`);
            await sock.sendMessage(from, { text: res.data.reply || 'Réponse vide' }, { quoted: msg });
        } catch (e) {
            await sock.sendMessage(from, { text: 'Erreur IA' }, { quoted: msg });
        }
    });
}

connectBot();
