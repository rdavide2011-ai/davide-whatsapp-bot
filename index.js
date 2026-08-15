const express = require("express");

const app = express();
const PORT = 3000;

app.use(express.json());

app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>Davide Bot</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            font-family: Arial, sans-serif;
            background: #111;
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }

        .chat {
            width: 400px;
            max-width: 90%;
            background: #222;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }

        .header {
            padding: 20px;
            background: #333;
            font-size: 20px;
            font-weight: bold;
        }

        #messages {
            height: 400px;
            overflow-y: auto;
            padding: 15px;
        }

        .message {
            padding: 10px 14px;
            margin: 8px 0;
            border-radius: 10px;
            max-width: 80%;
            word-wrap: break-word;
        }

        .user {
            background: #444;
            margin-left: auto;
        }

        .bot {
            background: #075e54;
            margin-right: auto;
        }

        .input-area {
            display: flex;
            padding: 10px;
            background: #333;
        }

        input {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 8px;
            outline: none;
            font-size: 15px;
        }

        button {
            margin-left: 8px;
            padding: 12px 18px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
        }

        button:hover {
            opacity: 0.85;
        }
    </style>
</head>

<body>

    <div class="chat">

        <div class="header">
            🤖 Davide Bot
        </div>

        <div id="messages">

            <div class="message bot">
                👋 Ciao! Sono il tuo primo bot.
            </div>

        </div>

        <div class="input-area">

            <input
                id="input"
                type="text"
                placeholder="Scrivi un messaggio..."
                autocomplete="off"
            >

            <button id="sendButton">
                Invia
            </button>

        </div>

    </div>

    <script>

        const input = document.getElementById("input");
        const sendButton = document.getElementById("sendButton");
        const messages = document.getElementById("messages");

        async function sendMessage() {

            const text = input.value.trim();

            if (!text) {
                return;
            }

            // Messaggio dell'utente
            const userMessage = document.createElement("div");

            userMessage.className = "message user";

            userMessage.textContent = text;

            messages.appendChild(userMessage);

            input.value = "";

            messages.scrollTop = messages.scrollHeight;

            try {

                const response = await fetch("/message", {

                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        message: text
                    })

                });

                const data = await response.json();

                // Risposta del bot
                const botMessage = document.createElement("div");

                botMessage.className = "message bot";

                botMessage.textContent = data.reply;

                messages.appendChild(botMessage);

                messages.scrollTop = messages.scrollHeight;

            } catch (error) {

                console.error(error);

                const errorMessage = document.createElement("div");

                errorMessage.className = "message bot";

                errorMessage.textContent =
                    "❌ Non riesco a contattare il server.";

                messages.appendChild(errorMessage);
            }
        }

        // Click sul pulsante
        sendButton.addEventListener("click", sendMessage);

        // Invio con Enter
        input.addEventListener("keydown", function(event) {

            if (event.key === "Enter") {

                sendMessage();

            }

        });

    </script>

</body>
</html>
    `);
});


app.post("/message", (req, res) => {

    const message = req.body.message.toLowerCase().trim();

    let reply;


    if (message === "ciao") {

        reply = "👋 Ciao! Come stai?";

    }

    else if (message === "come stai") {

        reply = "🤖 Sto benissimo! Sono online e funzionante.";

    }

    else if (message === "1") {

        reply = "📦 Hai scelto Prodotti.";

    }

    else if (message === "2") {

        reply = "📞 Hai scelto Contatti.";

    }

    else if (message === "3") {

        reply = "🟢 BOT ONLINE!";

    }

    else {

        reply = "🤔 Non ho ancora imparato questa risposta.";

    }


    console.log("📩 Messaggio:", req.body.message);

    console.log("🤖 Risposta:", reply);


    res.json({
        reply: reply
    });

});


app.listen(PORT, () => {

    console.log(`🤖 Bot avviato su http://localhost:${PORT}`);

});