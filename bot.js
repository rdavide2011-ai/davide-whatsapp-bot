const makeWASocket = require("@whiskeysockets/baileys").default;
const {
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");

    const sock = makeWASocket({
        auth: state
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("\n📱 SCANSIONA QUESTO QR CON WHATSAPP:\n");
            qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
            console.log("🤖 WhatsApp Bot collegato!");
        }

        if (connection === "close") {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            console.log("❌ Connessione chiusa.");

            if (shouldReconnect) {
                console.log("🔄 Riconnessione...");
                startBot();
            }
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const message = messages[0];

        if (!message.message || message.key.fromMe) {
            return;
        }

        const text =
            message.message.conversation ||
            message.message.extendedTextMessage?.text ||
            "";

        console.log("📩 Messaggio ricevuto:", text);

        if (text.toLowerCase() === "ciao") {
            await sock.sendMessage(message.key.remoteJid, {
                text: "👋 Ciao! Sono il tuo primo WhatsApp Bot 🤖"
            });
        }
    });
}

startBot();