const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  proto,
  generateWAMessageFromContent
} = require("@whiskeysockets/baileys");

const P = require("pino");
const { createClient } = require("@supabase/supabase-js");

const AUTH_FOLDER = "./auth_info";

// ======================================================
// VERSIONE BOT
// ======================================================

const BOT_VERSION = "1.0.6";

// ======================================================
// SUPABASE
// ======================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

let supabase = null;

if (SUPABASE_URL && SUPABASE_SECRET_KEY) {
  supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  console.log("✅ Supabase configurato correttamente.");
} else {
  console.error("❌ ERRORE: variabili Supabase mancanti.");
  console.error(
    "Controlla SUPABASE_URL e SUPABASE_SECRET_KEY su Railway."
  );
}

// ======================================================
// STATO BOT
// ======================================================

let currentQR = null;
let starting = false;
let whatsappConnected = false;

let botStartTime = Date.now();

let messagesReceived = 0;
let messagesSent = 0;
let commandsExecuted = 0;

// ======================================================
// MESSAGGI INVIATI DAL BOT
// ======================================================

const botSentMessageIds = new Set();

function rememberBotMessage(messageId) {
  if (!messageId) return;

  botSentMessageIds.add(messageId);

  if (botSentMessageIds.size > 500) {
    const firstId = botSentMessageIds.values().next().value;
    botSentMessageIds.delete(firstId);
  }
}

function isBotMessage(messageId) {
  if (!messageId) return false;

  const result = botSentMessageIds.has(messageId);

  if (result) {
    botSentMessageIds.delete(messageId);
  }

  return result;
}

// ======================================================
// PAUSA DAVIDE
// ======================================================

const DAVIDE_PAUSE_MS = 5 * 60 * 60 * 1000;

// ======================================================
// QR
// ======================================================

function getQR() {
  return currentQR;
}

// ======================================================
// CHAT PRIVATE
// ======================================================

function isPrivateChat(jid) {
  if (!jid) {
    return false;
  }

  // Gruppi
  if (jid.endsWith("@g.us")) {
    return false;
  }

  // Broadcast
  if (jid.endsWith("@broadcast")) {
    return false;
  }

  // Community / newsletter
  if (jid.endsWith("@newsletter")) {
    return false;
  }

  // Chat private
  if (jid.endsWith("@s.whatsapp.net")) {
    return true;
  }

  // Chat private LID
  if (jid.endsWith("@lid")) {
    return true;
  }

  return false;
}

// ======================================================
// LEGGI STATO CHAT
// ======================================================

async function getChatState(chatId) {
  if (!supabase) {
    return null;
  }

  try {
    const {
      data,
      error
    } = await supabase
      .from("chat_states")
      .select(
        "chat_id, mode, paused_until, updated_at"
      )
      .eq("chat_id", chatId)
      .maybeSingle();

    if (error) {
      console.error(
        "❌ Errore lettura stato chat da Supabase:",
        error.message
      );

      return null;
    }

    return data || null;
  } catch (error) {
    console.error(
      "❌ Errore Supabase getChatState:",
      error.message
    );

    return null;
  }
}

// ======================================================
// SALVA STATO CHAT
// ======================================================

async function saveChatState(
  chatId,
  mode = "normal",
  pausedUntil = null
) {
  if (!supabase) {
    return false;
  }

  try {
    const {
      error
    } = await supabase
      .from("chat_states")
      .upsert(
        {
          chat_id: chatId,
          mode: mode,
          paused_until: pausedUntil,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "chat_id"
        }
      );

    if (error) {
      console.error(
        "❌ Errore salvataggio stato chat:",
        error.message
      );

      return false;
    }

    console.log(
      "💾 Stato chat salvato:",
      chatId,
      "→",
      mode,
      "| pausa:",
      pausedUntil || "nessuna"
    );

    return true;
  } catch (error) {
    console.error(
      "❌ Errore Supabase saveChatState:",
      error.message
    );

    return false;
  }
}

// ======================================================
// UPTIME
// ======================================================

