const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const readline = require("readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

async function start() {

    console.log("🔄 Avvio del collegamento WhatsApp...");

    const { state, saveCreds } =
        await useMultiFileAuthState("whatsapp_auth");

    const { version } = await fetchLatestBaileysVersion();

    console.log(
        `🌐 Versione WhatsApp Web utilizzata: ${version.join(".")}`
    );

    const sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        browser: ["Chrome", "Windows", "10"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {

        const {
            connection,
            lastDisconnect
        } = update;

        if (connection === "open") {

            console.log("");
            console.log("================================");
            console.log("🤖 WHATSAPP COLLEGATO!");
            console.log("================================");
            console.log("");

            rl.close();

            return;
        }

        if (connection === "close") {

            const statusCode =
                lastDisconnect?.error?.output?.statusCode;

            console.log("");
            console.log("❌ Connessione chiusa.");

            if (statusCode === DisconnectReason.loggedOut) {

                console.log("🚪 WhatsApp ha scollegato il dispositivo.");

                return;
            }

            console.log("❌ Codice errore:", statusCode);
            console.log("");
            console.log(
                "Il collegamento non è riuscito."
            );

        }
    });

    if (!state.creds.registered) {

        await new Promise(resolve => setTimeout(resolve, 2000));

        const phoneNumber = await ask(
            "\n📱 Inserisci il numero WhatsApp con prefisso internazionale (es. 393331234567): "
        );

        const cleanNumber = phoneNumber.replace(/\D/g, "");

        console.log("");
        console.log("⏳ Richiedo il codice di associazione...");

        try {

            const code =
                await sock.requestPairingCode(cleanNumber);

            console.log("");
            console.log("================================");
            console.log("🔐 CODICE DI ASSOCIAZIONE");
            console.log("================================");
            console.log("");
            console.log(code);
            console.log("");
            console.log("================================");
            console.log("");
            console.log("📱 Sul telefono:");
            console.log("");
            console.log("WhatsApp");
            console.log("→ Impostazioni");
            console.log("→ Dispositivi collegati");
            console.log("→ Collega un dispositivo");
            console.log("→ Collega con numero di telefono");
            console.log("");
            console.log("Inserisci il codice mostrato sopra.");
            console.log("");

        } catch (error) {

            console.error("");
            console.error("❌ ERRORE PAIRING:");
            console.error(error);
        }
    }
}

start();