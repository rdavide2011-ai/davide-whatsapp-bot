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
// BIZ NODE PER I NATIVE FLOW
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
  console.log(
    `🔘 Preparazione pulsante: ${buttonId}`
  );

  // ------------------------------------------
  // PULSANTE
  // ------------------------------------------

  const nativeFlowButton =
    proto.Message
      .InteractiveMessage
      .NativeFlowMessage
      .NativeFlowButton
      .create({
        name: "quick_reply",

        buttonParamsJson:
          JSON.stringify({
            display_text: buttonText,
            id: buttonId
          })
      });

  // ------------------------------------------
  // MESSAGGIO INTERATTIVO
  // ------------------------------------------

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

  // ------------------------------------------
  // CREA MESSAGGIO WHATSAPP
  // ------------------------------------------

  const waMessage =
    generateWAMessageFromContent(
      jid,

      {
        interactiveMessage:
          interactiveMessage
      },

      {
        // IMPORTANTE:
        // deve essere il BOT, non il destinatario
        userJid:
          sock.user.id
      }
    );

  // ------------------------------------------
  // NODI NECESSARI A WHATSAPP
  // ------------------------------------------

  const bizNode =
    buildMixedNativeFlowBizNode();

  const botNode = {
    tag: "bot",

    attrs: {
      biz_bot: "1"
    }
  };

  let additionalNodes;

  if (isJidGroup(jid)) {

    additionalNodes = [
      bizNode
    ];

  } else {

    additionalNodes = [
      botNode,
      bizNode
    ];
  }

  // ------------------------------------------
  // INVIO
  // ------------------------------------------

  await sock.relayMessage(
    jid,

    waMessage.message,

    {
      messageId:
        waMessage.key.id,

      additionalNodes:
        additionalNodes
    }
  );

  console.log(
    `✅ Quick Reply inviato: ${buttonId}`
  );
}

// ==========================================
// AVVIO WHATSAPP
// ==========================================

async function startWhatsApp() {

  if (starting)
    return;

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
          false
      });

    // ========================================
    // SALVA CREDENZIALI
    // ========================================

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

        // QR
        if (qr) {

          currentQR = qr;

          console.log(
            "📷 QR Code WhatsApp disponibile."
          );

          console.log(
            "🌐 Apri /qr per visualizzarlo."
          );
        }

        // COLLEGATO
        if (
          connection === "open"
        ) {

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

        // CHIUSO
        if (
          connection === "close"
        ) {

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
            () => {
              startWhatsApp();
            },
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

          const message =
            messages[0];

          if (!message)
            return;

          if (!message.message)
            return;

          if (message.key.fromMe)
            return;

          const chat =
            message.key.remoteJid;

          // ==================================
          // QUICK REPLY
          // ==================================

          const interactiveResponse =
            message
              .message
              .interactiveResponseMessage;

          if (
            interactiveResponse
          ) {

            try {

              const paramsJson =
                interactiveResponse
                  ?.nativeFlowResponseMessage
                  ?.paramsJson;

              if (!paramsJson)
                return;

              const params =
                JSON.parse(
                  paramsJson
                );

              const buttonId =
                params.id;

              console.log(
                `🔘 Quick Reply ricevuto: ${buttonId}`
              );

              // ------------------------------
              // /COMANDI
              // ------------------------------

              if (
                buttonId === "/comandi"
              ) {

                await sendQuickReply(
                  sock,
                  chat,

                  "🤖 COMANDI DISPONIBILI\n\n" +
                  "Premi il pulsante qui sotto per eseguire il comando.",

                  "🏓 /ping",

                  "/ping"
                );

                return;
              }

              // ------------------------------
              // /PING
              // ------------------------------

              if (
                buttonId === "/ping"
              ) {

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
                "❌ Errore Quick Reply:"
              );

              console.error(
                error
              );
            }

            return;
          }

          // ==================================
          // TESTO NORMALE
          // ==================================

          const text =
            message
              .message
              .conversation ||

            message
              .message
              .extendedTextMessage
              ?.text ||

            "";

          if (!text)
            return;

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

              "📋 /comandi",

              "/comandi"
            );

            return;
          }

          // ==================================
          // /COMANDI SCRITTO A MANO
          // ==================================

          if (
            command === "/comandi"
          ) {

            await sendQuickReply(
              sock,
              chat,

              "🤖 COMANDI DISPONIBILI\n\n" +
              "Premi il pulsante qui sotto per eseguire il comando.",

              "🏓 /ping",

              "/ping"
            );

            return;
          }

          // ==================================
          // /PING SCRITTO A MANO
          // ==================================

          if (
            command === "/ping"
          ) {

            await sock.sendMessage(
              chat,
              {
                text:
                  "🏓 Pong!"
              }
            );

            return;
          }

        } catch (error) {

          console.error(
            "❌ Errore gestione messaggio:"
          );

          console.error(
            error
          );
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

    setTimeout(
      () => {
        startWhatsApp();
      },
      5000
    );
  }
}

// ==========================================
// EXPORT
// ==========================================

module.exports = {
  startWhatsApp,
  getQR
};