function getUptime() {
  const seconds = Math.floor(
    (Date.now() - botStartTime) / 1000
  );

  const days = Math.floor(seconds / 86400);

  const hours = Math.floor(
    (seconds % 86400) / 3600
  );

  const minutes = Math.floor(
    (seconds % 3600) / 60
  );

  const secs = seconds % 60;

  const parts = [];

  if (days > 0) {
    parts.push(
      `${days} ${
        days === 1 ? "giorno" : "giorni"
      }`
    );
  }

  if (hours > 0) {
    parts.push(
      `${hours} ${
        hours === 1 ? "ora" : "ore"
      }`
    );
  }

  if (minutes > 0) {
    parts.push(
      `${minutes} ${
        minutes === 1 ? "minuto" : "minuti"
      }`
    );
  }

  if (
    secs > 0 ||
    parts.length === 0
  ) {
    parts.push(
      `${secs} ${
        secs === 1 ? "secondo" : "secondi"
      }`
    );
  }

  return parts.join(", ");
}

// ======================================================
// TESTO MESSAGGIO
// ======================================================

function getMessageText(message) {
  if (!message) {
    return "";
  }

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ""
  );
}

// ======================================================
// ID PULSANTE
// ======================================================

function getButtonId(message) {
  if (!message) {
    return "";
  }

  const response =
    message.interactiveResponseMessage;

  if (
    response
      ?.nativeFlowResponseMessage
      ?.paramsJson
  ) {
    try {
      const params = JSON.parse(
        response
          .nativeFlowResponseMessage
          .paramsJson
      );

      return (
        params.id ||
        params.selected_id ||
        ""
      );
    } catch (error) {
      console.log(
        "⚠️ Errore lettura risposta pulsante:",
        error.message
      );
    }
  }

  return (
    message
      .buttonsResponseMessage
      ?.selectedButtonId ||
    message
      .templateButtonReplyMessage
      ?.selectedId ||
    ""
  );
}

// ======================================================
// TIMESTAMP PRIVACY
// ======================================================

function getPrivacyModeTs() {
  const offset = 77980457;

  return (
    Math.floor(Date.now() / 1000) -
    offset
  ).toString();
}

// ======================================================
// BIZ NODE
// ======================================================

function buildMixedNativeFlowBizNode() {
  return {
    tag: "biz",

    attrs: {
      actual_actors: "2",
      host_storage: "2",
      privacy_mode_ts:
        getPrivacyModeTs()
    },

    content: [
      {
        tag: "interactive",

        attrs: {
          type: "native_flow",
          v: "1"
        },

        content: [
          {
            tag: "native_flow",

            attrs: {
              v: "9",
              name: "mixed"
            }
          }
        ]
      },

      {
        tag: "quality_control",

        attrs: {
          source_type: "third_party"
        }
      }
    ]
  };
}

// ======================================================
// CREA PULSANTE
// ======================================================

function createQuickReplyButton(
  displayText,
  id
) {
  return {
    name: "quick_reply",

    buttonParamsJson:
      JSON.stringify({
        display_text: displayText,
        id: id
      })
  };
}

// ======================================================
// INVIO MESSAGGIO TRACCIATO
// ======================================================

async function sendTrackedMessage(
  sock,
  jid,
  content
) {
  const sent = await sock.sendMessage(
    jid,
    content
  );

  if (sent?.key?.id) {
    rememberBotMessage(
      sent.key.id
    );
  }

  messagesSent++;

  return sent;
}

// ======================================================
// INVIA SCELTA DAVIDE / AI
// ======================================================

