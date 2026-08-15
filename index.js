const express = require("express");
const QRCode = require("qrcode");

const {
  startWhatsApp,
  getQR
} = require("./whatsapp");

const app = express();

const PORT = process.env.PORT || 8080;

// Stato del bot
let botEnabled = true;

// ==========================================
// PAGINA PRINCIPALE
// ==========================================

app.get("/", async (req, res) => {
  const qr = getQR();

  // Se non c'è QR, mostra il pannello
  if (!qr) {
    return res.send(`
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Davide WhatsApp Bot</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: #111;
  color: white;
  font-family: Arial, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
}

.container {
  width: 90%;
  max-width: 500px;
  background: #1d1d1d;
  padding: 35px;
  border-radius: 24px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}

h1 {
  margin-top: 0;
}

.status {
  font-size: 25px;
  font-weight: bold;
  margin: 30px 0;
}

.active {
  color: #25D366;
}

.inactive {
  color: #ff4444;
}

button {
  border: none;
  border-radius: 14px;
  padding: 16px 35px;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  color: white;
  background: #25D366;
}

button.off {
  background: #ff4444;
}

button:active {
  transform: scale(0.97);
}

.info {
  margin-top: 25px;
  color: #888;
  font-size: 14px;
}
</style>
</head>

<body>

<div class="container">

<h1>🤖 Davide WhatsApp Bot</h1>

<div class="status ${botEnabled ? "active" : "inactive"}">
  ${botEnabled ? "🟢 ATTIVO" : "🔴 DISATTIVO"}
</div>

<form action="/toggle" method="POST">

<button class="${botEnabled ? "off" : ""}">
  ${botEnabled ? "DISATTIVA BOT" : "ATTIVA BOT"}
</button>

</form>

<div class="info">
  WhatsApp rimane collegato anche quando il bot è disattivato.
</div>

</div>

</body>
</html>
`);
  }

  // Se compare un QR, mostra il QR
  try {
    const qrImage = await QRCode.toDataURL(qr, {
      width: 350,
      margin: 2
    });

    res.send(`
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Collega WhatsApp</title>

<style>
body {
  margin: 0;
  min-height: 100vh;
  background: #111;
  color: white;
  font-family: Arial, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.container {
  width: 90%;
  max-width: 500px;
  background: #1d1d1d;
  padding: 35px;
  border-radius: 24px;
}

.qr {
  background: white;
  padding: 15px;
  border-radius: 15px;
  display: inline-block;
}

.qr img {
  width: 350px;
  max-width: 100%;
}

p {
  color: #aaa;
}
</style>

<meta http-equiv="refresh" content="10">

</head>

<body>

<div class="container">

<h1>📱 Collega WhatsApp</h1>

<p>Scansiona questo QR Code con il tuo iPhone.</p>

<div class="qr">
<img src="${qrImage}" alt="WhatsApp QR Code">
</div>

</div>

</body>
</html>
`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Errore QR Code");
  }
});

// ==========================================
// ATTIVA / DISATTIVA
// ==========================================

app.post("/toggle", express.urlencoded({ extended: true }), (req, res) => {
  botEnabled = !botEnabled;

  console.log(
    `🔘 Bot ${botEnabled ? "ATTIVATO" : "DISATTIVATO"}`
  );

  res.redirect("/");
});

// ==========================================
// STATO
// ==========================================

app.get("/status", (req, res) => {
  res.json({
    botEnabled
  });
});

// ==========================================
// SERVER
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `🌐 Server avviato sulla porta ${PORT}`
  );
});

// ==========================================
// WHATSAPP
// ==========================================

startWhatsApp().catch((error) => {
  console.error(
    "❌ Errore avvio WhatsApp:"
  );

  console.error(error);
});
