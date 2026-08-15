const express = require("express");
const startWhatsApp = require("./whatsapp");

const app = express();

const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.send("🤖 Davide WhatsApp Bot - ONLINE");
});

app.get("/status", (req, res) => {
  res.json({
    status: "online",
    bot: "Davide WhatsApp Bot"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server avviato sulla porta ${PORT}`);
});

// AVVIA WHATSAPP
startWhatsApp().catch((error) => {
  console.error("❌ Errore avvio WhatsApp:");
  console.error(error);
});
