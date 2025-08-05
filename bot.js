const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;

let sock;
let connectionState = { status: 'disconnected', qr: null, code: null, message: 'Service prêt à générer un code.' };
let isConnecting = false;

async function connectToWhatsApp(phoneNumber = null) {
    if (isConnecting) return;
    isConnecting = true;

    if (fs.existsSync('./auth_info_baileys')) {
        fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['CyberCodex', 'Chrome', '1.0.0'],
        logger: pino({ level: 'silent' }),
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
            connectionState = { status: 'connected', qr: null, code: null, message: `Connecté avec succès à ${sock.user.id.split(':')[0]}` };
            isConnecting = false;
        } else if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                connectionState = { status: 'disconnected', qr: null, code: null, message: 'Déconnecté avec succès. Prêt pour un nouveau code.' };
            } else {
                connectionState = { status: 'disconnected', qr: null, code: null, message: 'La connexion a été fermée. Prêt pour un nouveau code.' };
            }
            isConnecting = false;
            if (fs.existsSync('./auth_info_baileys')) {
                fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
            }
        }
    });

    // Attendre que la connexion soit prête avant de demander le code de pairage
    sock.ev.once('connection.update', async ({ connection }) => {
        if (connection === 'connecting') return;

        if (connection === 'close') {
            isConnecting = false;
            return;
        }

        if (phoneNumber && !sock.user) {
            try {
                connectionState = { status: 'pairing', qr: null, code: null, message: 'Demande du code de pairage...' };
                const code = await sock.requestPairingCode(phoneNumber);
                connectionState = { status: 'code_ready', qr: null, code, message: 'Code prêt. Entrez-le sur votre téléphone.' };
            } catch (error) {
                console.error('❌ Erreur lors de la génération du code de pairage :', error);
                connectionState = { status: 'error', qr: null, code: null, message: 'Erreur lors de la génération du code de pairage.' };
            } finally {
                isConnecting = false;
            }
        }
    });
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/generate-code', async (req, res) => {
    const phoneNumber = req.body.phone;
    if (!phoneNumber || !/^[1-9]\d{5,14}$/.test(phoneNumber)) {
        return res.status(400).json({ message: 'Numéro de téléphone invalide. Ne mettez pas le "+" ou "00".' });
    }

    if (isConnecting) {
        return res.status(409).json({ message: 'Une génération de code est déjà en cours, veuillez patienter.' });
    }

    connectionState = { status: 'starting', qr: null, code: null, message: 'Initialisation...' };
    await connectToWhatsApp(phoneNumber);

    if (connectionState.status === 'code_ready') {
        res.status(200).json({ code: connectionState.code });
    } else {
        res.status(500).json({ message: connectionState.message || 'Impossible de générer le code.' });
    }
});

app.get('/status', (req, res) => {
    res.json({ ...connectionState });
});

app.listen(PORT, () => {
    console.log(`Serveur actif sur le port ${PORT}`);
});