async function sendModeSelection(
  sock,
  jid
) {
  console.log(
    "📤 Invio scelta Assistente AI / Davide..."
  );

  const buttons = [
    createQuickReplyButton(
      "🤖 Assistente AI",
      "mode_ai"
    ),

    createQuickReplyButton(
      "👤 Parla con Davide",
      "mode_davide"
    )
  ];

  const interactiveMessage =
    proto.Message.InteractiveMessage.create({

      header:
        proto.Message
          .InteractiveMessage
          .Header
          .create({
            hasMediaAttachment: false
          }),

      body:
        proto.Message
          .InteractiveMessage
          .Body
          .create({

            text:
              "Ciao! 👋 Sono l'assistente di Davide 🤖\n\n" +
              "Scegli come vuoi continuare:"
          }),

      footer:
        proto.Message
          .InteractiveMessage
          .Footer
          .create({

            text:
              "Davide WhatsApp Bot"
          }),

      nativeFlowMessage:
        proto.Message
          .InteractiveMessage
          .NativeFlowMessage
          .create({

            buttons:
              buttons.map(
                (button) =>
                  proto.Message
                    .InteractiveMessage
                    .NativeFlowMessage
                    .NativeFlowButton
                    .create({

                      name:
                        button.name,

                      buttonParamsJson:
                        button.buttonParamsJson
                    })
              ),

            messageParamsJson:
              "{}",

            messageVersion:
              1
          })
    });

  const waMessage =
    generateWAMessageFromContent(
      jid,

      {
        interactiveMessage
      },

      {
        userJid:
          sock.user?.id
      }
    );

  const bizNode =
    buildMixedNativeFlowBizNode();

  const botNode = {
    tag: "bot",

    attrs: {
      biz_bot: "1"
    }
  };

  await sock.relayMessage(
    jid,
    waMessage.message,
    {
      messageId:
        waMessage.key.id,

      additionalNodes: [
        botNode,
        bizNode
      ]
    }
  );

  rememberBotMessage(
    waMessage.key.id
  );

  messagesSent++;

  console.log(
    "✅ Scelta Assistente AI / Davide inviata."
  );
}

// ======================================================
// BENVENUTO
// ======================================================

async function sendWelcomeWithButton(
  sock,
  jid
) {
  await sendModeSelection(
    sock,
    jid
  );
}

// ======================================================
// PAGINA COMANDI
// ======================================================

async function sendCommandsWithButtons(
  sock,
  jid
) {
  console.log(
    "📤 Invio pagina comandi..."
  );

  const buttons = [

    createQuickReplyButton(
      "/stato",
      "/stato"
    ),

    createQuickReplyButton(
      "/uptime",
      "/uptime"
    ),

    createQuickReplyButton(
      "/info",
      "/info"
    ),

    createQuickReplyButton(
      "/statistiche",
      "/statistiche"
    )

  ];

  const interactiveMessage =
    proto.Message.InteractiveMessage.create({

      header:
        proto.Message
          .InteractiveMessage
          .Header
          .create({

            hasMediaAttachment:
              false
          }),

      body:
        proto.Message
          .InteractiveMessage
          .Body
          .create({

            text:

              "🤖 *COMANDI BOT*\n\n" +

              "Scegli cosa vuoi fare:\n\n" +

              "📊 */stato* — Controlla lo stato attuale del bot.\n\n" +

              "🕐 */uptime* — Mostra da quanto tempo il bot è attivo.\n\n" +

              "ℹ️ */info* — Mostra le informazioni tecniche del bot.\n\n" +

              "📈 */statistiche* — Mostra le statistiche di utilizzo.\n\n" +

              "👇 Premi uno dei pulsanti qui sotto."
          }),

      footer:
        proto.Message
          .InteractiveMessage
          .Footer
          .create({

            text:
              `Davide WhatsApp Bot • v${BOT_VERSION}`
          }),

      nativeFlowMessage:
        proto.Message
          .InteractiveMessage
          .NativeFlowMessage
          .create({

            buttons:
              buttons.map(
                (button) =>
                  proto.Message
                    .InteractiveMessage
                    .NativeFlowMessage
                    .NativeFlowButton
                    .create({

                      name:
                        button.name,

                      buttonParamsJson:
                        button.buttonParamsJson
                    })
              ),

            messageParamsJson:
              "{}",

            messageVersion:
              1
          })
    });

  const waMessage =
    generateWAMessageFromContent(
      jid,

      {
        interactiveMessage
      },

      {
        userJid:
          sock.user?.id
      }
    );

  const bizNode =
    buildMixedNativeFlowBizNode();

  const botNode = {
    tag: "bot",

    attrs: {
      biz_bot: "1"
    }
  };

  await sock.relayMessage(
    jid,
    waMessage.message,
    {
      messageId:
        waMessage.key.id,

      additionalNodes: [
        botNode,
        bizNode
      ]
    }
  );

  rememberBotMessage(
    waMessage.key.id
  );

  messagesSent++;

  console.log(
    "✅ Pagina comandi inviata."
  );
}

// ======================================================
// AVVIO WHATSAPP
// ======================================================

