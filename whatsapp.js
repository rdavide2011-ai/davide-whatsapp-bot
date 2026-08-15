const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");

const P = require("pino");

const AUTH_FOLDER = "./auth_info";

let currentQR = null;
let starting = false;

function getQR() {
  return currentQR;
}

async function startWhatsApp() {
  if (starting) return;

  starting = true;

  try {
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
      // QR CODE
      // ==========================================

      if (qr) {
        currentQR = qr;

        console.log(
          "📷 QR Code WhatsApp disponibile."
        );

        console.log(
          "🌐 Apri la pagina del bot per scansionarlo."
        );
      }

      // ==========================================
      // WHATSAPP COLLEGATO
      // ==========================================

      if (connection === "open") {
        currentQR = null;

        console.log("");
        console.log(
          "=========================================="
        );
        console.log(
          "       ✅ WHATSAPP COLLEGATO"
        );
        console.log(
          "=========================================="
        );
        console.log("");

        starting = false;
      }

      // ==========================================
      // CONNESSIONE CHIUSA
      // ==========================================

      if (connection === "close") {
        currentQR = null;

        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        console.log(
          "❌ Connessione WhatsApp chiusa:",
          statusCode
        );

        starting = false;

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

  } catch (error) {
    console.error(
      "❌ Errore avvio WhatsApp:"
    );

    console.error(error);

    starting = false;

    setTimeout(() => {
      startWhatsApp();
    }, 5000);
  }
}

module.exports = {
  startWhatsApp,
  getQR
};
