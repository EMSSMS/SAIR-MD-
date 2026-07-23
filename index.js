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

// Channel Link to send on every user message / command
const CHANNEL_LINK = "https://whatsapp.com/channel/0029Vb8MH6EC6ZvcsSyRNp3b";

// Real Pairing Code API
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

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log('✅ SA!R MD Bot successfully connected to WhatsApp!');
            }
        });

        // Listen to incoming messages and auto-reply with Channel Link in DM
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            if (mek.key.fromMe) return;

            const sender = mek.key.remoteJid;
            const messageText = `✨ *[ SA!R MD BOT AUTO REPLY ]* ✨\n\nThanks for messaging! Join our official WhatsApp channel for updates:\n${CHANNEL_LINK}`;
            
            // Send channel link to user DM
            await sock.sendMessage(sender, { text: messageText }, { quoted: mek });
        });

        await delay(3000);

        if (!sock.authState.creds.registered) {
            let code = await sock.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join('-') || code;
            res.json({ code: code });
        } else {
            res.status(400).json({ error: 'Number is already registered.' });
        }

        setTimeout(() => {
            fs.rm(sessionDir, { recursive: true, force: true }, () => {});
        }, 300000);

    } catch (err) {
        console.error('Pairing error:', err);
        res.status(500).json({ error: 'Failed to generate pairing code. Try again.' });
    }
});

app.listen(PORT, () => {
    console.log(`SA!R MD Ultimate Server is running on port ${PORT}`);
});
        