async function startWhatsApp() {

  if (starting) {
    return;
  }

  starting = true;

  botStartTime =
    Date.now();

  try {

    console.log(
      "📱 Avvio WhatsApp Bot v" +
      BOT_VERSION +
      "..."
    );

    // ==================================================
    // TEST SUPABASE
    // ==================================================

    if (supabase) {

      try {

        const {
          error
        } = await supabase
          .from("chat_states")
          .select(
            "chat_id",
            {
              head: true,
              count: "exact"
            }
          );

        if (error) {

          console.error(
            "❌ Supabase non raggiungibile:",
            error.message
          );

        } else {

          console.log(
            "✅ Connessione Supabase verificata."
          );
        }

      } catch (error) {

        console.error(
          "❌ Errore test Supabase:",
          error.message
        );
      }
    }

    // ==================================================
    // AUTENTICAZIONE
    // ==================================================

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      AUTH_FOLDER
    );

    const sock =
      makeWASocket({

        auth: state,

        logger:
          P({
            level: "silent"
          }),

        browser:
          Browsers.macOS(
            "Google Chrome"
          ),

        printQRInTerminal:
          false,

        markOnlineOnConnect:
          false,

        syncFullHistory:
          false
      });

    // ==================================================
    // CREDENZIALI
    // ==================================================

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    // ==================================================
    // CONNESSIONE
    // ==================================================

    sock.ev.on(
      "connection.update",
      async (update) => {

        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        console.log(
          "📡 Stato WhatsApp:",
          connection ||
          "waiting"
        );

        // QR
        if (qr) {

          currentQR = qr;

          console.log(
            "📷 QR Code WhatsApp disponibile."
          );

          console.log(
            "🌐 Apri la pagina del bot per scansionarlo."
          );
        }

        // ==================================================
        // CONNESSO
        // ==================================================

        if (
          connection === "open"
        ) {

          currentQR = null;

          whatsappConnected =
            true;

          console.log("");

          console.log(
            "=========================================="
          );

          console.log(
            "        ✅ WHATSAPP COLLEGATO"
          );

          console.log(
            "        📦 VERSIONE: " +
            BOT_VERSION
          );

          console.log(
            "=========================================="
          );

          console.log("");

          starting = false;
        }

        // ==================================================
        // DISCONNESSO
        // ==================================================

        if (
          connection === "close"
        ) {

          currentQR = null;

          whatsappConnected =
            false;

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          console.log(
            "❌ Connessione WhatsApp chiusa:",
            statusCode
          );

          starting = false;

          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {

            console.log(
              "🚪 Sessione WhatsApp disconnessa."
            );

            return;
          }

          console.log(
            "🔄 Riconnessione tra 5 secondi..."
          );

          setTimeout(
            () => {
              startWhatsApp();
            },
            5000
          );
        }
      }
    );

    // ==================================================
    // RICEZIONE MESSAGGI
    // ==================================================

    sock.ev.on(
      "messages.upsert",
      async ({
        messages,
        type
      }) => {

        console.log("");

        console.log(
          "📨 EVENTO messages.upsert RICEVUTO"
        );

        console.log(
          "Tipo:",
          type
        );

        console.log(
          "Numero messaggi:",
          messages.length
        );

        for (
          const message of messages
        ) {

          try {

            if (!message) {
              continue;
            }

            if (!message.message) {
              continue;
            }

            const chat =
              message.key.remoteJid;

            // ==================================================
            // SOLO CHAT PRIVATE
            // ==================================================

            if (
              !isPrivateChat(chat)
            ) {

              console.log(
                "👥 Chat non privata rilevata. Bot ignorato:",
                chat
              );

              continue;
            }

            const fromMe =
              message.key.fromMe;

            const text =
              getMessageText(
                message.message
              ).trim();

            const buttonId =
              getButtonId(
                message.message
              ).trim();

            console.log("");

            console.log(
              "=========================================="
            );

            console.log(
              "📩 NUOVO MESSAGGIO PRIVATO"
            );

            console.log(
              "JID:",
              chat
            );

            console.log(
              "Da me:",
              fromMe
            );

            console.log(
              "Testo:",
              text ||
              "(nessun testo)"
            );

            if (buttonId) {

              console.log(
                "🔘 PULSANTE PREMUTO:",
                buttonId
              );
            }

            // ==================================================
            // MESSAGGIO INVIATO DA DAVIDE
            // ==================================================

            if (fromMe) {

              if (
                isBotMessage(
                  message.key.id
                )
              ) {

                console.log(
                  "↩️ Messaggio inviato dal bot. Ignorato."
                );

                continue;
              }

              console.log(
                "👤 Messaggio inviato manualmente da Davide."
              );

              const ownerState =
                await getChatState(
                  chat
                );

              // ------------------------------------------
              // DAVIDE SCRIVE DURANTE LA PAUSA
              // ------------------------------------------

              if (
                ownerState?.mode ===
                "davide"
              ) {

                // IMPORTANTE:
                // NON disattiviamo la pausa.
                // Il bot deve continuare a restare
                // silenzioso fino alla scadenza
                // delle 5 ore.

                console.log(
                  "👤 Davide ha scritto per primo."
                );

                console.log(
                  "🤫 Il bot rimane silenzioso fino alla scadenza delle 5 ore."
                );
              }

              continue;
            }

            // ==================================================
            // MESSAGGIO RICEVUTO
            // ==================================================

            messagesReceived++;

            // ==================================================
            // STATO CHAT
            // ==================================================

            const chatState =
              await getChatState(
                chat
              );

            if (chatState) {

              console.log(
                "💾 Stato chat:",
                chatState.mode,
                "| pausa:",
                chatState.paused_until ||
                "nessuna"
              );

            } else {

              console.log(
                "💾 Nessuno stato salvato per questa chat."
              );
            }

            // ==================================================
            // MODALITÀ DAVIDE
            // ==================================================

            if (
              chatState?.mode ===
              "davide"
            ) {

              const pausedUntil =
                chatState.paused_until
                  ? new Date(
                      chatState.paused_until
                    ).getTime()
                  : 0;

              // ------------------------------------------
              // PAUSA ANCORA ATTIVA
              // ------------------------------------------

              if (
                pausedUntil >
                Date.now()
              ) {

                console.log(
                  "🤫 Chat in modalità Davide."
                );

                console.log(
                  "⏳ Pausa ancora attiva fino a:",
                  chatState.paused_until
                );

                continue;
              }

              // ------------------------------------------
              // 5 ORE TERMINATE
              // ------------------------------------------

              console.log(
                "⏰ Pausa di 5 ore terminata."
              );

              console.log(
                "👤 La persona ha scritto per prima."
              );

              await saveChatState(
                chat,
                "normal",
                null
              );

              await sendModeSelection(
                sock,
                chat
              );

              continue;
            }

            // ==================================================
            // MODALITÀ AI
            // ==================================================

            if (
              chatState?.mode ===
              "ai"
            ) {

              console.log(
                "🤖 Chat in modalità Assistente AI."
              );

              // L'AI verrà collegata nel prossimo
              // passaggio.

              continue;
            }

            // ==================================================
            // COMANDO
            // ==================================================

            const command =
              buttonId ||
              text;

            if (!command) {
              continue;
            }

            console.log(
              "🎯 Comando:",
              command
            );

            // ==================================================
            // 👤 PARLA CON DAVIDE
            // ==================================================

            if (
              command ===
              "mode_davide"
            ) {

              console.log(
                "👤 Modalità Davide selezionata."
              );

              const pausedUntil =
                new Date(
                  Date.now() +
                  DAVIDE_PAUSE_MS
                ).toISOString();

              const saved =
                await saveChatState(
                  chat,
                  "davide",
                  pausedUntil
                );

              if (!saved) {

                console.error(
                  "❌ Impossibile salvare la modalità Davide."
                );

                await sendTrackedMessage(
                  sock,
                  chat,
                  {
                    text:
                      "❌ Non riesco ad attivare la modalità Davide in questo momento. Riprova."
                  }
                );

                continue;
              }

              await sendTrackedMessage(
                sock,
                chat,
                {
                  text:
                    "👤 *Modalità Davide attivata.*\n\n" +
                    "Il bot resterà in pausa per 5 ore in questa chat.\n\n" +
                    "Se Davide ti scrive per primo, il bot rimarrà silenzioso fino alla fine della pausa."
                }
              );

              continue;
            }

            // ==================================================
            // 🤖 ASSISTENTE AI
            // ==================================================

            if (
              command ===
              "mode_ai"
            ) {

              console.log(
                "🤖 Modalità Assistente AI selezionata."
              );

              const saved =
                await saveChatState(
                  chat,
                  "ai",
                  null
                );

              if (!saved) {

                console.error(
                  "❌ Impossibile salvare la modalità AI."
                );

                continue;
              }

              await sendTrackedMessage(
                sock,
                chat,
                {
                  text:
                    "🤖 *Assistente AI attivato.*\n\n" +
                    "L'intelligenza artificiale verrà collegata nel prossimo passaggio."
                }
              );

              continue;
            }

            // ==================================================
            // /COMANDI
            // ==================================================

            if (
              command.toLowerCase() ===
              "/comandi"
            ) {

              console.log(
                "🤖 /comandi riconosciuto."
              );

              commandsExecuted++;

              await sendCommandsWithButtons(
                sock,
                chat
              );

              continue;
            }

            // ==================================================
            // /STATO
            // ==================================================

            if (
              command.toLowerCase() ===
              "/stato"
            ) {

              console.log(
                "📊 /stato riconosciuto."
              );

              commandsExecuted++;

              const stato =
                whatsappConnected
                  ? "🟢 Connesso"
                  : "🔴 Disconnesso";

              await sendTrackedMessage(
                sock,
                chat,
                {
                  text:

                    "📊 *STATO BOT*\n\n" +

                    `📡 WhatsApp: ${stato}\n` +

                    "🤖 Bot: 🟢 Attivo"
                }
              );

              continue;
            }

            // ==================================================
            // /UPTIME
            // ==================================================

            if (
              command.toLowerCase() ===
              "/uptime"
            ) {

              console.log(
                "🕐 /uptime riconosciuto."
              );

              commandsExecuted++;

              await sendTrackedMessage(
                sock,
                chat,
                {
                  text:

                    "🕐 *UPTIME BOT*\n\n" +

                    "Il bot è attivo da:\n\n" +

                    `*${getUptime()}*`
                }
              );

              continue;
            }

            // ==================================================
            // /INFO
            // ==================================================

            if (
              command.toLowerCase() ===
              "/info"
            ) {

              console.log(
                "ℹ️ /info riconosciuto."
              );

              commandsExecuted++;

              await sendTrackedMessage(
                sock,
                chat,
                {
                  text:

                    "ℹ️ *INFORMAZIONI BOT*\n\n" +

                    "🤖 Nome: Davide WhatsApp Bot\n" +

                    `📦 Versione: ${BOT_VERSION}\n` +

                    "⚡ Motore: Baileys\n" +

                    "🟢 Sistema: Linux"
                }
              );

              continue;
            }

            // ==================================================
            // /STATISTICHE
            // ==================================================

            if (
              command.toLowerCase() ===
              "/statistiche"
            ) {

              console.log(
                "📈 /statistiche riconosciuto."
              );

              commandsExecuted++;

              await sendTrackedMessage(
                sock,
                chat,
                {
                  text:

                    "📈 *STATISTICHE BOT*\n\n" +

                    `📥 Messaggi ricevuti: ${messagesReceived}\n` +

                    `📤 Messaggi inviati: ${messagesSent}\n` +

                    `⚡ Comandi eseguiti: ${commandsExecuted}`
                }
              );

              continue;
            }

            // ==================================================
            // CIAO
            // ==================================================

            if (
              command.toLowerCase() ===
              "ciao"
            ) {

              console.log(
                "👋 Ciao riconosciuto."
              );

              try {

                await sendWelcomeWithButton(
                  sock,
                  chat
                );

              } catch (error) {

                console.error(
                  "❌ ERRORE INVIO BENVENUTO:"
                );

                console.error(
                  error
                );
              }

              continue;
            }

            // ==================================================
            // COMANDO NON RICONOSCIUTO
            // ==================================================

            console.log(
              "ℹ️ Comando non riconosciuto:",
              command
            );

          } catch (error) {

            console.error(
              "❌ Errore elaborazione messaggio:"
            );

            console.error(
              error
            );
          }
        }
      }
    );

  } catch (error) {

    console.error(
      "❌ Errore avvio WhatsApp:"
    );

    console.error(
      error
    );

    starting = false;

    whatsappConnected =
      false;

    setTimeout(
      () => {
        startWhatsApp();
      },
      5000
    );
  }
}

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  startWhatsApp,
  getQR
};
