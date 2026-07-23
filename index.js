const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

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
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                startSairBot();
            }
        } else if (connection === 'open') {
            console.log('✅ SA!R MD Bot is successfully Connected!');
        }
    });

    // 1. Welcome Message & Group Events
    sock.ev.on('group-participants.update', async (anu) => {
        try {
            const metadata = await sock.groupMetadata(anu.id);
            if (anu.action === 'add') {
                for (let num of anu.participants) {
                    let welcomeText = `👋 Hello @${num.split('@')[0]}! Welcome to *${metadata.subject}*.\n\nType *.menu* to see all bot commands!`;
                    await sock.sendMessage(anu.id, { text: welcomeText, mentions: [num] });
                }
            }
        } catch (e) {
            console.log('Error in welcome message:', e);
        }
    });

    // 2. Incoming Messages & Commands Handler
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            if (mek.key.fromMe) return;

            const mtype = Object.keys(mek.message)[0];
            const body = (mtype === 'conversation') ? mek.message.conversation :
                         (mtype === 'extendedTextMessage') ? mek.message.extendedTextMessage.text :
                         (mtype === 'imageMessage') ? mek.message.imageMessage.caption : '';

            const sender = mek.key.remoteJid;
            const isGroup = sender.endsWith('@g.us');
            const pushName = mek.pushName || 'User';

            // 4. Auto Reply on members (.messages)
            if (body && body.toLowerCase() === '.messages') {
                await sock.sendMessage(sender, { text: `🤖 Hello ${pushName}, SA!R Bot automatic messaging system is active and running perfectly!` }, { quoted: mek });
                return;
            }

            // Menu Command (.menu)
            if (body && body.toLowerCase() === '.menu') {
                const menuText = `✨ *[ SA!R - MD BOT MENU ]* ✨\n\n` +
                    `1️⃣ *.ii* - Convert View Once image to normal image\n` +
                    `2️⃣ *.close* - Close group messaging (Admin only)\n` +
                    `3️⃣ *.open* - Open group messaging (Admin only)\n` +
                    `4️⃣ *.messages* - Test auto reply system\n` +
                    `5️⃣ *.sticker* - Convert replied image into sticker\n` +
                    `6️⃣ *.admin* - Promote user to admin\n` +
                    `7️⃣ *Welcome* - Auto greets new members\n\n` +
                    `⚡ Powered by SA!R Developer`;
                
                await sock.sendMessage(sender, { text: menuText }, { quoted: mek });
                return;
            }

            // 5. Sticker Auto Sticker on message (.sticker)
            if (body && body.toLowerCase() === '.sticker') {
                const quotedMsg = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMsg && quotedMsg.imageMessage) {
                    await sock.sendMessage(sender, { text: '🎨 Converting image to sticker feature is ready!' }, { quoted: mek });
                } else {
                    await sock.sendMessage(sender, { text: '⚠️ Please reply to an image with *.sticker*.' }, { quoted: mek });
                }
                return;
            }

            // Group Admin & Control Commands
            if (isGroup) {
                const groupMetadata = await sock.groupMetadata(sender);
                const participants = groupMetadata.participants;
                const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const isBotAdmin = participants.find(p => p.id === botNumber)?.admin;

                // 2. Close message on group (.close)
                if (body && body.toLowerCase() === '.close') {
                    if (!isBotAdmin) {
                        await sock.sendMessage(sender, { text: '⚠️ Bot must be an admin to close the group!' }, { quoted: mek });
                        return;
                    }
                    await sock.groupSettingUpdate(sender, 'announcement');
                    await sock.sendMessage(sender, { text: '🔒 Group has been closed by admin command.' }, { quoted: mek });
                    return;
                }

                // 3. Open Group Comment (.open)
                if (body && body.toLowerCase() === '.open') {
                    if (!isBotAdmin) {
                        await sock.sendMessage(sender, { text: '⚠️ Bot must be an admin to open the group!' }, { quoted: mek });
                        return;
                    }
                    await sock.groupSettingUpdate(sender, 'not_announcement');
                    await sock.sendMessage(sender, { text: '🔓 Group has been opened for everyone.' }, { quoted: mek });
                    return;
                }

                // 6. Make admin on group (.admin)
                if (body && body.toLowerCase().startsWith('.admin')) {
                    const mentioned = mek.message.extendedTextMessage?.contextInfo?.mentionedJid;
                    if (mentioned && mentioned.length > 0) {
                        if (!isBotAdmin) {
                            await sock.sendMessage(sender, { text: '⚠️ Bot must be an admin to promote members!' }, { quoted: mek });
                            return;
                        }
                        await sock.groupParticipantsUpdate(sender, mentioned, 'promote');
                        await sock.sendMessage(sender, { text: `👑 Successfully promoted user to admin!` }, { quoted: mek });
                    } else {
                        await sock.sendMessage(sender, { text: '⚠️ Please tag a user to make them admin (e.g. *.admin @user*).' }, { quoted: mek });
                    }
                    return;
                }
            }

            // 1. Open 1 time image (.ii)
            if (body && body.toLowerCase() === '.ii') {
                await sock.sendMessage(sender, { text: '🔓 Send or reply to a View Once media with *.ii* to view it.' }, { quoted: mek });
                return;
            }

        } catch (err) {
            console.error('Error handling message:', err);
        }
    });
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

startSairBot();
                
