const express = require("express");

const {
  startWhatsApp,
  getQR
} = require("./whatsapp");

const app = express();

const PORT = process.env.PORT || 8080;

// ==========================================
// PAGINA PRINCIPALE
// ==========================================

app.get("/", (req, res) => {
  const qr = getQR();

  if (qr) {
    res.send(`
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Davide WhatsApp Bot</title>
</head>

<body style="
  margin:0;
  background:#111;
  color:white;
  font-family:Arial,sans-serif;
  display:flex;
  justify-content:center;
  align-items:center;
  min-height:100vh;
  text-align:center;
">

  <div>
    <h1>🤖 Davide WhatsApp Bot</h1>
    <p>📱 WhatsApp in attesa del collegamento.</p>
    <p>Apri <b>/qr</b> per vedere il QR Code.</p>
  </div>

</body>
</html>
    `);

    return;
  }

  res.send(`
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Davide WhatsApp Bot</title>
</head>

<body style="
  margin:0;
  background:#111;
  color:white;
  font-family:Arial,sans-serif;
  display:flex;
  justify-content:center;
  align-items:center;
  min-height:100vh;
  text-align:center;
">

  <div>
    <h1>🤖 Davide WhatsApp Bot</h1>
    <h2>🟢 ONLINE</h2>
    <p>WhatsApp collegato.</p>
  </div>

</body>
</html>
  `);
});

// ==========================================
// STATO
// ==========================================

app.get("/status", (req, res) => {
  res.json({
    online: true,
    qrAvailable: !!getQR()
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
