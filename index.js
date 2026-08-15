const express = require("express");
const QRCode = require("qrcode");

const {
  startWhatsApp,
  getQR
} = require("./whatsapp");

const app = express();

const PORT = process.env.PORT || 8080;

let botEnabled = true;

// ==========================================
// PAGINA PRINCIPALE - PANNELLO BOT
// ==========================================

app.get("/", (req, res) => {

  res.send(`
<!DOCTYPE html>
<html lang="it">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

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

  box-shadow:
    0 20px 60px
    rgba(0,0,0,0.5);
}

h1 {

  margin-top: 0;

  margin-bottom: 35px;
}

.status {

  font-size: 28px;

  font-weight: bold;

  margin-bottom: 30px;
}

.active {

  color: #25D366;
}

.inactive {

  color: #ff4444;
}

button {

  width: 100%;

  border: none;

  border-radius: 14px;

  padding: 18px;

  font-size: 18px;

  font-weight: bold;

  cursor: pointer;

  color: white;

  background: #ff4444;
}

button.activate {

  background: #25D366;
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

<h1>
🤖 Davide WhatsApp Bot
</h1>

<div class="status ${botEnabled ? "active" : "inactive"}">

${botEnabled ? "🟢 ATTIVO" : "🔴 DISATTIVO"}

</div>

<form
  action="/toggle"
  method="POST"
>

<button
  class="${botEnabled ? "" : "activate"}"
>

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

});

// ==========================================
// QR CODE
// ==========================================

app.get("/qr", async (req, res) => {

  const qr = getQR();

  if (!qr) {

    return res.send(`
      <h1>✅ WhatsApp già collegato</h1>
    `);

  }

  try {

    const qrImage =
      await QRCode.toDataURL(qr, {
        width: 350,
        margin: 2
      });

    res.send(`
<!DOCTYPE html>

<html lang="it">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>WhatsApp QR</title>

<style>

body {

  margin: 0;

  min-height: 100vh;

  background: #111;

  color: white;

  font-family: Arial;

  display: flex;

  justify-content: center;

  align-items: center;

  text-align: center;
}

.box {

  background: #1d1d1d;

  padding: 30px;

  border-radius: 20px;
}

.qr {

  background: white;

  padding: 15px;

  border-radius: 15px;

}

.qr img {

  width: 350px;

  max-width: 100%;
}

</style>

</head>

<body>

<div class="box">

<h1>📱 Collega WhatsApp</h1>

<p>Scansiona il QR con il tuo iPhone.</p>

<div class="qr">

<img
  src="${qrImage}"
  alt="WhatsApp QR Code"
>

</div>

</div>

</body>

</html>
`);

  } catch (error) {

    console.error(error);

    res
      .status(500)
      .send("Errore generazione QR");

  }

});

// ==========================================
// ATTIVA / DISATTIVA
// ==========================================

app.use(
  express.urlencoded({
    extended: true
  })
);

app.post("/toggle", (req, res) => {

  botEnabled = !botEnabled;

  console.log(
    `🔘 BOT ${
      botEnabled
        ? "ATTIVATO"
        : "DISATTIVATO"
    }`
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

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🌐 Server avviato sulla porta ${PORT}`
    );

  }
);

// ==========================================
// WHATSAPP
// ==========================================

startWhatsApp().catch(
  (error) => {

    console.error(
      "❌ Errore avvio WhatsApp:"
    );

    console.error(error);

  }
);
