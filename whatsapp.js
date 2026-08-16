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

    // ==========================================
    // CONNESSIONE WHATSAPP
    // ==========================================

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

      // QR CODE
      if (qr) {
        currentQR = qr;

        console.log(
          "📷 QR Code WhatsApp disponibile."
        );

        console.log(
          "🌐 Apri /qr per visualizzarlo."
        );
      }

      // WHATSAPP COLLEGATO
      if (connection === "open") {
        currentQR = null;
        starting = false;

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
      }

      // CONNESSIONE CHIUSA
      if (connection === "close") {
        currentQR = null;
        starting = false;

        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        console.log(
          "❌ Connessione WhatsApp chiusa:",
          statusCode
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

          const chat =
            message.key.remoteJid;

          // TESTO RICEVUTO
          const text =
            message.message.conversation ||
            message.message.extendedTextMessage?.text ||
            "";

          if (!text) return;

          const command =
            text.trim().toLowerCase();

          console.log(
            `📩 Messaggio ricevuto: ${text}`
          );

          // ======================================
          // CIAO
          // ======================================

          if (command === "ciao") {

            await sock.sendMessage(
              chat,
              {
                text:
                  "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖\n\n" +
                  "Per vedere tutti i comandi scrivi:\n" +
                  "/comandi"
              }
            );

            console.log(
              "✅ Messaggio di benvenuto inviato."
            );

            return;
          }

          // ======================================
          // /COMANDI
          // ======================================

          if (command === "/comandi") {

            await sock.sendMessage(
              chat,
              {
                text:
                  "🤖 *COMANDI DISPONIBILI*\n\n" +
                  "🏓 /ping\n" +
                  "Controlla se il bot è online."
              }
            );

            console.log(
              "📋 Lista comandi inviata."
            );

            return;
          }

          // ======================================
          // /PING
          // ======================================

          if (command === "/ping") {

            await sock.sendMessage(
              chat,
              {
                text:
                  "🏓 Pong!"
              }
            );

            console.log(
              "🏓 Pong inviato."
            );

            return;
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
