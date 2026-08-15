const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.status(200).send("🤖 Davide WhatsApp Bot ONLINE");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "online"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server avviato sulla porta ${PORT}`);
});

require("./whatsapp.js");
