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

      markOnlineOnConnect: false,

      syncFullHistory: false
    });

    // ==================================================
    // SALVATAGGIO SESSIONE
    // ==================================================

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

      // QR
      if (qr) {

        currentQR = qr;

        console.log(
          "📷 QR Code WhatsApp disponibile."
        );

        console.log(
          "🌐 Apri la pagina del bot per scansionarlo."
        );
      }

      // CONNESSO
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

      // CHIUSO
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
            "🚪 Sessione WhatsApp disconnessa."
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
    // DIAGNOSTICA SOCKET
    // ==================================================

    if (sock.ws) {

      sock.ws.on("CB:message", (node) => {

        console.log("");
        console.log(
          "📡 MESSAGGIO RICEVUTO DAL SOCKET WHATSAPP"
        );

        try {

          console.log(
            JSON.stringify(node)
          );

        } catch (error) {

          console.log(
            "⚠️ Impossibile mostrare il contenuto del nodo."
          );

        }
      });

    }

    // ==================================================
    // MESSAGGI BAILEYS
    // ==================================================

    sock.ev.on(
      "messages.upsert",
      async ({ messages, type }) => {

        console.log("");
        console.log(
          "📨 EVENTO messages.upsert RICEVUTO"
        );

        console.log(
          "Tipo:",
          type
        );

        console.log(
          "Numero messaggi:",
          messages.length
        );

        for (const message of messages) {

          try {

            if (!message) continue;

            if (!message.message) {

              console.log(
                "⚠️ Messaggio senza contenuto."
              );

              continue;
            }

            console.log("");
            console.log(
              "=========================================="
            );

            console.log(
              "📩 NUOVO MESSAGGIO"
            );

            console.log(
              "JID:",
              message.key.remoteJid
            );

            console.log(
              "Da me:",
              message.key.fromMe
            );

            const text =
              getMessageText(
                message.message
              ).trim();

            console.log(
              "Testo:",
              text || "(nessun testo)"
            );

            // ------------------------------------------
            // IGNORA I MESSAGGI DEL BOT
            // ------------------------------------------

            if (message.key.fromMe) {

              console.log(
                "↩️ Messaggio inviato dal bot. Ignorato."
              );

              continue;
            }

            // ------------------------------------------
            // CHAT
            // ------------------------------------------

            const chat =
              message.key.remoteJid;

            if (!chat) {

              console.log(
                "⚠️ Chat non identificata."
              );

              continue;
            }

            if (!text) {

              console.log(
                "⚠️ Messaggio senza testo."
              );

              continue;
            }

            console.log(
              "📩 Messaggio ricevuto:",
              text
            );

            // ==================================================
            // MESSAGGIO CITATO
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
              getMessageText(
                quotedMessage
              ).trim();

            if (quotedMessage) {

              console.log(
                "↩️ MESSAGGIO CITATO:"
              );

              console.log(
                quotedText || "(senza testo)"
              );
            }

            // ==================================================
            // /COMANDI
            // ==================================================

            if (
              text.toLowerCase() === "/comandi"
            ) {

              if (!quotedMessage) {

                await sock.sendMessage(chat, {
                  text:
                    "🤖 *COMANDI BOT*\n\n" +
                    "• /comandi\n" +
                    "• /ping\n" +
                    "• /info\n\n" +
                    "Puoi anche rispondere a un messaggio con /comandi."
                });

              } else {

                await sock.sendMessage(chat, {
                  text:
                    "🎯 *MESSAGGIO SELEZIONATO*\n\n" +
                    (
                      quotedText
                        ? `💬 ${quotedText}`
                        : "💬 Il messaggio citato non contiene testo."
                    )
                });

              }

              continue;
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

              continue;
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
                  "⚡ Baileys"
              });

              continue;
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

              continue;
            }

            console.log(
              "ℹ️ Nessun comando associato."
            );

            console.log(
              "=========================================="
            );

          } catch (error) {

            console.error(
              "❌ Errore elaborazione messaggio:"
            );

            console.error(error);

          }

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
