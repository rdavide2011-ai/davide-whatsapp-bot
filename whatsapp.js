const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const fs = require("fs");

const AUTH_DIR = "./auth_info";

async function startWhatsApp() {
  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, {
        recursive: true
      });
    }

    const { state, saveCreds } =
      await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      markOnlineOnConnect: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const {
        connection,
        lastDisconnect
      } = update;

      if (connection === "connecting") {
        console.log("🔄 Connessione a WhatsApp...");
      }

      if (
        !state.creds.registered &&
        connection === "connecting"
      ) {
        const phoneNumber =
          process.env.WHATSAPP_NUMBER;

        if (!phoneNumber) {
          console.log(
            "❌ ERRORE: manca WHATSAPP_NUMBER nelle variabili Railway."
          );
          return;
        }

        try {
          const code =
            await sock.requestPairingCode(
              phoneNumber.replace(/\D/g, "")
            );

          console.log("");
          console.log(
            "======================================"
          );
          console.log(
            "       🔐 CODICE WHATSAPP"
          );
          console.log(
            "======================================"
          );
          console.log("");
          console.log(`       ${code}`);
          console.log("");
          console.log(
            "======================================"
          );
          console.log(
            "WhatsApp → Impostazioni"
          );
          console.log(
            "→ Dispositivi collegati"
          );
          console.log(
            "→ Collega un dispositivo"
          );
          console.log(
            "→ Collega con numero di telefono"
          );
          console.log(
            "======================================"
          );
          console.log("");
        } catch (error) {
          console.error(
            "❌ Errore generazione codice:"
          );
          console.error(error);
        }
      }

      if (connection === "open") {
        console.log("");
        console.log(
          "======================================"
        );
        console.log(
          "       ✅ WHATSAPP COLLEGATO"
        );
        console.log(
          "======================================"
        );
        console.log("");
        console.log(
          "🤖 Bot online e funzionante."
        );
        console.log("");
      }

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output
            ?.statusCode;

        console.log(
          "❌ Connessione chiusa:",
          statusCode
        );

        if (
          statusCode !==
          DisconnectReason.loggedOut
        ) {
          console.log(
            "🔄 Riconnessione tra 5 secondi..."
          );

          setTimeout(() => {
            startWhatsApp();
          }, 5000);
        } else {
          console.log(
            "❌ WhatsApp ha effettuato il logout."
          );
        }
      }
    });

    sock.ev.on(
      "messages.upsert",
      async ({ messages }) => {
        try {
          const message = messages[0];

          if (!message) return;
          if (!message.message) return;
          if (message.key.fromMe) return;

          const text =
            message.message.conversation ||
            message.message.extendedTextMessage
              ?.text ||
            "";

          if (!text) return;

          console.log(
            `📩 Messaggio ricevuto: ${text}`
          );

          const chat =
            message.key.remoteJid;

          if (
            text.trim().toLowerCase() ===
            "ciao"
          ) {
            await sock.sendMessage(chat, {
              text:
                "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖"
            });
          }

          if (
            text.trim().toLowerCase() ===
            "!ping"
          ) {
            await sock.sendMessage(chat, {
              text: "🏓 Pong!"
            });
          }

          if (
            text.trim().toLowerCase() ===
            "!info"
          ) {
            await sock.sendMessage(chat, {
              text:
                "🤖 Davide WhatsApp Bot\n\n" +
                "✅ Bot online\n" +
                "✅ WhatsApp collegato"
            });
          }
        } catch (error) {
          console.error(
            "❌ Errore messaggio:",
            error
          );
        }
      }
    );

  } catch (error) {
    console.error(
      "❌ Errore avvio WhatsApp:"
    );
    console.error(error);

    setTimeout(() => {
      startWhatsApp();
    }, 5000);
  }
}

console.log(
  "🤖 Avvio Davide WhatsApp Bot..."
);

startWhatsApp();
