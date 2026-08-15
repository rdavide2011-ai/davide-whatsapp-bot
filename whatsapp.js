const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");

const P = require("pino");

const AUTH_FOLDER = "./auth_info";

let pairingCodeRequested = false;

async function startWhatsApp() {
  console.log("📱 Avvio WhatsApp...");

  const { state, saveCreds } =
    await useMultiFileAuthState(AUTH_FOLDER);

  const sock = makeWASocket({
    auth: state,

    logger: P({
      level: "silent"
    }),

    // Browser emulato dal server.
    // NON dipende dal Chrome del tuo PC.
    browser: Browsers.macOS("Google Chrome"),

    printQRInTerminal: false,

    markOnlineOnConnect: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const {
      connection,
      lastDisconnect,
      qr
    } = update;

    console.log(
      "📡 Stato WhatsApp:",
      connection || "waiting"
    );

    // ==========================================
    // RICHIESTA CODICE DI COLLEGAMENTO
    // ==========================================

    if (
      !state.creds.registered &&
      !pairingCodeRequested &&
      (connection === "connecting" || qr)
    ) {
      pairingCodeRequested = true;

      const number = process.env.WHATSAPP_NUMBER;

      if (!number) {
        console.error("");
        console.error("❌ WHATSAPP_NUMBER NON CONFIGURATO");
        console.error("");
        return;
      }

      const cleanNumber = number.replace(/\D/g, "");

      console.log("");
      console.log("📱 Numero utilizzato:");
      console.log(cleanNumber);
      console.log("");
      console.log("⏳ Connessione ai server WhatsApp...");
      console.log("");

      try {
        await new Promise((resolve) =>
          setTimeout(resolve, 5000)
        );

        console.log(
          "📲 Richiesta codice WhatsApp..."
        );

        const code =
          await sock.requestPairingCode(
            cleanNumber
          );

        console.log("");
        console.log(
          "=========================================="
        );
        console.log(
          "          🔐 CODICE WHATSAPP"
        );
        console.log(
          "=========================================="
        );
        console.log("");
        console.log(
          `              ${code}`
        );
        console.log("");
        console.log(
          "=========================================="
        );
        console.log("");
        console.log(
          "📱 SULL'IPHONE:"
        );
        console.log("");
        console.log(
          "WhatsApp"
        );
        console.log(
          "→ Impostazioni"
        );
        console.log(
          "→ Dispositivi collegati"
        );
        console.log(
          "→ Collega un dispositivo"
        );
        console.log(
          "→ Collega con numero di telefono"
        );
        console.log("");
        console.log(
          `🔑 Inserisci: ${code}`
        );
        console.log("");
        console.log(
          "=========================================="
        );
        console.log("");

      } catch (error) {
        console.error("");
        console.error(
          "❌ ERRORE GENERAZIONE CODICE"
        );
        console.error("");

        console.error(error);

        console.error("");

        pairingCodeRequested = false;
      }
    }

    // ==========================================
    // WHATSAPP COLLEGATO
    // ==========================================

    if (connection === "open") {
      console.log("");
      console.log(
        "=========================================="
      );
      console.log(
        "       ✅ WHATSAPP COLLEGATO!"
      );
      console.log(
        "=========================================="
      );
      console.log("");

      pairingCodeRequested = true;
    }

    // ==========================================
    // CONNESSIONE CHIUSA
    // ==========================================

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      console.log("");
      console.log(
        `❌ Connessione WhatsApp chiusa: ${statusCode}`
      );

      console.log(
        "Errore completo:",
        lastDisconnect?.error
      );

      if (
        statusCode === DisconnectReason.loggedOut
      ) {
        console.log(
          "🚪 Sessione WhatsApp disconnessa."
        );

        return;
      }

      console.log(
        "🔄 Riconnessione tra 5 secondi..."
      );

      pairingCodeRequested = false;

      setTimeout(() => {
        startWhatsApp();
      }, 5000);
    }
  });

  // ==========================================
  // MESSAGGI
  // ==========================================

  sock.ev.on(
    "messages.upsert",
    async ({ messages }) => {
      try {
        const message = messages[0];

        if (!message) return;

        if (!message.message) return;

        if (message.key.fromMe) return;

        const text =
          message.message.conversation ||
          message.message.extendedTextMessage?.text ||
          "";

        if (!text) return;

        const chat =
          message.key.remoteJid;

        console.log(
          `📩 Messaggio ricevuto: ${text}`
        );

        // ======================================
        // CIAO
        // ======================================

        if (
          text.trim().toLowerCase() === "ciao"
        ) {
          await sock.sendMessage(chat, {
            text:
              "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖"
          });
        }

        // ======================================
        // PING
        // ======================================

        if (
          text.trim().toLowerCase() === "!ping"
        ) {
          await sock.sendMessage(chat, {
            text: "🏓 Pong!"
          });
        }

        // ======================================
        // INFO
        // ======================================

        if (
          text.trim().toLowerCase() === "!info"
        ) {
          await sock.sendMessage(chat, {
            text:
              "🤖 Davide WhatsApp Bot\n\n" +
              "🟢 Stato: Online\n" +
              "⚡ Powered by Baileys"
          });
        }

      } catch (error) {
        console.error(
          "❌ Errore gestione messaggio:"
        );

        console.error(error);
      }
    }
  );
}

module.exports = startWhatsApp;
