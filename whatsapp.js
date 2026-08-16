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

function getQR() {
  return currentQR;
}

// ==========================================
// INVIA MESSAGGIO CON QUICK REPLY
// ==========================================

async function sendQuickReply(sock, jid, text, buttonText, buttonId) {
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
        proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: [
            {
              name: "quick_reply",

              buttonParamsJson: JSON.stringify({
                display_text: buttonText,
                id: buttonId
              })
            }
          ],

          messageParamsJson: ""
        })
    });

  const message =
    generateWAMessageFromContent(
      jid,

      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2
            },

            interactiveMessage:
              interactiveMessage
          }
        }
      },

      {
        userJid: jid
      }
    );

  await sock.relayMessage(
    jid,
    message.message,
    {
      messageId: message.key.id
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

    const { state, saveCreds } =
      await useMultiFileAuthState(AUTH_FOLDER);

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

    // ==========================================
    // CONNESSIONE
    // ==========================================

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

        // CHIUSO
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

          setTimeout(() => {
            startWhatsApp();
          }, 5000);
        }
      }
    );

    // ==========================================
    // MESSAGGI
    // ==========================================

    sock.ev.on(
      "messages.upsert",
      async ({ messages }) => {

        try {

          const message =
            messages[0];

          if (!message) return;

          if (!message.message)
            return;

          if (message.key.fromMe)
            return;

          const chat =
            message.key.remoteJid;

          // ======================================
          // QUICK REPLY
          // ======================================

          const interactiveResponse =
            message.message
              .interactiveResponseMessage;

          if (interactiveResponse) {

            try {

              const paramsJson =
                interactiveResponse
                  ?.nativeFlowResponseMessage
                  ?.paramsJson;

              if (!paramsJson)
                return;

              const params =
                JSON.parse(paramsJson);

              const buttonId =
                params.id;

              console.log(
                `🔘 Quick Reply ricevuto: ${buttonId}`
              );

              // ----------------------------------
              // /COMANDI
              // ----------------------------------

              if (
                buttonId === "/comandi"
              ) {

                await sendQuickReply(
                  sock,
                  chat,

                  "🤖 COMANDI DISPONIBILI\n\n" +
                  "🏓 /ping\n" +
                  "Controlla se il bot è online.",

                  "/ping",

                  "/ping"
                );

                console.log(
                  "📋 Comandi inviati."
                );

                return;
              }

              // ----------------------------------
              // /PING
              // ----------------------------------

              if (
                buttonId === "/ping"
              ) {

                await sock.sendMessage(
                  chat,
                  {
                    text: "🏓 Pong!"
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

              console.error(error);
            }

            return;
          }

          // ======================================
          // TESTO NORMALE
          // ======================================

          const text =
            message.message
              .conversation ||
            message.message
              .extendedTextMessage
              ?.text ||
            "";

          if (!text)
            return;

          const command =
            text.trim().toLowerCase();

          console.log(
            `📩 Messaggio ricevuto: ${text}`
          );

          // ======================================
          // CIAO
          // ======================================

          if (
            command === "ciao"
          ) {

            await sendQuickReply(
              sock,
              chat,

              "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖\n\n" +
              "Clicca il pulsante qui sotto per vedere i comandi.",

              "/comandi",

              "/comandi"
            );

            console.log(
              "📋 Pulsante /comandi inviato."
            );

            return;
          }

          // ======================================
          // /COMANDI SCRITTO MANUALMENTE
          // ======================================

          if (
            command === "/comandi"
          ) {

            await sendQuickReply(
              sock,
              chat,

              "🤖 COMANDI DISPONIBILI\n\n" +
              "🏓 /ping\n" +
              "Controlla se il bot è online.",

              "/ping",

              "/ping"
            );

            return;
          }

          // ======================================
          // /PING SCRITTO MANUALMENTE
          // ======================================

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

    setTimeout(() => {
      startWhatsApp();
    }, 5000);
  }
}

module.exports = {
  startWhatsApp,
  getQR
};
