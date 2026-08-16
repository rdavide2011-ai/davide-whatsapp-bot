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
// QR CODE
// ======================================================

function getQR() {
  return currentQR;
}

// ======================================================
// ESTRAI TESTO NORMALE
// ======================================================

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
// ESTRAI EVENTUALE PULSANTE
// ======================================================

function getButtonId(message) {
  if (!message) return "";

  return (
    message.buttonsResponseMessage?.selectedButtonId ||
    message.templateButtonReplyMessage?.selectedId ||
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

      markOnlineOnConnect: false,

      syncFullHistory: false
    });

    // ==================================================
    // SALVA CREDENZIALI
    // ==================================================

    sock.ev.on("creds.update", saveCreds);

    // ==================================================
    // CONNESSIONE
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

      // DISCONNESSO
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
    // MESSAGGI
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

            const chat =
              message.key.remoteJid;

            const fromMe =
              message.key.fromMe;

            const normalText =
              getMessageText(
                message.message
              ).trim();

            const buttonId =
              getButtonId(
                message.message
              ).trim();

            console.log("");
            console.log(
              "=========================================="
            );

            console.log(
              "📩 NUOVO MESSAGGIO"
            );

            console.log(
              "JID:",
              chat
            );

            console.log(
              "Da me:",
              fromMe
            );

            console.log(
              "Testo:",
              normalText || "(nessun testo)"
            );

            if (buttonId) {

              console.log(
                "🔘 PULSANTE PREMUTO:",
                buttonId
              );

            }

            // ------------------------------------------
            // IGNORA MESSAGGI DEL BOT
            // ------------------------------------------

            if (fromMe) {

              console.log(
                "↩️ Messaggio inviato dal bot. Ignorato."
              );

              continue;
            }

            if (!chat) continue;

            // ==================================================
            // DETERMINA IL COMANDO
            // ==================================================

            const command =
              buttonId ||
              normalText;

            if (!command) {

              console.log(
                "⚠️ Nessun testo o pulsante riconosciuto."
              );

              continue;
            }

            console.log(
              "🎯 Comando:",
              command
            );

            // ==================================================
            // /COMANDI
            // ==================================================

            if (
              command.toLowerCase() === "/comandi"
            ) {

              console.log(
                "🤖 /comandi riconosciuto."
              );

              await sock.sendMessage(chat, {

                text:
                  "🤖 *COMANDI BOT*\n\n" +
                  "• /comandi — Mostra i comandi\n" +
                  "• /ping — Controlla se il bot è online\n" +
                  "• /info — Mostra le informazioni del bot\n" +
                  "• ciao — Saluta il bot"

              });

              console.log(
                "✅ Lista comandi inviata."
              );

              continue;
            }

            // ==================================================
            // /PING
            // ==================================================

            if (
              command.toLowerCase() === "/ping"
            ) {

              console.log(
                "🏓 /ping riconosciuto."
              );

              await sock.sendMessage(chat, {
                text: "🏓 Pong!"
              });

              continue;
            }

            // ==================================================
            // /INFO
            // ==================================================

            if (
              command.toLowerCase() === "/info"
            ) {

              console.log(
                "ℹ️ /info riconosciuto."
              );

              await sock.sendMessage(chat, {

                text:
                  "🤖 *Davide WhatsApp Bot*\n\n" +
                  "🟢 Stato: Online\n" +
                  "⚡ Powered by Baileys"

              });

              continue;
            }

            // ==================================================
            // CIAO
            // ==================================================

            if (
              command.toLowerCase() === "ciao"
            ) {

              console.log(
                "👋 Ciao riconosciuto."
              );

              // ------------------------------------------
              // MESSAGGIO CON PULSANTE
              // ------------------------------------------

              try {

                await sock.sendMessage(chat, {

                  text:
                    "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖",

                  buttons: [

                    {
                      buttonId: "/comandi",
                      buttonText: {
                        displayText: "/comandi"
                      },
                      type: 1
                    }

                  ],

                  headerType: 1

                });

                console.log(
                  "✅ Messaggio Ciao + pulsante inviato."
                );

              } catch (buttonError) {

                console.error(
                  "❌ Errore invio pulsante:"
                );

                console.error(buttonError);

                // Fallback: se WhatsApp rifiuta
                // il messaggio interattivo,
                // manda comunque il normale Ciao.

                await sock.sendMessage(chat, {

                  text:
                    "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖\n\n" +
                    "Scrivi /comandi per vedere i comandi."

                });

              }

              continue;
            }

            // ==================================================
            // NESSUN COMANDO
            // ==================================================

            console.log(
              "ℹ️ Comando non riconosciuto:",
              command
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

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  startWhatsApp,
  getQR
};
