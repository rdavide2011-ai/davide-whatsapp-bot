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
const Groq = require("groq-sdk");

const AUTH_FOLDER = "./auth_info";

// ======================================================
// VERSIONE
// ======================================================

const BOT_VERSION = "1.2.5";

// ======================================================
// CONFIGURAZIONE
// ======================================================

const DAVIDE_PAUSE_MS =
  5 * 60 * 60 * 1000;

const GROQ_MODEL =
  "openai/gpt-oss-20b";

const AI_MAX_HISTORY =
  12;

// Mostra il pulsante "Parla con Davide"
// ogni 6 risposte dell'AI
const DAVIDE_BUTTON_EVERY =
  6;

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
// GROQ
// ======================================================

const GROQ_API_KEY =
  process.env.GROQ_API_KEY;

let groq = null;

if (GROQ_API_KEY) {
  groq = new Groq({
    apiKey: GROQ_API_KEY
  });

  console.log(
    "✅ Groq configurato correttamente."
  );
} else {
  console.error(
    "❌ ERRORE: variabile GROQ_API_KEY mancante."
  );
}

// ======================================================
// STATO BOT
// ======================================================

let currentQR = null;
let starting = false;
let whatsappConnected = false;

let botStartTime =
  Date.now();

let messagesReceived = 0;
let messagesSent = 0;
let commandsExecuted = 0;

// ======================================================
// CONTATORE RISPOSTE AI
// ======================================================

const aiResponseCounters =
  new Map();

function getAIResponseCount(
  chatId
) {
  return (
    aiResponseCounters.get(
      chatId
    ) || 0
  );
}

function incrementAIResponseCount(
  chatId
) {
  const current =
    getAIResponseCount(
      chatId
    );

  const next =
    current + 1;

  aiResponseCounters.set(
    chatId,
    next
  );

  return next;
}

function resetAIResponseCount(
  chatId
) {
  aiResponseCounters.set(
    chatId,
    0
  );
}

// ======================================================
// MESSAGGI INVIATI DAL BOT
// ======================================================

const botSentMessageIds =
  new Set();

function rememberBotMessage(
  messageId
) {
  if (!messageId) {
    return;
  }

  botSentMessageIds.add(
    messageId
  );

  if (
    botSentMessageIds.size >
    500
  ) {
    const firstId =
      botSentMessageIds
        .values()
        .next()
        .value;

    botSentMessageIds.delete(
      firstId
    );
  }
}

function isBotMessage(
  messageId
) {
  if (!messageId) {
    return false;
  }

  const result =
    botSentMessageIds.has(
      messageId
    );

  if (result) {
    botSentMessageIds.delete(
      messageId
    );
  }

  return result;
}

// ======================================================
// MEMORIA AI
// ======================================================

const aiHistories =
  new Map();

const AI_SYSTEM_PROMPT =
  "Sei l'Assistente AI del bot WhatsApp di Davide. " +
  "Stai parlando con una persona che sta scrivendo al numero di Davide, ma NON devi presumere che la persona con cui stai parlando sia Davide. " +
  "Non chiamare mai l'interlocutore Davide, a meno che sia la persona stessa a dirti esplicitamente che il suo nome è Davide. " +
  "Non inventare mai il nome dell'interlocutore. " +
  "Quando saluti una persona, usa saluti neutri e naturali come 'Ciao! 👋 Come posso aiutarti?' oppure 'Ciao! Come posso esserti utile?'. " +
  "Non usare automaticamente nomi propri nei saluti o nelle risposte. " +
  "Rispondi in italiano salvo richiesta diversa. " +
  "Sii utile, naturale, chiaro e abbastanza conciso. " +
  "Non fingere di essere Davide e non dire di essere una persona reale. " +
  "Puoi aiutare con domande, spiegazioni, traduzioni, riassunti e calcoli. " +
  "Quando una richiesta richiede dati aggiornati che non hai, non inventare informazioni. " +
  "Il bot può utilizzare strumenti esterni quando il codice glieli fornisce.";

