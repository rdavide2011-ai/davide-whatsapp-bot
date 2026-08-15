const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");

const AUTH_DIR = "./auth_info";

let reconnectTimer = null;
let pairingRequested = false;

async function startWhatsApp() {
  try {
    const { state, saveCreds } =
      await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
      auth: state,
      browser: Browsers.ubuntu("Davide WhatsApp Bot"),
      printQRInTerminal: false,
      markOnlineOnConnect: false
    });

    sock.ev.on("creds.update", saveCreds);

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

      /*
       * =====================================
       * PAIRING CODE
       * =====================================
       */

      if (
        !state.creds.registered &&
        !pairingRequested &&
        (connection === "connecting" || qr)
      ) {
        pairingRequested = true;

        console.log(
          "⏳ Connessione iniziale rilevata."
        );

        // Aspettiamo che il socket sia realmente pronto.
        await new Promise(resolve =>
          setTimeout(resolve, 5000)
        );

        const phoneNumber =
          process.env.WHATSAPP_NUMBER;

        if (!phoneNumber) {
          console.error(
            "❌ WHATSAPP_NUMBER non configurato."
          );
          return;
        }

        try {
          const cleanNumber =
            phoneNumber.replace(/\D/g, "");

          console.log(
            "📱 Richiedo il codice WhatsApp..."
          );

          const code =
            await sock.requestPairingCode(
              cleanNumber
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
          console.log(
            "       " + code
          );
          console.log("");
          console.log(
            "======================================"
          );
          console.log(
            "Sul telefono:"
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
            "❌ Errore pairing code:"
          );
          console.error(error);

          pairingRequested = false;
        }
      }

      /*
       * =====================================
       * CONNESSO
       * =====================================
       */

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
        console.log(
          "🤖 Bot online!"
        );
        console.log("");

        pairingRequested = true;
      }

      /*
       * =====================================
       * DISCONNESSO
       * =====================================
       */

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        console.log(
          "❌ Connessione chiusa:",
          statusCode
        );

        if (
          statusCode === DisconnectReason.loggedOut
        ) {
          console.log(
            "❌ Sessione WhatsApp terminata."
          );
          return;
        }

        if (reconnectTimer) {
          return;
        }

        console.log(
          "🔄 Riconnessione tra 5 secondi..."
        );

        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          pairingRequested = false;
          startWhatsApp();
        }, 5000);
      }
    });

    /*
     * =====================================
     * MESSAGGI
     * =====================================
     */

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
            message.message.extendedTextMessage?.text ||
            "";

          if (!text) return;

          console.log(
            "📩 Messaggio:",
            text
          );

          const chat =
            message.key.remoteJid;

          /*
           * CIAO
           */

          if (
            text.trim().toLowerCase() === "ciao"
          ) {
            await sock.sendMessage(chat, {
              text:
                "Ciao! 👋 Sono il bot WhatsApp di Davide 🤖"
            });
          }

          /*
           * PING
           */

          if (
            text.trim().toLowerCase() === "!ping"
          ) {
            await sock.sendMessage(chat, {
              text: "🏓 Pong!"
            });
          }

          /*
           * INFO
           */

          if (
            text.trim().toLowerCase() === "!info"
          ) {
            await sock.sendMessage(chat, {
              text:
                "🤖 Davide WhatsApp Bot\n\n" +
                "✅ Online\n" +
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

console.log("");
console.log(
  "======================================"
);
console.log(
  "      🤖 DAVIDE WHATSAPP BOT"
);
console.log(
  "======================================"
);
console.log("");

startWhatsApp();
