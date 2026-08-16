const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  proto,
  generateWAMessageFromContent,
  isJidGroup
} = require("@whiskeysockets/baileys");

const P = require("pino");

const AUTH_FOLDER = "./auth_info";

let currentQR = null;
let starting = false;

function getQR() {
  return currentQR;
}

// ==========================================
// BIZ NODE
// ==========================================

function getPrivacyModeTs() {
  return (
    Math.floor(Date.now() / 1000) - 77980457
  ).toString();
}

function buildMixedNativeFlowBizNode() {
  return {
    tag: "biz",
    attrs: {
      actual_actors: "2",
      host_storage: "2",
      privacy_mode_ts: getPrivacyModeTs()
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

// ==========================================
// INVIA QUICK REPLY
// ==========================================

async function sendQuickReply(
  sock,
  jid,
  text,
  buttonText,
  buttonId
) {
  const nativeFlowButton =
    proto.Message
      .InteractiveMessage
      .NativeFlowMessage
      .NativeFlowButton
      .create({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: buttonText,
          id: buttonId
        })
      });

  const interactiveMessage =
    proto.Message.InteractiveMessage.create({
      body:
        proto.Message.InteractiveMessage.Body.create({
          text: text
        }),

      footer:
        proto.Message.InteractiveMessage.Footer.create({
          text: "Davide WhatsApp Bot"
        }),

      nativeFlowMessage:
        proto.Message
          .InteractiveMessage
          .NativeFlowMessage
          .create({
            buttons: [
              nativeFlowButton
            ],
            messageParamsJson: "{}",
            messageVersion: 1
          })
    });

  const waMessage =
    generateWAMessageFromContent(
      jid,
      {
        interactiveMessage:
          interactiveMessage
      },
      {
        userJid: sock.user.id
      }
    );

  const bizNode =
    buildMixedNativeFlowBizNode();

  const botNode = {
    tag: "bot",
    attrs: {
      biz_bot: "1"
    }
  };

  const additionalNodes =
    isJidGroup(jid)
      ? [bizNode]
      : [botNode, bizNode];

  await sock.relayMessage(
    jid,
    waMessage.message,
    {
      messageId: waMessage.key.id,
      additionalNodes
    }
  );
}

// ==========================================
// AVVIO WHATSAPP
// ==========================================

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

      markOnlineOnConnect: false
    });

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    // ========================================
    // CONNESSIONE
    // ========================================

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

        if (qr) {
          currentQR = qr;

          console.log(
            "📷 QR Code WhatsApp disponibile."
          );

          console.log(
            "🌐 Apri /qr per visualizzarlo."
          );
        }

        if (connection === "open") {
          currentQR = null;
          starting = false;

          console.log(
            "=========================================="
          );
          console.log(
            "       ✅ WHATSAPP COLLEGATO"
          );
          console.log(
            "=========================================="
          );
        }

        if (connection === "close") {
          currentQR = null;
          starting = false;

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          console.log(
            "❌ Connessione WhatsApp chiusa:",
            statusCode
          );

          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {
            console.log(
              "🚪 WhatsApp ha effettuato il logout."
            );

            return;
          }

          console.log(
            "🔄 Riconnessione tra 5 secondi..."
          );

          setTimeout(
            startWhatsApp,
            5000
          );
        }
      }
    );

    // ========================================
    // MESSAGGI
    // ========================================

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

          // ==================================
          // QUICK REPLY
          // ==================================

          const interactiveResponse =
            message.message
              .interactiveResponseMessage;

          if (interactiveResponse) {

            try {
              const paramsJson =
                interactiveResponse
                  ?.nativeFlowResponseMessage
                  ?.paramsJson;

              if (!paramsJson) return;

              const params =
                JSON.parse(paramsJson);

              const buttonId =
                params.id;

              console.log(
                `🔘 Quick Reply ricevuto: ${buttonId}`
              );

              // =================================
              // /COMANDI
              // =================================

              if (
                buttonId === "/comandi"
              ) {

                // NUOVO MESSAGGIO QUOTATO
                // AL MESSAGGIO DEL BOT
                await sock.sendMessage(
                  chat,
                  {
                    text: "/comandi"
                  },
                  {
                    quoted: message
                  }
                );

                // POI RISPOSTA DEL BOT
                await sendQuickReply(
                  sock,
                  chat,

                  "🤖 COMANDI DISPONIBILI\n\n" +
                  "Premi il pulsante qui sotto per eseguire il comando.",

                  "/ping",

                  "/ping"
                );

                return;
              }

              // =================================
              // /PING
              // =================================

              if (
                buttonId === "/ping"
              ) {

                await sock.sendMessage(
                  chat,
                  {
                    text: "/ping"
                  },
                  {
                    quoted: message
                  }
                );

                await sock.sendMessage(
                  chat,
                  {
                    text: "🏓 Pong!"
                  }
                );

                return;
              }

            } catch (error) {
              console.error(
                "❌ Errore Quick Reply:"
              );

              console.error(error);
            }

            return;
          }

          // ==================================
          // TESTO NORMALE
          // ==================================

          const text =
            message.message
              .conversation ||
            message.message
              .extendedTextMessage
              ?.text ||
            "";

          if (!text) return;

          const command =
            text
              .trim()
              .toLowerCase();

          console.log(
            `📩 Messaggio ricevuto: ${text}`
          );

          // ==================================
          // CIAO
          // ==================================

          if (
            command === "ciao"
          ) {

            await sendQuickReply(
              sock,
              chat,

              "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖\n\n" +
              "Premi il pulsante qui sotto per vedere i comandi.",

              "/comandi",

              "/comandi"
            );

            return;
          }

          // ==================================
          // /COMANDI MANUALE
          // ==================================

          if (
            command === "/comandi"
          ) {

            await sendQuickReply(
              sock,
              chat,

              "🤖 COMANDI DISPONIBILI\n\n" +
              "Premi il pulsante qui sotto per eseguire il comando.",

              "/ping",

              "/ping"
            );

            return;
          }

          // ==================================
          // /PING MANUALE
          // ==================================

          if (
            command === "/ping"
          ) {

            await sock.sendMessage(
              chat,
              {
                text: "🏓 Pong!"
              }
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

    setTimeout(
      startWhatsApp,
      5000
    );
  }
}

module.exports = {
  startWhatsApp,
  getQR
};
