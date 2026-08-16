const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  proto,
  generateWAMessageFromContent
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
// ESTRAI TESTO
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
// ESTRAI RISPOSTA DEL PULSANTE
// ======================================================

function getButtonResponse(message) {
  if (!message) return "";

  // Native Flow / quick_reply
  const nativeFlow =
    message.interactiveResponseMessage
      ?.nativeFlowResponseMessage;

  if (nativeFlow?.paramsJson) {
    try {
      const params = JSON.parse(nativeFlow.paramsJson);

      return (
        params.id ||
        params.selected_id ||
        params.button_id ||
        ""
      );
    } catch (error) {
      console.log(
        "⚠️ Impossibile leggere paramsJson del pulsante."
      );
    }
  }

  // Formati alternativi
  return (
    message.buttonsResponseMessage?.selectedButtonId ||
    message.templateButtonReplyMessage?.selectedId ||
    ""
  );
}

// ======================================================
// INVIA MESSAGGIO CON PULSANTE /COMANDI
// ======================================================

async function sendWelcomeWithButton(sock, jid) {

  const message = generateWAMessageFromContent(
    jid,
    proto.Message.fromObject({
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },

          interactiveMessage:
            proto.Message.InteractiveMessage.fromObject({

              body: {
                text:
                  "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖"
              },

              footer: {
                text: "Seleziona un'opzione:"
              },

              nativeFlowMessage:
                proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({

                  buttons: [
                    {
                      name: "quick_reply",

                      buttonParamsJson:
                        JSON.stringify({
                          display_text: "/comandi",
                          id: "/comandi"
                        })
                    }
                  ],

                  messageParamsJson: ""
                })
            })
        }
      }
    }),
    {}
  );

  await sock.relayMessage(
    jid,
    message.message,
    {
      messageId: message.key.id
    }
  );

  console.log(
    "✅ Ciao + pulsante /comandi inviati."
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

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      AUTH_FOLDER
    );

    const sock = makeWASocket({

      auth: state,

      logger: P({
        level: "silent"
      }),

      browser:
        Browsers.macOS("Google Chrome"),

      printQRInTerminal: false,

      markOnlineOnConnect: false,

      syncFullHistory: false
    });

    // ==================================================
    // SALVA CREDENZIALI
    // ==================================================

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    // ==================================================
    // STATO CONNESSIONE
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

            const buttonResponse =
              getButtonResponse(
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
              normalText ||
              "(nessun testo)"
            );

            if (buttonResponse) {

              console.log(
                "🔘 PULSANTE PREMUTO:",
                buttonResponse
              );
            }

            // ==================================================
            // IGNORA MESSAGGI INVIATI DAL BOT
            // ==================================================

            if (fromMe) {

              console.log(
                "↩️ Messaggio inviato dal bot. Ignorato."
              );

              continue;
            }

            if (!chat) continue;

            // ==================================================
            // COMANDO
            // ==================================================

            const command =
              buttonResponse ||
              normalText;

            if (!command) {

              console.log(
                "⚠️ Nessun comando riconosciuto."
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

              console.log(
                "🏓 /ping riconosciuto."
              );

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

              console.log(
                "ℹ️ /info riconosciuto."
              );

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

              await sendWelcomeWithButton(
                sock,
                chat
              );

              continue;
            }

            // ==================================================
            // COMANDO NON RICONOSCIUTO
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
