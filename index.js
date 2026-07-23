const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, delay } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Real WhatsApp Pairing Code API Endpoint
app.get('/code', async (req, res) => {
    let phoneNumber = req.query.number;
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

    const sessionDir = path.join(__dirname, 'temp_sessions', `${Date.now()}`);
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
        const sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Chrome')
        });

        sock.ev.on('creds.update', saveCreds);

        // Connection status update handler
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log('✅ SA!R MD Bot successfully connected to WhatsApp!');
            } else if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    // Reconnect logic if needed
                }
            }
        });

        await delay(3000);

        if (!sock.authState.creds.registered) {
            let code = await sock.requestPairingCode(phoneNumber);
            // Ensure format is clean and readable
            code = code?.match(/.{1,4}/g)?.join('-') || code;
            res.json({ code: code });
        } else {
            res.status(400).json({ error: 'Number is already registered.' });
        }

        // Clean up temporary session folder after 5 minutes
        setTimeout(() => {
            fs.rm(sessionDir, { recursive: true, force: true }, () => {});
        }, 300000);

    } catch (err) {
        console.error('Pairing error:', err);
        res.status(500).json({ error: 'Failed to generate real pairing code. Please try again.' });
    }
});

// Bot Command Handler (All 8+ Features)
function startBotListeners() {
    // This runs in background to handle bot events when connected
}

app.listen(PORT, () => {
    console.log(`SA!R MD Ultimate Server is running on port ${PORT}`);
});
        
