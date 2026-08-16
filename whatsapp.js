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

// ======================================================
// FUNZIONI UTILI
// ======================================================

function getQR() {
  return currentQR;
}

// Estrae il testo da un messaggio WhatsApp
function getMessageText(message) {
  if (!message) return "";

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ""
  );
}

// ======================================================
// AVVIO WHATSAPP
// ======================================================

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

    // ==================================================
    // STATO CONNESSIONE
    // ==================================================

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

      // -------------------------------
      // QR
      // -------------------------------

      if (qr) {
        currentQR = qr;

        console.log(
          "📷 QR Code WhatsApp disponibile."
        );

        console.log(
          "🌐 Apri la pagina del bot per scansionarlo."
        );
      }

      // -------------------------------
      // CONNESSO
      // -------------------------------

      if (connection === "open") {
        currentQR = null;

        console.log("");
        console.log(
          "=========================================="
        );
        console.log(
          "        ✅ WHATSAPP COLLEGATO"
        );
        console.log(
          "=========================================="
        );
        console.log("");

        starting = false;
      }

      // -------------------------------
      // DISCONNESSO
      // -------------------------------

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

    // ==================================================
    // MESSAGGI
    // ==================================================

    sock.ev.on(
      "messages.upsert",
      async ({ messages }) => {

        try {

          const message = messages[0];

          if (!message) return;
          if (!message.message) return;

          // Ignora i messaggi inviati dal bot
          if (message.key.fromMe) return;

          const text =
            getMessageText(message).trim();

          if (!text) return;

          const chat =
            message.key.remoteJid;

          console.log("");
          console.log(
            "📩 Messaggio ricevuto:",
            text
          );

          // ==================================================
          // CONTROLLO MESSAGGIO CITATO
          // ==================================================

          const contextInfo =
            message.message.extendedTextMessage
              ?.contextInfo ||
            message.message.imageMessage
              ?.contextInfo ||
            message.message.videoMessage
              ?.contextInfo ||
            message.message.documentMessage
              ?.contextInfo;

          const quotedMessage =
            contextInfo?.quotedMessage || null;

          const quotedText =
            getMessageText(quotedMessage).trim();

          const isReply =
            !!quotedMessage;

          // ==================================================
          // LOG DEL MESSAGGIO CITATO
          // ==================================================

          if (isReply) {

            console.log(
              "↩️ Questo messaggio è una risposta."
            );

            console.log(
              "💬 Messaggio citato:",
              quotedText || "(senza testo)"
            );

          }

          // ==================================================
          // /COMANDI
          // ==================================================

          if (
            text.toLowerCase() === "/comandi"
          ) {

            // ----------------------------------------------
            // /comandi SENZA messaggio citato
            // ----------------------------------------------

            if (!isReply) {

              await sock.sendMessage(chat, {
                text:
                  "🤖 *COMANDI BOT*\n\n" +
                  "• /comandi — mostra i comandi\n" +
                  "• /ping — controlla se il bot è online\n" +
                  "• /info — informazioni sul bot\n\n" +
                  "💡 Puoi anche rispondere a un messaggio con /comandi."
              });

              return;
            }

            // ----------------------------------------------
            // /comandi COME RISPOSTA
            // ----------------------------------------------

            console.log(
              "🎯 /comandi collegato al messaggio citato."
            );

            console.log(
              "🎯 Testo selezionato:",
              quotedText || "(nessun testo)"
            );

            await sock.sendMessage(chat, {
              text:
                "🎯 *MESSAGGIO SELEZIONATO*\n\n" +
                (
                  quotedText
                    ? `💬 ${quotedText}\n\n`
                    : "💬 Il messaggio citato non contiene testo.\n\n"
                ) +
                "✅ Il bot ha riconosciuto il messaggio a cui hai risposto."
            });

            return;
          }

          // ==================================================
          // /PING
          // ==================================================

          if (
            text.toLowerCase() === "/ping"
          ) {

            await sock.sendMessage(chat, {
              text: "🏓 Pong!"
            });

            return;
          }

          // ==================================================
          // /INFO
          // ==================================================

          if (
            text.toLowerCase() === "/info"
          ) {

            await sock.sendMessage(chat, {
              text:
                "🤖 *Davide WhatsApp Bot*\n\n" +
                "🟢 Stato: Online\n" +
                "⚡ Powered by Baileys"
            });

            return;
          }

          // ==================================================
          // CIAO
          // ==================================================

          if (
            text.toLowerCase() === "ciao"
          ) {

            await sock.sendMessage(chat, {
              text:
                "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖"
            });

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

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  startWhatsApp,
  getQR
};
