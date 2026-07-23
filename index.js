const { default: makeWASocket, useMultiFileAuthState, delay, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

        await delay(2000);

        if (!sock.authState.creds.registered) {
            let code = await sock.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join('-') || code;
            res.json({ code: code });
        } else {
            res.status(400).json({ error: 'Number is already registered.' });
        }

        setTimeout(() => {
            fs.rm(sessionDir, { recursive: true, force: true }, () => {});
        }, 180000);

    } catch (err) {
        console.error('Pairing error:', err);
        res.status(500).json({ error: 'Failed to generate real pairing code. Try again.' });
    }
});

app.listen(PORT, () => {
    console.log(`SA!R Bot server is running on port ${PORT}`);
});
