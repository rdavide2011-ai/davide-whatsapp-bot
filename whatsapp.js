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
// VERSIONE
// ======================================================

const BOT_VERSION = "1.1.0";

// ======================================================
// SUPABASE
// ======================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;

let supabase = null;

if (
  SUPABASE_URL &&
  SUPABASE_SECRET_KEY
) {
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

  console.log(
    "✅ Supabase configurato correttamente."
  );
} else {
  console.error(
    "❌ ERRORE: variabili Supabase mancanti."
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
// PAUSA DAVIDE
// ======================================================

const DAVIDE_PAUSE_MS =
  5 * 60 * 60 * 1000;

// ======================================================
// MESSAGGI INVIATI DAL BOT
// ======================================================

const botSentMessageIds = new Set();

function rememberBotMessage(messageId) {
  if (!messageId) {
    return;
  }

  botSentMessageIds.add(messageId);

  if (botSentMessageIds.size > 500) {
    const firstId =
      botSentMessageIds.values().next().value;

    botSentMessageIds.delete(firstId);
  }
}

function isBotMessage(messageId) {
  if (!messageId) {
    return false;
  }

  const result =
    botSentMessageIds.has(messageId);

  if (result) {
    botSentMessageIds.delete(messageId);
  }

  return result;
}

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

  if (jid.endsWith("@g.us")) {
    return false;
  }

  if (jid.endsWith("@broadcast")) {
    return false;
  }

  if (jid.endsWith("@newsletter")) {
    return false;
  }

  if (jid.endsWith("@s.whatsapp.net")) {
    return true;
  }

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
      .eq(
        "chat_id",
        chatId
      )
      .maybeSingle();

    if (error) {
      console.error(
        "❌ Errore lettura stato chat:",
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
          updated_at:
            new Date().toISOString()
        },
        {
          onConflict: "chat_id"
        }
      );

    if (error) {
      console.error(
        "❌ Errore salvataggio stato:",
        error.message
      );

      return false;
    }

    console.log(
      "💾 Stato chat:",
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
  const seconds =
    Math.floor(
      (Date.now() - botStartTime) /
      1000
    );

  const days =
    Math.floor(seconds / 86400);

  const hours =
    Math.floor(
      (seconds % 86400) / 3600
    );

  const minutes =
    Math.floor(
      (seconds % 3600) / 60
    );

  const secs =
    seconds % 60;

  const parts = [];

  if (days > 0) {
    parts.push(
      `${days} ${
        days === 1
          ? "giorno"
          : "giorni"
      }`
    );
  }

  if (hours > 0) {
    parts.push(
      `${hours} ${
        hours === 1
          ? "ora"
          : "ore"
      }`
    );
  }

  if (minutes > 0) {
    parts.push(
      `${minutes} ${
        minutes === 1
          ? "minuto"
          : "minuti"
      }`
    );
  }

  if (
    secs > 0 ||
    parts.length === 0
  ) {
    parts.push(
      `${secs} ${
        secs === 1
          ? "secondo"
          : "secondi"
      }`
    );
  }

  return parts.join(", ");
}

// ======================================================
// TESTO
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
      const params =
        JSON.parse(
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
        "⚠️ Errore lettura pulsante:",
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
// TIMESTAMP
// ======================================================

function getPrivacyModeTs() {
  const offset = 77980457;

  return (
    Math.floor(
      Date.now() / 1000
    ) - offset
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
          source_type:
            "third_party"
        }
      }
    ]
  };
}

// ======================================================
// PULSANTE
// ======================================================

function createQuickReplyButton(
  displayText,
  id
) {
  return {
    name: "quick_reply",

    buttonParamsJson:
      JSON.stringify({
        display_text:
          displayText,
        id:
          id
      })
  };
}

// ======================================================
// MESSAGGIO TRACCIATO
// ======================================================

