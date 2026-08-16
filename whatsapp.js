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
// ESTRAI RISPOSTA PULSANTE
// ======================================================

function getButtonId(message) {
  if (!message) return "";

  const response =
    message.interactiveResponseMessage;

  if (
    response?.nativeFlowResponseMessage
      ?.paramsJson
  ) {
    try {
      const params = JSON.parse(
        response.nativeFlowResponseMessage.paramsJson
      );

      return (
        params.id ||
        params.selected_id ||
        ""
      );
    } catch (error) {
      console.log(
        "⚠️ Errore lettura risposta pulsante:",
        error.message
      );
    }
  }

  // Formati precedenti
  return (
    message.buttonsResponseMessage
      ?.selectedButtonId ||
    message.templateButtonReplyMessage
      ?.selectedId ||
    ""
  );
}

// ======================================================
// PRIVACY MODE TIMESTAMP
// ======================================================

function getPrivacyModeTs() {
  const offset = 77980457;

  return (
    Math.floor(Date.now() / 1000) -
    offset
  ).toString();
}

// ======================================================
// BIZ NODE PER NATIVE FLOW
// ======================================================

function buildMixedNativeFlowBizNode() {

  return {
    tag: "biz",

    attrs: {
      actual_actors: "2",
      host_storage: "2",
      privacy_mode_ts:
        getPrivacyModeTs()
    },

    content: [

      {
        tag: "interactive",

        attrs: {
          type: "native_flow",
          v: "1"
        },

        content: [

          {
            tag: "native_flow",

            attrs: {
              v: "9",
              name: "mixed"
            }
          }

        ]
      },

      {
        tag: "quality_control",

        attrs: {
          source_type: "third_party"
        }
      }

    ]
  };
}

// ======================================================
// INVIA MESSAGGIO CON VERO PULSANTE WHATSAPP
// ======================================================

async function sendWelcomeWithButton(
  sock,
  jid
) {

  console.log(
    "📤 Creazione messaggio interattivo..."
  );

  // ------------------------------------------
  // PULSANTE
  // ------------------------------------------

  const button = {

    name: "quick_reply",

    buttonParamsJson:
      JSON.stringify({

        display_text:
          "/comandi",

        id:
          "/comandi"

      })

  };

  // ------------------------------------------
  // INTERACTIVE MESSAGE
  // ------------------------------------------

  const interactiveMessage =
    proto.Message.InteractiveMessage.create({

      header:
        proto.Message.InteractiveMessage.Header.create({
          hasMediaAttachment: false
        }),

      body:
        proto.Message.InteractiveMessage.Body.create({

          text:
            "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖\n\n" +
            "Premi il pulsante qui sotto per vedere i comandi."

        }),

      footer:
        proto.Message.InteractiveMessage.Footer.create({

          text:
            "Davide WhatsApp Bot"

        }),

      nativeFlowMessage:
        proto.Message.InteractiveMessage.NativeFlowMessage.create({

          buttons: [

            proto.Message
              .InteractiveMessage
              .NativeFlowMessage
              .NativeFlowButton
              .create({

                name:
                  button.name,

                buttonParamsJson:
                  button.buttonParamsJson

              })

          ],

          messageParamsJson:
            "{}",

          messageVersion:
            1

        })

    });

  // ------------------------------------------
  // GENERA MESSAGGIO WHATSAPP
  // ------------------------------------------

  const waMessage =
    generateWAMessageFromContent(

      jid,

      {
        interactiveMessage
      },

      {
        userJid:
          sock.user?.id
      }

    );

  // ------------------------------------------
  // BIZ NODE
  // ------------------------------------------

  const bizNode =
    buildMixedNativeFlowBizNode();

  // ------------------------------------------
  // BOT NODE
  // ------------------------------------------

  const botNode = {

    tag: "bot",

    attrs: {
      biz_bot: "1"
    }

  };

  // ------------------------------------------
  // CHAT PRIVATA / GRUPPO
  // ------------------------------------------

  const isGroup =
    jid.endsWith("@g.us");

  const additionalNodes =
    isGroup

      ? [bizNode]

      : [
          botNode,
          bizNode
        ];

  // ------------------------------------------
  // INVIO REALE
  // ------------------------------------------

  await sock.relayMessage(

    jid,

    waMessage.message,

    {
      messageId:
        waMessage.key.id,

      additionalNodes

    }

  );

  console.log(
    "✅ Messaggio interattivo con pulsante /comandi inviato."
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

        auth:
          state,

        logger:
          P({
            level: "silent"
          }),

        browser:
          Browsers.macOS(
            "Google Chrome"
          ),

        printQRInTerminal:
          false,

        markOnlineOnConnect:
          false,

        syncFullHistory:
          false

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
          connection ||
          "waiting"
        );

        // QR
        if (qr) {

          currentQR =
            qr;

          console.log(
            "📷 QR Code WhatsApp disponibile."
          );

          console.log(
            "🌐 Apri la pagina del bot per scansionarlo."
          );
        }

        // OPEN
        if (
          connection ===
          "open"
        ) {

          currentQR =
            null;

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

          starting =
            false;
        }

        // CLOSE
        if (
          connection ===
          "close"
        ) {

          currentQR =
            null;

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          console.log(
            "❌ Connessione WhatsApp chiusa:",
            statusCode
          );

          starting =
            false;

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

          setTimeout(
            () => {
              startWhatsApp();
            },
            5000
          );
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

            if (!message)
              continue;

            if (!message.message)
              continue;

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

            if (!chat)
              continue;

            // ------------------------------------------
            // COMANDO
            // ------------------------------------------

            const command =
              buttonId ||
              text;

            if (!command)
              continue;

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
                  text:
                    "🏓 Pong!"
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

                await sendWelcomeWithButton(
                  sock,
                  chat
                );

              } catch (error) {

                console.error(
                  "❌ ERRORE INVIO MESSAGGIO INTERATTIVO:"
                );

                console.error(
                  error
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

    starting =
      false;

    setTimeout(
      () => {
        startWhatsApp();
      },
      5000
    );

  }

}

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  startWhatsApp,
  getQR
};
