const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: "./whatsapp_session"
    }),
    puppeteer: {
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox"
        ]
    }
});

client.on("qr", (qr) => {
    console.log("");
    console.log("================================");
    console.log("📱 SCANSIONA QUESTO QR CODE");
    console.log("================================");
    console.log("");

    qrcode.generate(qr, {
        small: true
    });

    console.log("");
});

client.on("ready", () => {
    console.log("");
    console.log("================================");
    console.log("🤖 WHATSAPP BOT COLLEGATO!");
    console.log("================================");
    console.log("");
});

client.on("authenticated", () => {
    console.log("🔐 WhatsApp autenticato.");
});

client.on("auth_failure", (message) => {
    console.log("❌ Errore di autenticazione:");
    console.log(message);
});

client.on("disconnected", (reason) => {
    console.log("❌ WhatsApp disconnesso:");
    console.log(reason);
});

client.on("message", async (message) => {

    const text = message.body.toLowerCase().trim();

    console.log("📩 Messaggio ricevuto:", message.body);

    if (text === "ciao") {

        await message.reply(
            "👋 Ciao! Sono il tuo primo WhatsApp Bot 🤖"
        );

    } else if (text === "menu") {

        await message.reply(
            "🤖 MENU\n\n" +
            "1️⃣ Prodotti\n" +
            "2️⃣ Contatti\n" +
            "3️⃣ Stato bot\n\n" +
            "Scrivi il numero dell'opzione."
        );

    } else if (text === "1") {

        await message.reply(
            "📦 PRODOTTI\n\n" +
            "Presto qui inseriremo i prodotti."
        );

    } else if (text === "2") {

        await message.reply(
            "📞 CONTATTI\n\n" +
            "Presto qui inseriremo i contatti."
        );

    } else if (text === "3") {

        await message.reply(
            "🟢 BOT ONLINE!"
        );

    }

});

client.initialize();