const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");

const P = require("pino");

const AUTH_FOLDER = "./auth_info";

let currentQR = null;

let socket = null;

function getQR() {
  return currentQR;
}

async function startWhatsApp() {
  console.log("📱 Avvio WhatsApp...");

  const { state, saveCreds } =
    await useMultiFileAuthState(AUTH_FOLDER);

  socket = makeWASocket({
    auth: state,

    logger: P({
      level: "silent"
    }),

    browser: Browsers.macOS("Google Chrome"),

    printQRInTerminal: false,

    markOnlineOnConnect: false
  });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on(
    "connection.update",
    async (update) => {
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
      // NUOVO QR CODE
      // ==========================================

      if (qr) {
        currentQR = qr;

        console.log(
          "📷 Nuovo QR Code WhatsApp disponibile!"
        );

        console.log(
          "🌐 Apri la pagina /qr per scansionarlo."
        );
      }

      // ==========================================
      // CONNESSIONE RIUSCITA
      // ==========================================

      if (connection === "open") {
        currentQR = null;

        console.log("");
        console.log(
          "======================================"
        );
        console.log(
          "       ✅ WHATSAPP COLLEGATO"
        );
        console.log(
          "======================================"
        );
        console.log("");
      }

      // ==========================================
      // CONNESSIONE CHIUSA
      // ==========================================

      if (connection === "close") {
        currentQR = null;

        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

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

        setTimeout(() => {
          startWhatsApp();
        }, 5000);
      }
    }
  );

  // ==========================================
  // MESSAGGI
  // ==========================================

  socket.ev.on(
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

        if (
          text.trim().toLowerCase() === "ciao"
        ) {
          await socket.sendMessage(chat, {
            text:
              "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖"
          });
        }

        if (
          text.trim().toLowerCase() === "!ping"
        ) {
          await socket.sendMessage(chat, {
            text: "🏓 Pong!"
          });
        }

        if (
          text.trim().toLowerCase() === "!info"
        ) {
          await socket.sendMessage(chat, {
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

module.exports = {
  startWhatsApp,
  getQR
};
