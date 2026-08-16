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
    // CONNESSIONE
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

          // ======================================
          // RISPOSTA AL PULSANTE
          // ======================================

          const interactiveResponse =
            message.message.interactiveResponseMessage;

          if (interactiveResponse) {

            try {

              const params =
                JSON.parse(
                  interactiveResponse
                    ?.nativeFlowResponseMessage
                    ?.paramsJson || "{}"
                );

              const buttonId =
                params.id;

              console.log(
                `🔘 Pulsante premuto: ${buttonId}`
              );

              if (
                buttonId === "vedi_comandi"
              ) {

                await sock.sendMessage(
                  chat,
                  {
                    text:
                      "🏓 !ping\n\n" +
                      "Controlla se il bot è online."
                  }
                );

                return;
              }

            } catch (error) {

              console.error(
                "❌ Errore risposta pulsante:"
              );

              console.error(error);
            }

            return;
          }

          // ======================================
          // CIAO
          // ======================================

          const text =
            message.message.conversation ||
            message.message.extendedTextMessage?.text ||
            "";

          if (!text) return;

          console.log(
            `📩 Messaggio ricevuto: ${text}`
          );

          if (
            text.trim().toLowerCase() === "ciao"
          ) {

            console.log(
              "🔘 Invio pulsante Vedi comandi..."
            );

            await sock.sendMessage(
              chat,
              {
                text: "Ciao! 👋",

                footer:
                  "Davide WhatsApp Bot",

                buttons: [
                  {
                    name: "quick_reply",

                    buttonParamsJson:
                      JSON.stringify({
                        display_text:
                          "📋 Vedi comandi",

                        id:
                          "vedi_comandi"
                      })
                  }
                ]
              }
            );

            console.log(
              "✅ Messaggio con pulsante inviato."
            );

            return;
          }

          // ======================================
          // !PING
          // ======================================

          if (
            text.trim().toLowerCase() === "!ping"
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
