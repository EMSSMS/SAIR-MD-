const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Frontend Interface from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Pairing Code API Endpoint
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

        // Wait briefly for socket initialization before requesting pair code
        await delay(3000);

        if (!sock.authState.creds.registered) {
            let code = await sock.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join('-') || code;
            res.json({ code: code });
        } else {
            res.status(400).json({ error: 'Number is already registered.' });
        }

        // Clean up temporary session folder after a few minutes
        setTimeout(() => {
            fs.rm(sessionDir, { recursive: true, force: true }, () => {});
        }, 300000);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to generate pairing code. Try again.' });
    }
});

app.listen(PORT, () => {
    console.log(`SA!R Bot server is running on port ${PORT}`);
});
          
