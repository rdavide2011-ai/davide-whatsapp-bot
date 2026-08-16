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
// QR
// ======================================================

function getQR() {
  return currentQR;
}

// ======================================================
// TESTO MESSAGGIO
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
// RISPOSTA PULSANTE
// ======================================================

function getButtonId(message) {
  if (!message) return "";

  // Native Flow
  const nativeFlow =
    message.interactiveResponseMessage
      ?.nativeFlowResponseMessage;

  if (nativeFlow?.paramsJson) {
    try {
      const params = JSON.parse(
        nativeFlow.paramsJson
      );

      return (
        params.id ||
        params.selected_id ||
        ""
      );

    } catch (error) {
      console.log(
        "⚠️ Errore lettura pulsante:",
        error.message
      );
    }
  }

  // Vecchi formati
  return (
    message.buttonsResponseMessage
      ?.selectedButtonId ||
    message.templateButtonReplyMessage
      ?.selectedId ||
    ""
  );
}

// ======================================================
// INVIA CIAO + PULSANTE
// ======================================================

async function sendWelcome(sock, jid) {

  console.log(
    "📤 Invio messaggio interattivo..."
  );

  await sock.sendMessage(jid, {

    text:
      "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖",

    footer:
      "Seleziona un comando:",

    interactiveButtons: [

      {
        name: "quick_reply",

        buttonParamsJson:
          JSON.stringify({
            display_text: "/comandi",
            id: "/comandi"
          })
      }

    ]

  });

  console.log(
    "✅ Messaggio interattivo inviato."
  );
}

// ======================================================
// AVVIO WHATSAPP
// ======================================================

async function startWhatsApp() {

  if (starting) return;

  starting = true;

  try {

    console.log(
      "📱 Avvio WhatsApp..."
    );

    const {
      state,
      saveCreds
    } =
      await useMultiFileAuthState(
        AUTH_FOLDER
      );

    const sock =
      makeWASocket({

        auth: state,

        logger: P({
          level: "silent"
        }),

        browser:
          Browsers.macOS(
            "Google Chrome"
          ),

        printQRInTerminal: false,

        markOnlineOnConnect: false,

        syncFullHistory: false

      });

    // ==================================================
    // CREDENZIALI
    // ==================================================

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    // ==================================================
    // CONNESSIONE
    // ==================================================

    sock.ev.on(
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

        // OPEN
        if (
          connection === "open"
        ) {

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

        // CLOSE
        if (
          connection === "close"
        ) {

          currentQR = null;

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          console.log(
            "❌ Connessione WhatsApp chiusa:",
            statusCode
          );

          starting = false;

          if (
            statusCode ===
            DisconnectReason.loggedOut
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

      }
    );

    // ==================================================
    // MESSAGGI
    // ==================================================

    sock.ev.on(
      "messages.upsert",
      async ({
        messages,
        type
      }) => {

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

        for (
          const message of messages
        ) {

          try {

            if (!message) continue;

            if (!message.message) {
              continue;
            }

            const chat =
              message.key.remoteJid;

            const fromMe =
              message.key.fromMe;

            const text =
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
              text ||
              "(nessun testo)"
            );

            if (buttonId) {

              console.log(
                "🔘 PULSANTE:",
                buttonId
              );
            }

            // ------------------------------------------
            // IGNORA BOT
            // ------------------------------------------

            if (fromMe) {

              console.log(
                "↩️ Messaggio inviato dal bot. Ignorato."
              );

              continue;
            }

            if (!chat) {
              continue;
            }

            // ==================================================
            // COMANDO
            // ==================================================

            const command =
              buttonId ||
              text;

            if (!command) {
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
              command.toLowerCase() ===
              "/comandi"
            ) {

              console.log(
                "🤖 /comandi riconosciuto."
              );

              await sock.sendMessage(
                chat,
                {
                  text:
                    "🤖 *COMANDI BOT*\n\n" +
                    "• /comandi — Mostra tutti i comandi\n" +
                    "• /ping — Controlla se il bot è online\n" +
                    "• /info — Mostra le informazioni del bot\n" +
                    "• ciao — Saluta il bot"
                }
              );

              console.log(
                "✅ Lista comandi inviata."
              );

              continue;
            }

            // ==================================================
            // /PING
            // ==================================================

            if (
              command.toLowerCase() ===
              "/ping"
            ) {

              await sock.sendMessage(
                chat,
                {
                  text: "🏓 Pong!"
                }
              );

              continue;
            }

            // ==================================================
            // /INFO
            // ==================================================

            if (
              command.toLowerCase() ===
              "/info"
            ) {

              await sock.sendMessage(
                chat,
                {
                  text:
                    "🤖 *Davide WhatsApp Bot*\n\n" +
                    "🟢 Stato: Online\n" +
                    "⚡ Powered by Baileys"
                }
              );

              continue;
            }

            // ==================================================
            // CIAO
            // ==================================================

            if (
              command.toLowerCase() ===
              "ciao"
            ) {

              console.log(
                "👋 Ciao riconosciuto."
              );

              try {

                await sendWelcome(
                  sock,
                  chat
                );

              } catch (error) {

                console.error(
                  "❌ ERRORE INVIO PULSANTE:"
                );

                console.error(
                  error
                );

                // Fallback sicuro
                await sock.sendMessage(
                  chat,
                  {
                    text:
                      "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖\n\n" +
                      "Scrivi /comandi per vedere i comandi."
                  }
                );

              }

              continue;
            }

            // ==================================================
            // NON RICONOSCIUTO
            // ==================================================

            console.log(
              "ℹ️ Comando non riconosciuto:",
              command
            );

          } catch (error) {

            console.error(
              "❌ Errore elaborazione messaggio:"
            );

            console.error(
              error
            );

          }

        }

      }
    );

  } catch (error) {

    console.error(
      "❌ Errore avvio WhatsApp:"
    );

    console.error(
      error
    );

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
