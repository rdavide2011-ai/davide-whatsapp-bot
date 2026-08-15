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

app.get("/", (req, res) => {
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
    <h2>📱 WhatsApp</h2>
    <p>Apri <b>/qr</b> per collegare WhatsApp.</p>
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
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp</title>
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
    <h1>✅ WhatsApp collegato</h1>
    <p>Non c'è nessun QR Code da scansionare.</p>
  </div>

</body>
</html>
    `);
  }

  try {

    const qrImage = await QRCode.toDataURL(qr, {
      width: 400,
      margin: 2
    });

    res.send(`
<!DOCTYPE html>
<html lang="it">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Collega WhatsApp</title>

  <meta http-equiv="refresh" content="10">

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

  <div style="
    background:#1d1d1d;
    padding:30px;
    border-radius:20px;
    max-width:500px;
    width:90%;
  ">

    <h1>📱 Collega WhatsApp</h1>

    <p>
      Sul tuo iPhone vai su:
    </p>

    <p>
      <b>WhatsApp → Impostazioni → Dispositivi collegati → Collega un dispositivo</b>
    </p>

    <div style="
      background:white;
      padding:15px;
      border-radius:15px;
      display:inline-block;
    ">

      <img
        src="${qrImage}"
        style="
          width:400px;
          max-width:100%;
          display:block;
        "
        alt="QR Code WhatsApp"
      >

    </div>

    <p style="color:#aaa;">
      La pagina si aggiorna automaticamente.
    </p>

  </div>

</body>
</html>
    `);

  } catch (error) {

    console.error("❌ Errore generazione QR:", error);

    res.status(500).send("Errore generazione QR Code");

  }
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
