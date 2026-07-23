const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const CHANNEL_LINK = "https://whatsapp.com/channel/0029Vb8MH6EC6ZvcsSyRNp3b";

async function startSairBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Chrome')
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startSairBot();
        } else if (connection === 'open') {
            console.log('✅ SA!R MD Bot connected successfully!');
        }
    });

    // Auto DM Channel Link on any user message/command
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        const mek = chatUpdate.messages[0];
        if (!mek.message || mek.key.fromMe) return;

        const sender = mek.key.remoteJid;
        const replyText = `✨ *[ SA!R MD BOT AUTO REPLY ]* ✨\n\nThanks for messaging! Join our official WhatsApp channel for updates:\n${CHANNEL_LINK}`;
        
        await sock.sendMessage(sender, { text: replyText }, { quoted: mek });
    });
}

startSairBot();

app.listen(PORT, () => {
    console.log(`SA!R MD Server is running on port ${PORT}`);
});
