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
    // CONNESSIONE WHATSAPP
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

      // QR CODE
      if (qr) {

        currentQR = qr;

        console.log(
          "📷 QR Code WhatsApp disponibile."
        );

        console.log(
          "🌐 Apri /qr per visualizzarlo."
        );
      }

      // CONNESSO
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

      // DISCONNESSO
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
          // RISPOSTA AL PULSANTE "VEDI COMANDI"
          // ======================================

          const buttonResponse =
            message.message.buttonsResponseMessage;

          if (buttonResponse) {

            const buttonId =
              buttonResponse.selectedButtonId;

            console.log(
              `🔘 Pulsante premuto: ${buttonId}`
            );

            if (
              buttonId === "vedi_comandi"
            ) {

              await sock.sendMessage(
                chat,
                {
                  title: "📋 Comandi disponibili",

                  text:
                    "Seleziona il comando che vuoi utilizzare.",

                  footer:
                    "Davide WhatsApp Bot",

                  buttonText:
                    "📋 Vedi comandi",

                  sections: [
                    {
                      title: "Comandi",

                      rows: [
                        {
                          title: "🏓 !ping",

                          description:
                            "Controlla se il bot è online.",

                          rowId: "ping"
                        }
                      ]
                    }
                  ]
                }
              );

              return;
            }

            return;
          }

          // ======================================
          // RISPOSTA ALLA LISTA
          // ======================================

          const listResponse =
            message.message.listResponseMessage;

          if (listResponse) {

            const selectedId =
              listResponse
                ?.singleSelectReply
                ?.selectedRowId;

            console.log(
              `📋 Comando selezionato: ${selectedId}`
            );

            if (
              selectedId === "ping"
            ) {

              await sock.sendMessage(
                chat,
                {
                  text: "🏓 Pong!"
                }
              );

            }

            return;
          }

          // ======================================
          // MESSAGGIO NORMALE
          // ======================================

          const text =
            message.message.conversation ||
            message.message.extendedTextMessage?.text ||
            "";

          if (!text) return;

          console.log(
            `📩 Messaggio ricevuto: ${text}`
          );

          // ======================================
          // CIAO
          // ======================================

          if (
            text.trim().toLowerCase() === "ciao"
          ) {

            await sock.sendMessage(
              chat,
              {
                text:
                  "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖",

                footer:
                  "Davide WhatsApp Bot",

                templateButtons: [
                  {
                    index: 1,

                    quickReplyButton: {
                      displayText:
                        "📋 Vedi comandi",

                      id:
                        "vedi_comandi"
                    }
                  }
                ]
              }
            );

            return;
          }

          // ======================================
          // !PING SCRITTO MANUALMENTE
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
