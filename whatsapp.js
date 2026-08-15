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
    // CODICE DI COLLEGAMENTO
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
        console.error("❌ ERRORE");
        console.error(
          "Manca la variabile WHATSAPP_NUMBER su Railway."
        );
        console.error("");
        return;
      }

      const cleanNumber = number.replace(/\D/g, "");

      console.log("");
      console.log("⏳ Preparazione collegamento WhatsApp...");
      console.log(`📱 Numero: ${cleanNumber}`);
      console.log("");

      try {
        await new Promise((resolve) =>
          setTimeout(resolve, 3000)
        );

        console.log("📲 Richiesta codice WhatsApp...");

        const code =
          await sock.requestPairingCode(cleanNumber);

        console.log("");
        console.log("==========================================");
        console.log("       🔐 CODICE WHATSAPP");
        console.log("==========================================");
        console.log("");
        console.log(`              ${code}`);
        console.log("");
        console.log("==========================================");
        console.log("Sul telefono:");
        console.log("");
        console.log("WhatsApp");
        console.log("→ Impostazioni");
        console.log("→ Dispositivi collegati");
        console.log("→ Collega un dispositivo");
        console.log("→ Collega con numero di telefono");
        console.log("");
        console.log("Inserisci il codice:");
        console.log(`              ${code}`);
        console.log("");
        console.log("==========================================");
        console.log("");

      } catch (error) {
        console.error("");
        console.error("❌ ERRORE GENERAZIONE CODICE");
        console.error(error);
        console.error("");

        pairingCodeRequested = false;
      }
    }

    // ==========================================
    // CONNESSIONE RIUSCITA
    // ==========================================

    if (connection === "open") {
      console.log("");
      console.log("==========================================");
      console.log("       ✅ WHATSAPP COLLEGATO");
      console.log("==========================================");
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
        `❌ Connessione chiusa: ${statusCode}`
      );

      if (
        statusCode === DisconnectReason.loggedOut
      ) {
        console.log(
          "🚪 WhatsApp ha effettuato il logout."
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

        const chat = message.key.remoteJid;

        console.log(
          `📩 Messaggio ricevuto: ${text}`
        );

        // CIAO
        if (
          text.trim().toLowerCase() === "ciao"
        ) {
          await sock.sendMessage(chat, {
            text:
              "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖"
          });
        }

        // PING
        if (
          text.trim().toLowerCase() === "!ping"
        ) {
          await sock.sendMessage(chat, {
            text: "🏓 Pong!"
          });
        }

        // INFO
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