async function sendTrackedMessage(
  sock,
  jid,
  content
) {
  const sent =
    await sock.sendMessage(
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
// MENU PRINCIPALE
// ======================================================

async function sendModeSelection(
  sock,
  jid
) {
  console.log(
    "📤 Invio menu Assistente AI / Davide..."
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
            hasMediaAttachment:
              false
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
    "✅ Menu inviato."
  );
}

// ======================================================
// COMANDI
// ======================================================

async function sendCommandsWithButtons(
  sock,
  jid
) {
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
// ATTIVA DAVIDE
// ======================================================

async function activateDavideMode(
  sock,
  chat
) {
  console.log(
    "👤 Attivazione modalità Davide..."
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

    await sendTrackedMessage(
      sock,
      chat,
      {
        text:
          "❌ Non riesco ad attivare la modalità Davide. Riprova."
      }
    );

    return;
  }

  await sendTrackedMessage(
    sock,
    chat,
    {
      text:
        "👤 *Modalità Davide attivata.*\n\n" +
        "Il bot resterà in pausa per 5 ore in questa chat.\n\n" +
        "Se vuoi riattivarlo prima, scrivi */on*."
    }
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
    } =
      await useMultiFileAuthState(
        AUTH_FOLDER
      );

    const sock =
      makeWASocket({

        auth:
          state,

        logger:
          P({
            level:
              "silent"
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

        if (qr) {

          currentQR =
            qr;

          console.log(
            "📷 QR Code WhatsApp disponibile."
          );
        }

        if (
          connection ===
          "open"
        ) {

          currentQR =
            null;

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

          starting =
            false;
        }

        if (
          connection ===
          "close"
        ) {

          currentQR =
            null;

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

          starting =
            false;

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
    // MESSAGGI
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
            // SOLO PRIVATE
            // ==================================================

            if (
              !isPrivateChat(chat)
            ) {

              console.log(
                "👥 Chat non privata. Ignorata:",
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
                "🔘 PULSANTE:",
                buttonId
              );
            }

            // ==================================================
            // MESSAGGIO DI DAVIDE
            // ==================================================

            if (fromMe) {

              if (
                isBotMessage(
                  message.key.id
                )
              ) {

                console.log(
                  "↩️ Messaggio del bot ignorato."
                );

                continue;
              }

              console.log(
                "👤 Messaggio manuale di Davide."
              );

              continue;
            }

            messagesReceived++;

            // ==================================================
            // STATO CHAT
            // ==================================================

            const chatState =
              await getChatState(
                chat
              );

            console.log(
              "💾 Stato attuale:",
              chatState?.mode ||
              "nessuno"
            );

            // ==================================================
            // /ON
            // ==================================================

            if (
              text.toLowerCase() ===
              "/on"
            ) {

              console.log(
                "🟢 /on riconosciuto."
              );

              commandsExecuted++;

              await saveChatState(
                chat,
                "normal",
                null
              );

              // NESSUNA RISPOSTA.

              console.log(
                "🤫 Bot riattivato. Aspetto il prossimo messaggio."
              );

              continue;
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

              if (
                pausedUntil >
                Date.now()
              ) {

                console.log(
                  "🤫 Modalità Davide attiva."
                );

                console.log(
                  "⏳ Pausa fino a:",
                  chatState.paused_until
                );

                continue;
              }

              // ==================================================
              // 5 ORE TERMINATE
              // ==================================================

              console.log(
                "⏰ Le 5 ore sono terminate."
              );

              console.log(
                "📩 La persona ha scritto per prima."
              );

              await saveChatState(
                chat,
                "waiting_choice",
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
                "🤖 Modalità Assistente AI."
              );

              // AI da collegare.

              continue;
            }

            // ==================================================
            // PULSANTE DAVIDE
            // ==================================================

            if (
              buttonId ===
              "mode_davide"
            ) {

              console.log(
                "👤 Pulsante Parla con Davide."
              );

              await activateDavideMode(
                sock,
                chat
              );

              continue;
            }

            // ==================================================
            // PULSANTE AI
            // ==================================================

            if (
              buttonId ===
              "mode_ai"
            ) {

              console.log(
                "🤖 Pulsante Assistente AI."
              );

              const saved =
                await saveChatState(
                  chat,
                  "ai",
                  null
                );

              if (!saved) {
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
              text.toLowerCase() ===
              "/comandi"
            ) {

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
              text.toLowerCase() ===
              "/stato"
            ) {

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
              text.toLowerCase() ===
              "/uptime"
            ) {

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
              text.toLowerCase() ===
              "/info"
            ) {

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
              text.toLowerCase() ===
              "/statistiche"
            ) {

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
            // STATO NORMALE
            // ==================================================

            if (
              !chatState ||
              chatState.mode ===
              "normal"
            ) {

              console.log(
                "🆕 Prima interazione / chat normale."
              );

              // IMPORTANTE:
              // NON attiviamo Davide.
              // Prima mostriamo i pulsanti.

              await saveChatState(
                chat,
                "waiting_choice",
                null
              );

              await sendModeSelection(
                sock,
                chat
              );

              continue;
            }

            // ==================================================
            // WAITING CHOICE
            // ==================================================

            if (
              chatState.mode ===
              "waiting_choice"
            ) {

              console.log(
                "⏳ La persona ha ignorato i pulsanti."
              );

              console.log(
                "👤 Interpreto il nuovo messaggio come richiesta di parlare con Davide."
              );

              await activateDavideMode(
                sock,
                chat
              );

              continue;
            }

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
