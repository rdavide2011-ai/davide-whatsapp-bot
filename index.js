const express = require("express");
const QRCode = require("qrcode");

const {
  startWhatsApp,
  getQR
} = require("./whatsapp");

const app = express();

const PORT = process.env.PORT || 8080;

// ==========================================
// PAGINA PRINCIPALE
// ==========================================

app.get("/", async (req, res) => {
  const qr = getQR();

  if (!qr) {
    return res.send(`
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>WhatsApp Bot</title>

<style>
body {
  margin: 0;
  background: #111;
  color: white;
  font-family: Arial, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  text-align: center;
}

.box {
  background: #1d1d1d;
  padding: 40px;
  border-radius: 20px;
  width: 90%;
  max-width: 500px;
}

h1 {
  margin-bottom: 10px;
}

.status {
  font-size: 20px;
  margin-top: 25px;
}

.loading {
  margin: 30px auto;
  width: 45px;
  height: 45px;
  border: 5px solid #333;
  border-top: 5px solid #25D366;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

p {
  color: #aaa;
}
</style>

<meta http-equiv="refresh" content="3">

</head>

<body>

<div class="box">

<h1>🤖 WhatsApp Bot</h1>

<div class="loading"></div>

<div class="status">
⏳ Generazione QR Code...
</div>

<p>
Attendi qualche secondo.
</p>

</div>

</body>
</html>
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

<title>Collega WhatsApp</title>

<style>

* {
  box-sizing: border-box;
}

body {

  margin: 0;

  min-height: 100vh;

  background:
    linear-gradient(
      135deg,
      #111 0%,
      #151515 100%
    );

  color: white;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  display: flex;

  justify-content: center;

  align-items: center;

  text-align: center;
}

.container {

  width: 90%;

  max-width: 520px;

  background: #1e1e1e;

  padding: 35px;

  border-radius: 24px;

  box-shadow:
    0 20px 60px
    rgba(0,0,0,0.5);
}

h1 {

  margin-top: 0;

  font-size: 30px;
}

.subtitle {

  color: #aaa;

  margin-bottom: 25px;
}

.qr {

  background: white;

  display: inline-block;

  padding: 15px;

  border-radius: 15px;
}

.qr img {

  display: block;

  width: 350px;

  max-width: 100%;

  height: auto;
}

.instructions {

  margin-top: 30px;

  text-align: left;

  background: #292929;

  padding: 20px;

  border-radius: 15px;

  line-height: 1.7;
}

.green {

  color: #25D366;

  font-weight: bold;
}

.warning {

  margin-top: 20px;

  color: #999;

  font-size: 14px;
}

</style>

<meta
http-equiv="refresh"
content="15"
>

</head>

<body>

<div class="container">

<h1>📱 Collega WhatsApp</h1>

<div class="subtitle">
Scansiona questo QR Code con il tuo iPhone
</div>

<div class="qr">

<img
src="${qrImage}"
alt="QR Code WhatsApp"
>

</div>

<div class="instructions">

<div class="green">
Sul tuo iPhone:
</div>

1. Apri <b>WhatsApp</b><br>

2. Vai su <b>Impostazioni</b><br>

3. Tocca <b>Dispositivi collegati</b><br>

4. Tocca <b>Collega un dispositivo</b><br>

5. Scansiona il QR Code qui sopra

</div>

<div class="warning">

⚠️ Il QR Code cambia automaticamente quando scade.

</div>

</div>

</body>

</html>
`);

  } catch (error) {

    console.error(
      "Errore generazione QR:",
      error
    );

    res.status(500).send(
      "Errore nella generazione del QR Code."
    );
  }
});

// ==========================================
// API STATO
// ==========================================

app.get("/status", (req, res) => {

  res.json({
    online: true,
    whatsappQR: !!getQR()
  });

});

// ==========================================
// SERVER
// ==========================================

app.listen(PORT, () => {

  console.log(
    `🌐 Server avviato sulla porta ${PORT}`
  );

});

// ==========================================
// AVVIO WHATSAPP
// ==========================================

startWhatsApp().catch((error) => {

  console.error(
    "❌ Errore avvio WhatsApp:"
  );

  console.error(error);

});
