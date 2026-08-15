const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");

const express = require("express");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 WhatsApp Bot online");
});

app.listen(PORT, () => {
  console.log(`🌐 Server avviato sulla porta ${PORT}`);
});

async function startWhatsApp() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./auth_info");

  const sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu("Davide WhatsApp Bot"),
    printQRInTerminal: false,
    markOnlineOnConnect: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "connecting") {
      console.log("🔄 Connessione a WhatsApp...");
    }

    if (connection === "open") {
      console.log("✅ WHATSAPP COLLEGATO!");
      console.log("🤖 Bot online e funzionante.");
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      console.log("❌ Connessione chiusa:", statusCode);

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("🔄 Riconnessione...");
        setTimeout(startWhatsApp, 3000);
      } else {
        console.log("❌ WhatsApp scollegato. Devi effettuare nuovamente il pairing.");
      }
    }

    // PAIRING CODE
    if (
      !state.creds.registered &&
      (connection === "connecting" || update.qr)
    ) {
      const phoneNumber = process.env.WHATSAPP_NUMBER;

      if (!phoneNumber) {
        console.error(
          "❌ Manca la variabile WHATSAPP_NUMBER nelle Variables di Railway."
        );
        return;
      }

      try {
        const code = await sock.requestPairingCode(phoneNumber);

        console.log("");
        console.log("====================================");
        console.log("       🔐 WHATSAPP PAIRING CODE");
        console.log("====================================");
        console.log("");
        console.log(`       ${code}`);
        console.log("");
        console.log("====================================");
        console.log("📱 WhatsApp → Impostazioni");
        console.log("→ Dispositivi collegati");
        console.log("→ Collega un dispositivo");
        console.log("→ Collega con numero di telefono");
        console.log("====================================");
        console.log("");
      } catch (error) {
        console.error("❌ Errore pairing:", error);
      }
    }
  });

  // Esempio risposta ai messaggi
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];

    if (!msg || !msg.message) return;
    if (msg.key.fromMe) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    console.log(
      `📩 Messaggio ricevuto: ${text}`
    );

    if (text.toLowerCase() === "ciao") {
      await sock.sendMessage(msg.key.remoteJid, {
        text: "Ciao! 👋 Sono il bot di Davide 🤖"
      });
    }
  });
}

startWhatsApp().catch((error) => {
  console.error("❌ ERRORE FATALE:", error);
});