function getAIHistory(
  chatId
) {
  if (
    !aiHistories.has(
      chatId
    )
  ) {
    aiHistories.set(
      chatId,
      [
        {
          role: "system",
          content:
            AI_SYSTEM_PROMPT
        }
      ]
    );
  }

  return aiHistories.get(
    chatId
  );
}

function clearAIHistory(
  chatId
) {
  aiHistories.delete(
    chatId
  );

  resetAIResponseCount(
    chatId
  );
}

function addAIMessage(
  chatId,
  role,
  content
) {
  const history =
    getAIHistory(
      chatId
    );

  history.push({
    role,
    content
  });

  while (
    history.length >
    AI_MAX_HISTORY + 1
  ) {
    history.splice(
      1,
      2
    );
  }
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

function isPrivateChat(
  jid
) {
  if (!jid) {
    return false;
  }

  if (
    jid.endsWith("@g.us")
  ) {
    return false;
  }

  if (
    jid.endsWith("@broadcast")
  ) {
    return false;
  }

  if (
    jid.endsWith("@newsletter")
  ) {
    return false;
  }

  if (
    jid.endsWith(
      "@s.whatsapp.net"
    )
  ) {
    return true;
  }

  if (
    jid.endsWith("@lid")
  ) {
    return true;
  }

  return false;
}

// ======================================================
// TESTO MESSAGGIO
// ======================================================

function getMessageText(
  message
) {
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

function getButtonId(
  message
) {
  if (!message) {
    return "";
  }

  const response =
    message
      .interactiveResponseMessage;

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
  const offset =
    77980457;

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
// INVIO MESSAGGIO NORMALE
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

  if (
    sent?.key?.id
  ) {
    rememberBotMessage(
      sent.key.id
    );
  }

  messagesSent++;

  return sent;
}

// ======================================================
// INVIO RISPOSTA AI CON PULSANTE DAVIDE
// ======================================================

async function sendAIMessage(
  sock,
  jid,
  text,
  showDavideButton
) {
  // ----------------------------------------------
  // Risposta normale
  // ----------------------------------------------

  if (!showDavideButton) {

    await sendTrackedMessage(
      sock,
      jid,
      {
        text
      }
    );

    return;
  }

  // ----------------------------------------------
  // Risposta AI + pulsante
  // ----------------------------------------------

  console.log(
    "👤 Aggiungo pulsante 'Parla con Davide'."
  );

  const button =
    createQuickReplyButton(
      "👤 Parla con Davide",
      "mode_davide"
    );

  const interactiveMessage =
    proto.Message
      .InteractiveMessage
      .create({

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
                text +
                "\n\n" +
                "👤 Se preferisci parlare direttamente con Davide:"
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

              buttons: [

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

              ],

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

  await sock.relayMessage(
    jid,
    waMessage.message,
    {
      messageId:
        waMessage.key.id,

      additionalNodes: [

        {
          tag:
            "bot",

          attrs: {
            biz_bot:
              "1"
          }
        },

        buildMixedNativeFlowBizNode()

      ]
    }
  );

  rememberBotMessage(
    waMessage.key.id
  );

  messagesSent++;
}

// ======================================================
// STATO CHAT
// ======================================================

async function getChatState(
  chatId
) {
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
      "❌ Errore Supabase:",
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
          chat_id:
            chatId,

          mode:
            mode,

          paused_until:
            pausedUntil,

          updated_at:
            new Date().toISOString()
        },

        {
          onConflict:
            "chat_id"
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
      mode
    );

    return true;

  } catch (error) {
    console.error(
      "❌ Errore Supabase:",
      error.message
    );

    return false;
  }
}

// ======================================================
// PAUSA DAVIDE
// ======================================================

async function pauseForDavide(
  chatId
) {
  const pausedUntil =
    new Date(
      Date.now() +
      DAVIDE_PAUSE_MS
    ).toISOString();

  console.log(
    "👑 Davide ha scritto per primo."
  );

  console.log(
    "🤫 Bot in pausa per 5 ore."
  );

  const saved =
    await saveChatState(
      chatId,
      "davide",
      pausedUntil
    );

  clearAIHistory(
    chatId
  );

  if (!saved) {
    console.error(
      "❌ Impossibile salvare la pausa."
    );

    return false;
  }

  console.log(
    "⏰ Pausa fino a:",
    pausedUntil
  );

  return true;
}

// ======================================================
// MODALITÀ DAVIDE
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

  clearAIHistory(
    chat
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
// NORMALIZZAZIONE TESTO
// ======================================================

function normalizeText(
  text
) {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[?!.,;:()[\]{}"'`]/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
  );
}

// ======================================================
// RICONOSCIMENTO RICHIESTA DAVIDE
// ======================================================

function isDavideRequest(
  text
) {
  if (!text) {
    return false;
  }

  const normalized =
    normalizeText(
      text
    );

  const patterns = [

    /\bvoglio parlare con davide\b/,

    /\bvorrei parlare con davide\b/,

    /\bposso parlare con davide\b/,

    /\bposso parlare direttamente con davide\b/,

    /\bmi fai parlare con davide\b/,

    /\bmi puoi far parlare con davide\b/,

    /\bmi passi davide\b/,

    /\bpassami davide\b/,

    /\bpassami direttamente davide\b/,

    /\bparlare direttamente con davide\b/,

    /\bvorrei parlare direttamente con davide\b/,

    /\bvoglio parlare direttamente con davide\b/,

    /\bdevo parlare con davide\b/,

    /\bho bisogno di parlare con davide\b/,

    /\bmi serve davide\b/,

    /\bserve davide\b/,

    /\bposso parlare con lui\b/,

    /\bvorrei parlare con lui\b/,

    /\bvoglio parlare con lui\b/,

    /\bparlare con lui\b/,

    /\bnon voglio parlare con il bot\b/,

    /\bnon voglio parlare con l ai\b/,

    /\bnon voglio parlare con la ai\b/,

    /\bbasta bot\b/,

    /\bferma il bot\b/,

    /\bstop bot\b/

  ];

  return patterns.some(
    pattern =>
      pattern.test(
        normalized
      )
  );
}

// ======================================================
// RICONOSCIMENTO ORARIO
// ======================================================

function isTimeRequest(
  text
) {
  if (!text) {
    return false;
  }

  const normalized =
    normalizeText(
      text
    );

  const patterns = [

    /\bche ore sono\b/,

    /\bche ora e\b/,

    /\bsai che ore sono\b/,

    /\bsai dirmi che ore sono\b/,

    /\bmi dici che ore sono\b/,

    /\bmi dici l ora\b/,

    /\bquanto e l ora\b/,

    /\bquanto e l ora\b/,

    /\borario attuale\b/,

    /\bora attuale\b/,

    /\bora corrente\b/,

    /\bche ore sono adesso\b/,

    /\bche ora e adesso\b/

  ];

  return patterns.some(
    pattern =>
      pattern.test(
        normalized
      )
  );
}

// ======================================================
// ORA ITALIANA
// ======================================================

function getItalianTime() {
  return new Intl.DateTimeFormat(
    "it-IT",
    {
      timeZone:
        "Europe/Rome",

      hour:
        "2-digit",

      minute:
        "2-digit",

      second:
        "2-digit",

      hour12:
        false
    }
  ).format(
    new Date()
  );
}

// ======================================================
// GESTIONE ORARIO
// ======================================================

async function handleTimeRequest(
  sock,
  chat,
  text
) {
  if (
    !isTimeRequest(
      text
    )
  ) {
    return false;
  }

  const time =
    getItalianTime();

  console.log(
    "🕐 Richiesta orario:",
    text
  );

  console.log(
    "🕐 Ora italiana:",
    time
  );

  await sendTrackedMessage(
    sock,
    chat,
    {
      text:
        `🕐 Sono le *${time}*.`
    }
  );

  return true;
}

// ======================================================
// RICHIESTA METEO
// ======================================================

function isWeatherRequest(
  text
) {
  if (!text) {
    return false;
  }

  const normalized =
    normalizeText(
      text
    );

  const weatherWords = [
    "meteo",
    "tempo",
    "previsioni",
    "piove",
    "piovera",
    "pioggia",
    "nevica",
    "neve",
    "temperatura",
    "temperature",
    "clima"
  ];

  const futureWords = [
    "domani",
    "dopodomani",
    "oggi",
    "stasera",
    "questa sera",
    "questa notte",
    "stanotte"
  ];

  const hasWeatherWord =
    weatherWords.some(
      word =>
        normalized.includes(
          word
        )
    );

  const hasFutureWord =
    futureWords.some(
      word =>
        normalized.includes(
          word
        )
    );

  const hasWeatherPhrase =
    normalized.includes(
      "che tempo"
    ) ||
    normalized.includes(
      "che meteo"
    ) ||
    normalized.includes(
      "previsioni meteo"
    );

  return (
    hasWeatherWord &&
    (
      hasFutureWord ||
      hasWeatherPhrase
    )
  );
}

// ======================================================
// ESTRAZIONE CITTÀ
// ======================================================

function extractWeatherCity(
  text
) {
  if (!text) {
    return null;
  }

  const normalized =
    normalizeText(
      text
    );

  let cleaned =
    normalized;

  const removePatterns = [

    /\bche\s+tempo\b/g,

    /\bche\s+meteo\b/g,

    /\bmeteo\b/g,

    /\bprevisioni(?:\s+meteo)?\b/g,

    /\btemperatura\b/g,

    /\btemperature\b/g,

    /\btempo\b/g,

    /\bfar[aà]\b/g,

    /\bfara\b/g,

    /\bfare\b/g,

    /\bfa\b/g,

    /\bdomani\b/g,

    /\bdopodomani\b/g,

    /\boggi\b/g,

    /\bstasera\b/g,

    /\bquesta\s+sera\b/g,

    /\bquesta\s+notte\b/g,

    /\bstanotte\b/g,

    /\bper\s+favore\b/g,

    /\bper\s+piacere\b/g,

    /\bmi\s+dici\b/g,

    /\bmi\s+puoi\s+dire\b/g,

    /\bpuoi\s+dire\b/g,

    /\bpuoi\s+dirmi\b/g,

    /\bdimmi\b/g,

    /\s+/g
  ];

  for (
    const pattern of
      removePatterns
  ) {
    cleaned =
      cleaned.replace(
        pattern,
        " "
      );
  }

  cleaned =
    cleaned.trim();

  if (
    !cleaned ||
    cleaned.length < 2
  ) {
    return null;
  }

  cleaned =
    cleaned.replace(
      /^(a|ad|in|per|di|su)\s+/i,
      ""
    );

  cleaned =
    cleaned.replace(
      /\s+(a|ad|in|per|di|su)$/i,
      ""
    );

  cleaned =
    cleaned.trim();

  if (
    !cleaned ||
    cleaned.length < 2
  ) {
    return null;
  }

  const words =
    cleaned.split(
      /\s+/
    );

  if (
    words.length > 5
  ) {
    return null;
  }

  const genericWords = new Set([
    "tempo",
    "meteo",
    "domani",
    "oggi",
    "dopodomani",
    "previsioni",
    "pioggia",
    "neve",
    "temperatura",
    "temperature",
    "clima",
    "sara",
    "fare",
    "fa"
  ]);

  if (
    words.every(
      word =>
        genericWords.has(
          word
        )
    )
  ) {
    return null;
  }

  const city =
    cleaned
      .split(/\s+/)
      .map(
        word =>
          word.charAt(0)
            .toUpperCase() +
          word.slice(1)
      )
      .join(" ");

  return city;
}

// ======================================================
// GEOCODING
// ======================================================

async function geocodeCity(
  city
) {
  if (!city) {
    return null;
  }

  const url =
    "https://geocoding-api.open-meteo.com/v1/search" +
    `?name=${encodeURIComponent(city)}` +
    "&count=5" +
    "&language=it" +
    "&format=json";

  try {

    const response =
      await fetch(
        url
      );

    if (!response.ok) {
      throw new Error(
        `Geocoding HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    if (
      !data.results ||
      data.results.length === 0
    ) {
      return null;
    }

    const requested =
      normalizeText(
        city
      );

    const exact =
      data.results.find(
        result =>
          normalizeText(
            result.name || ""
          ) === requested
      );

    if (exact) {
      return exact;
    }

    const first =
      data.results[0];

    if (
      !first?.name
    ) {
      return null;
    }

    return first;

  } catch (error) {

    console.error(
      "❌ Errore geocoding:",
      error.message
    );

    return null;
  }
}

// ======================================================
// CODICI METEO
// ======================================================

function weatherCodeToText(
  code
) {
  const codes = {

    0:
      "Cielo sereno",

    1:
      "Prevalentemente sereno",

    2:
      "Parzialmente nuvoloso",

    3:
      "Coperto",

    45:
      "Nebbia",

    48:
      "Nebbia con brina",

    51:
      "Pioviggine debole",

    53:
      "Pioviggine moderata",

    55:
      "Pioviggine intensa",

    56:
      "Pioviggine gelata debole",

    57:
      "Pioviggine gelata intensa",

    61:
      "Pioggia debole",

    63:
      "Pioggia moderata",

    65:
      "Pioggia intensa",

    66:
      "Pioggia gelata debole",

    67:
      "Pioggia gelata intensa",

    71:
      "Neve debole",

    73:
      "Neve moderata",

    75:
      "Neve intensa",

    77:
      "Granelli di neve",

    80:
      "Rovesci deboli",

    81:
      "Rovesci moderati",

    82:
      "Rovesci intensi",

    85:
      "Rovesci di neve deboli",

    86:
      "Rovesci di neve intensi",

    95:
      "Temporale",

    96:
      "Temporale con grandine debole",

    99:
      "Temporale con grandine intensa"
  };

  return (
    codes[code] ||
    "Condizioni meteorologiche non disponibili"
  );
}

// ======================================================
// EMOJI METEO
// ======================================================

function weatherCodeToEmoji(
  code
) {
  if (code === 0) {
    return "☀️";
  }

  if (
    code === 1 ||
    code === 2
  ) {
    return "🌤️";
  }

  if (code === 3) {
    return "☁️";
  }

  if (
    code === 45 ||
    code === 48
  ) {
    return "🌫️";
  }

  if (
    code >= 51 &&
    code <= 67
  ) {
    return "🌧️";
  }

  if (
    code >= 71 &&
    code <= 77
  ) {
    return "❄️";
  }

  if (
    code >= 80 &&
    code <= 82
  ) {
    return "🌦️";
  }

  if (
    code >= 85 &&
    code <= 86
  ) {
    return "🌨️";
  }

  if (
    code >= 95
  ) {
    return "⛈️";
  }

  return "🌦️";
}

// ======================================================
// DATA DOMANI
// ======================================================

function getTomorrowDate() {
  const date =
    new Date();

  date.setDate(
    date.getDate() + 1
  );

  return (
    date
      .toISOString()
      .split("T")[0]
  );
}

// ======================================================
// METEO
// ======================================================

async function getTomorrowWeather(
  city
) {
  const location =
    await geocodeCity(
      city
    );

  if (!location) {
    return {
      found: false
    };
  }

  const tomorrow =
    getTomorrowDate();

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(
      location.latitude
    )}` +
    `&longitude=${encodeURIComponent(
      location.longitude
    )}` +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=auto" +
    `&start_date=${tomorrow}` +
    `&end_date=${tomorrow}`;

  try {

    const response =
      await fetch(
        url
      );

    if (!response.ok) {
      throw new Error(
        `Meteo HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    if (
      !data.daily ||
      !data.daily.time ||
      data.daily.time.length === 0
    ) {
      return {
        found: true,
        weather: null,
        location
      };
    }

    return {

      found: true,

      weather: {

        date:
          data.daily.time[0],

        code:
          data.daily
            .weather_code?.[0],

        max:
          data.daily
            .temperature_2m_max?.[0],

        min:
          data.daily
            .temperature_2m_min?.[0],

        rain:
          data.daily
            .precipitation_probability_max?.[0]
      },

      location
    };

  } catch (error) {

    console.error(
      "❌ Errore API meteo:",
      error.message
    );

    return {
      found: true,
      weather: null,
      location
    };
  }
}

// ======================================================
// FORMATTA METEO
// ======================================================

function formatWeatherResponse(
  city,
  result
) {
  if (!result.found) {
    return (
      "❌ Non riesco a trovare questa città.\n\n" +
      "Prova a scrivere il nome della città in modo più preciso."
    );
  }

  if (!result.weather) {
    return (
      "❌ Ho trovato la città, ma non riesco a recuperare le previsioni in questo momento."
    );
  }

  const weather =
    result.weather;

  const location =
    result.location;

  const country =
    location.country
      ? `, ${location.country}`
      : "";

  const emoji =
    weatherCodeToEmoji(
      weather.code
    );

  const condition =
    weatherCodeToText(
      weather.code
    );

  const max =
    Number.isFinite(
      weather.max
    )
      ? `${Math.round(
          weather.max
        )}°C`
      : "N/D";

  const min =
    Number.isFinite(
      weather.min
    )
      ? `${Math.round(
          weather.min
        )}°C`
      : "N/D";

  const rain =
    Number.isFinite(
      weather.rain
    )
      ? `${Math.round(
          weather.rain
        )}%`
      : "N/D";

  return (
    `🌦️ *Meteo a ${location.name}${country} — domani*\n\n` +
    `${emoji} *Condizioni:* ${condition}\n` +
    `🌡️ *Min:* ${min}\n` +
    `🌡️ *Max:* ${max}\n` +
    `🌧️ *Pioggia:* ${rain}`
  );
}

// ======================================================
// GESTIONE METEO
// ======================================================

async function handleWeatherRequest(
  sock,
  chat,
  text,
  chatState
) {

  if (
    chatState?.mode ===
    "weather_waiting_city"
  ) {

    const city =
      text.trim();

    if (!city) {

      await sendTrackedMessage(
        sock,
        chat,
        {
          text:
            "🌍 Per quale città vuoi sapere il meteo di domani?"
        }
      );

      return true;
    }

    console.log(
      "🌍 Città ricevuta:",
      city
    );

    const result =
      await getTomorrowWeather(
        city
      );

    const response =
      formatWeatherResponse(
        city,
        result
      );

    await sendTrackedMessage(
      sock,
      chat,
      {
        text:
          response
      }
    );

    await saveChatState(
      chat,
      "ai",
      null
    );

    return true;
  }

  if (
    isWeatherRequest(
      text
    )
  ) {

    const city =
      extractWeatherCity(
        text
      );

    console.log(
      "🌦️ Richiesta meteo:",
      text
    );

    console.log(
      "🌍 Città rilevata:",
      city ||
      "(nessuna)"
    );

    if (city) {

      const result =
        await getTomorrowWeather(
          city
        );

      const response =
        formatWeatherResponse(
          city,
          result
        );

      await sendTrackedMessage(
        sock,
        chat,
        {
          text:
            response
        }
      );

      return true;
    }

    await saveChatState(
      chat,
      "weather_waiting_city",
      null
    );

    await sendTrackedMessage(
      sock,
      chat,
      {
        text:
          "🌍 Certo! Per quale città?"
      }
    );

    return true;
  }

  return false;
}

// ======================================================
// GROQ AI
// ======================================================

async function askGroqAI(
  chatId,
  userText
) {
  if (!groq) {
    throw new Error(
      "GROQ_API_KEY non configurata."
    );
  }

  addAIMessage(
    chatId,
    "user",
    userText
  );

  const history =
    getAIHistory(
      chatId
    );

  const completion =
    await groq.chat.completions.create({

      model:
        GROQ_MODEL,

      messages:
        history,

      temperature:
        0.6,

      max_completion_tokens:
        1024,

      reasoning_effort:
        "low"
    });

  const answer =
    completion
      ?.choices?.[0]
      ?.message
      ?.content
      ?.trim();

  if (!answer) {
    throw new Error(
      "Groq non ha restituito una risposta."
    );
  }

  addAIMessage(
    chatId,
    "assistant",
    answer
  );

  return answer;
}

// ======================================================
// MENU AI / DAVIDE
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
    proto.Message
      .InteractiveMessage
      .create({

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
                  button =>
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

  await sock.relayMessage(
    jid,
    waMessage.message,
    {
      messageId:
        waMessage.key.id,

      additionalNodes: [

        {
          tag:
            "bot",

          attrs: {
            biz_bot:
              "1"
          }
        },

        buildMixedNativeFlowBizNode()

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
    proto.Message
      .InteractiveMessage
      .create({

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
                  button =>
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

  await sock.relayMessage(
    jid,
    waMessage.message,
    {
      messageId:
        waMessage.key.id,

      additionalNodes: [

        {
          tag:
            "bot",

          attrs: {
            biz_bot:
              "1"
          }
        },

        buildMixedNativeFlowBizNode()

      ]
    }
  );

  rememberBotMessage(
    waMessage.key.id
  );

  messagesSent++;
}

// ======================================================
// UPTIME
// ======================================================

function getUptime() {

  const seconds =
    Math.floor(
      (Date.now() -
        botStartTime) /
      1000
    );

  const days =
    Math.floor(
      seconds / 86400
    );

  const hours =
    Math.floor(
      (seconds % 86400) /
      3600
    );

  const minutes =
    Math.floor(
      (seconds % 3600) /
      60
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

  return parts.join(
    ", "
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
      `📱 Avvio WhatsApp Bot v${BOT_VERSION}...`
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
              head:
                true,

              count:
                "exact"
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
      async update => {

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

          starting =
            false;

          console.log("");

          console.log(
            "=========================================="
          );

          console.log(
            "        ✅ WHATSAPP COLLEGATO"
          );

          console.log(
            `        📦 VERSIONE: ${BOT_VERSION}`
          );

          console.log(
            "=========================================="
          );

          console.log("");
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
          const message of
            messages
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
              !isPrivateChat(
                chat
              )
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
                  "🤖 Messaggio inviato dal bot. Ignorato."
                );

                continue;
              }

              console.log(
                "👑 Davide ha scritto manualmente."
              );

              await pauseForDavide(
                chat
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

            const lowerText =
              text.toLowerCase();

            // ==================================================
            // /ON
            // ==================================================

            if (
              lowerText ===
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

              clearAIHistory(
                chat
              );

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
                  "🤫 Bot in pausa."
                );

                console.log(
                  "⏳ Pausa fino a:",
                  chatState.paused_until
                );

                continue;
              }

              console.log(
                "⏰ Le 5 ore sono terminate."
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
            // METEO IN ATTESA CITTÀ
            // ==================================================

            if (
              chatState?.mode ===
              "weather_waiting_city"
            ) {

              console.log(
                "🌍 Risposta alla richiesta della città."
              );

              await handleWeatherRequest(
                sock,
                chat,
                text,
                chatState
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

              if (!text) {
                continue;
              }

              // ----------------------------------------------
              // RICHIESTA DI PARLARE CON DAVIDE
              // ----------------------------------------------

              if (
                isDavideRequest(
                  text
                )
              ) {

                console.log(
                  "👤 Richiesta naturale di parlare con Davide."
                );

                await activateDavideMode(
                  sock,
                  chat
                );

                continue;
              }

              // ----------------------------------------------
              // ORARIO
              // ----------------------------------------------

              const timeHandled =
                await handleTimeRequest(
                  sock,
                  chat,
                  text
                );

              if (
                timeHandled
              ) {
                continue;
              }

              // ----------------------------------------------
              // METEO
              // ----------------------------------------------

              const weatherHandled =
                await handleWeatherRequest(
                  sock,
                  chat,
                  text,
                  chatState
                );

              if (
                weatherHandled
              ) {
                continue;
              }

              // ----------------------------------------------
              // AI GENERALE
              // ----------------------------------------------

              if (!groq) {

                await sendTrackedMessage(
                  sock,
                  chat,
                  {
                    text:
                      "❌ L'Assistente AI non è configurato correttamente."
                  }
                );

                continue;
              }

              try {

                console.log(
                  "🤖 Invio richiesta a Groq..."
                );

                const answer =
                  await askGroqAI(
                    chat,
                    text
                  );

                // ------------------------------------------
                // CONTATORE RISPOSTE AI
                // ------------------------------------------

                const responseNumber =
                  incrementAIResponseCount(
                    chat
                  );

                const showDavideButton =
                  responseNumber %
                    DAVIDE_BUTTON_EVERY ===
                  0;

                console.log(
                  `🤖 Risposta AI #${responseNumber}`
                );

                if (
                  showDavideButton
                ) {

                  console.log(
                    "👤 Questa risposta mostrerà il pulsante Davide."
                  );
                }

                await sendAIMessage(
                  sock,
                  chat,
                  answer,
                  showDavideButton
                );

                console.log(
                  "✅ Risposta AI inviata."
                );

              } catch (error) {

                console.error(
                  "❌ Errore Groq:",
                  error.message
                );

                await sendTrackedMessage(
                  sock,
                  chat,
                  {
                    text:
                      "❌ Al momento non riesco a rispondere. Riprova tra poco."
                  }
                );
              }

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
                "👤 Parla con Davide selezionato."
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
                "🤖 Assistente AI selezionato."
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

              clearAIHistory(
                chat
              );

              await sendTrackedMessage(
                sock,
                chat,
                {
                  text:
                    "🤖 *Assistente AI attivato.*\n\n" +
                    "Puoi chiedermi qualsiasi cosa.\n\n" +
                    "🌦️ Ad esempio: *Che tempo farà domani?*\n" +
                    "🕐 Puoi chiedermi *che ore sono*.\n" +
                    "🌐 Puoi chiedermi una traduzione.\n" +
                    "🧮 Puoi chiedermi un calcolo.\n" +
                    "📝 Puoi chiedermi di riassumere un testo.\n\n" +
                    "Scrivimi qui sotto 👇"
                }
              );

              continue;
            }

            // ==================================================
            // /COMANDI
            // ==================================================

            if (
              lowerText ===
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
              lowerText ===
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
              lowerText ===
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
              lowerText ===
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
              lowerText ===
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
            // CHAT NORMALE
            // ==================================================

            if (
              !chatState ||
              chatState.mode ===
              "normal"
            ) {

              console.log(
                "👤 La persona ha scritto per prima."
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

    starting =
      false;

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
