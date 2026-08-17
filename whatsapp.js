const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  proto,
  generateWAMessageFromContent
} = require('@whiskeysockets/baileys');

const P = require('pino');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');

const AUTH_FOLDER = './auth_info';
const BOT_VERSION = '1.2.0';
const DAVIDE_PAUSE_MS = 5 * 60 * 60 * 1000;
const GROQ_MODEL = 'openai/gpt-oss-20b';
const AI_MAX_HISTORY = 12;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

let supabase = null;
let groq = null;

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

  console.log(
    '✅ Supabase configurato correttamente.'
  );
} else {
  console.error(
    '❌ ERRORE: variabili Supabase mancanti.'
  );
}

if (GROQ_API_KEY) {
  groq = new Groq({
    apiKey: GROQ_API_KEY
  });

  console.log(
    '✅ Groq configurato correttamente.'
  );
} else {
  console.error(
    '❌ ERRORE: variabile GROQ_API_KEY mancante.'
  );
}

let currentQR = null;
let starting = false;
let whatsappConnected = false;

let botStartTime = Date.now();

let messagesReceived = 0;
let messagesSent = 0;
let commandsExecuted = 0;

const botSentMessageIds = new Set();
const aiConversations = new Map();

const AI_SYSTEM_PROMPT =
  "Sei l'Assistente AI di Davide su WhatsApp. " +
  "Rispondi in italiano salvo diversa richiesta dell'utente. " +
  "Sei utile, naturale, chiaro e abbastanza conciso. " +
  "Non fingere di essere Davide e non dire di essere una persona reale. " +
  "Puoi aiutare con domande, traduzioni, riassunti, spiegazioni e calcoli. " +
  "Quando una richiesta richiede informazioni in tempo reale che non puoi verificare, " +
  "dichiara chiaramente il limite invece di inventare dati.";

function rememberBotMessage(id) {
  if (!id) return;

  botSentMessageIds.add(id);

  if (botSentMessageIds.size > 500) {
    botSentMessageIds.delete(
      botSentMessageIds.values().next().value
    );
  }
}

function isBotMessage(id) {
  if (!id) return false;

  const result =
    botSentMessageIds.has(id);

  if (result) {
    botSentMessageIds.delete(id);
  }

  return result;
}

function getQR() {
  return currentQR;
}

function isPrivateChat(jid) {
  if (!jid) return false;

  if (jid.endsWith('@g.us')) {
    return false;
  }

  if (jid.endsWith('@broadcast')) {
    return false;
  }

  if (jid.endsWith('@newsletter')) {
    return false;
  }

  return (
    jid.endsWith('@s.whatsapp.net') ||
    jid.endsWith('@lid')
  );
}

function getMessageText(message) {
  if (!message) return '';

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ''
  );
}

function getButtonId(message) {
  if (!message) return '';

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
        ''
      );

    } catch (e) {
      console.log(
        '⚠️ Errore lettura pulsante:',
        e.message
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
    ''
  );
}

function getPrivacyModeTs() {
  return (
    Math.floor(
      Date.now() / 1000
    ) - 77980457
  ).toString();
}

function buildMixedNativeFlowBizNode() {
  return {
    tag: 'biz',

    attrs: {
      actual_actors: '2',
      host_storage: '2',
      privacy_mode_ts:
        getPrivacyModeTs()
    },

    content: [
      {
        tag: 'interactive',

        attrs: {
          type: 'native_flow',
          v: '1'
        },

        content: [
          {
            tag: 'native_flow',

            attrs: {
              v: '9',
              name: 'mixed'
            }
          }
        ]
      },

      {
        tag: 'quality_control',

        attrs: {
          source_type: 'third_party'
        }
      }
    ]
  };
}

function createQuickReplyButton(
  displayText,
  id
) {
  return {
    name: 'quick_reply',

    buttonParamsJson:
      JSON.stringify({
        display_text:
          displayText,

        id
      })
  };
}

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

async function getChatState(chatId) {
  if (!supabase) {
    return null;
  }

  try {
    const {
      data,
      error
    } = await supabase
      .from('chat_states')
      .select(
        'chat_id, mode, paused_until, updated_at'
      )
      .eq(
        'chat_id',
        chatId
      )
      .maybeSingle();

    if (error) {
      console.error(
        '❌ Errore lettura stato chat:',
        error.message
      );

      return null;
    }

    return data || null;

  } catch (e) {
    console.error(
      '❌ Errore Supabase getChatState:',
      e.message
    );

    return null;
  }
}

async function saveChatState(
  chatId,
  mode = 'normal',
  pausedUntil = null
) {
  if (!supabase) {
    return false;
  }

  try {
    const {
      error
    } = await supabase
      .from('chat_states')
      .upsert(
        {
          chat_id:
            chatId,

          mode,

          paused_until:
            pausedUntil,

          updated_at:
            new Date().toISOString()
        },

        {
          onConflict:
            'chat_id'
        }
      );

    if (error) {
      console.error(
        '❌ Errore salvataggio stato:',
        error.message
      );

      return false;
    }

    console.log(
      '💾 Stato chat:',
      chatId,
      '→',
      mode,
      '| pausa:',
      pausedUntil ||
      'nessuna'
    );

    return true;

  } catch (e) {
    console.error(
      '❌ Errore Supabase saveChatState:',
      e.message
    );

    return false;
  }
}

function getAIHistory(chatId) {
  if (!aiConversations.has(chatId)) {
    aiConversations.set(
      chatId,
      [
        {
          role: 'system',
          content:
            AI_SYSTEM_PROMPT
        }
      ]
    );
  }

  return aiConversations.get(
    chatId
  );
}

function clearAIHistory(chatId) {
  aiConversations.delete(
    chatId
  );
}

async function askGroqAI(
  chatId,
  userText
) {
  if (!groq) {
    throw new Error(
      'GROQ_API_KEY non configurata su Railway.'
    );
  }

  const history =
    getAIHistory(chatId);

  history.push({
    role: 'user',
    content: userText
  });

  const response =
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
        'low'
    });

  const answer =
    response
      .choices?.[0]
      ?.message
      ?.content
      ?.trim() ||
    'Non sono riuscito a generare una risposta.';

  history.push({
    role: 'assistant',
    content: answer
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

  return answer;
}

async function pauseForDavide(
  chatId
) {
  const pausedUntil =
    new Date(
      Date.now() +
      DAVIDE_PAUSE_MS
    ).toISOString();

  console.log(
    '👑 Davide ha scritto per primo.'
  );

  console.log(
    '🤫 Bot in pausa per 5 ore.'
  );

  const saved =
    await saveChatState(
      chatId,
      'davide',
      pausedUntil
    );

  clearAIHistory(
    chatId
  );

  if (!saved) {
    console.error(
      '❌ Impossibile salvare la pausa di Davide.'
    );
  } else {
    console.log(
      '⏰ Pausa fino a:',
      pausedUntil
    );
  }

  return saved;
}

async function activateDavideMode(
  sock,
  chat
) {
  console.log(
    '👤 Attivazione modalità Davide...'
  );

  const pausedUntil =
    new Date(
      Date.now() +
      DAVIDE_PAUSE_MS
    ).toISOString();

  const saved =
    await saveChatState(
      chat,
      'davide',
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
          '❌ Non riesco ad attivare la modalità Davide. Riprova.'
      }
    );

    return;
  }

  await sendTrackedMessage(
    sock,
    chat,
    {
      text:
        '👤 *Modalità Davide attivata.*\n\n' +
        'Il bot resterà in pausa per 5 ore in questa chat.\n\n' +
        'Se vuoi riattivarlo prima, scrivi */on*.'
    }
  );
}

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

  if (days) {
    parts.push(
      `${days} ${
        days === 1
          ? 'giorno'
          : 'giorni'
      }`
    );
  }

  if (hours) {
    parts.push(
      `${hours} ${
        hours === 1
          ? 'ora'
          : 'ore'
      }`
    );
  }

  if (minutes) {
    parts.push(
      `${minutes} ${
        minutes === 1
          ? 'minuto'
          : 'minuti'
      }`
    );
  }

  if (
    secs ||
    !parts.length
  ) {
    parts.push(
      `${secs} ${
        secs === 1
          ? 'secondo'
          : 'secondi'
      }`
    );
  }

  return parts.join(', ');
}

async function sendModeSelection(
  sock,
  jid
) {
  console.log(
    '📤 Invio menu Assistente AI / Davide...'
  );

  const buttons = [
    createQuickReplyButton(
      '🤖 Assistente AI',
      'mode_ai'
    ),

    createQuickReplyButton(
      '👤 Parla con Davide',
      'mode_davide'
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
                'Scegli come vuoi continuare:'
            }),

        footer:
          proto.Message
            .InteractiveMessage
            .Footer
            .create({

              text:
                'Davide WhatsApp Bot'
            }),

        nativeFlowMessage:
          proto.Message
            .InteractiveMessage
            .NativeFlowMessage
            .create({

              buttons:
                buttons.map(
                  b =>
                    proto.Message
                      .InteractiveMessage
                      .NativeFlowMessage
                      .NativeFlowButton
                      .create(b)
                ),

              messageParamsJson:
                '{}',

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
            'bot',

          attrs: {
            biz_bot:
              '1'
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
    '✅ Menu inviato.'
  );
}

async function sendCommandsWithButtons(
  sock,
  jid
) {
  const buttons = [
    createQuickReplyButton(
      '/stato',
      '/stato'
    ),

    createQuickReplyButton(
      '/uptime',
      '/uptime'
    ),

    createQuickReplyButton(
      '/info',
      '/info'
    ),

    createQuickReplyButton(
      '/statistiche',
      '/statistiche'
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
                '🤖 *COMANDI BOT*\n\n' +
                'Scegli cosa vuoi fare:\n\n' +
                '📊 */stato* — Controlla lo stato attuale del bot.\n\n' +
                '🕐 */uptime* — Mostra da quanto tempo il bot è attivo.\n\n' +
                'ℹ️ */info* — Mostra le informazioni tecniche del bot.\n\n' +
                '📈 */statistiche* — Mostra le statistiche di utilizzo.\n\n' +
                '👇 Premi uno dei pulsanti qui sotto.'
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
                  b =>
                    proto.Message
                      .InteractiveMessage
                      .NativeFlowMessage
                      .NativeFlowButton
                      .create(b)
                ),

              messageParamsJson:
                '{}',

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
            'bot',

          attrs: {
            biz_bot:
              '1'
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

    if (supabase) {
      try {
        const {
          error
        } = await supabase
          .from('chat_states')
          .select(
            'chat_id',
            {
              head:
                true,

              count:
                'exact'
            }
          );

        if (error) {
          console.error(
            '❌ Supabase non raggiungibile:',
            error.message
          );
        } else {
          console.log(
            '✅ Connessione Supabase verificata.'
          );
        }

      } catch (e) {
        console.error(
          '❌ Errore test Supabase:',
          e.message
        );
      }
    }

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
              'silent'
          }),

        browser:
          Browsers.macOS(
            'Google Chrome'
          ),

        printQRInTerminal:
          false,

        markOnlineOnConnect:
          false,

        syncFullHistory:
          false
      });

    sock.ev.on(
      'creds.update',
      saveCreds
    );

    sock.ev.on(
      'connection.update',
      async update => {

        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        console.log(
          '📡 Stato WhatsApp:',
          connection ||
          'waiting'
        );

        if (qr) {
          currentQR =
            qr;

          console.log(
            '📷 QR Code WhatsApp disponibile.'
          );
        }

        if (
          connection ===
          'open'
        ) {
          currentQR =
            null;

          whatsappConnected =
            true;

          starting =
            false;

          console.log(
            '=========================================='
          );

          console.log(
            '        ✅ WHATSAPP COLLEGATO'
          );

          console.log(
            `        📦 VERSIONE: ${BOT_VERSION}`
          );

          console.log(
            '=========================================='
          );
        }

        if (
          connection ===
          'close'
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
            '❌ Connessione WhatsApp chiusa:',
            statusCode
          );

          starting =
            false;

          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {
            console.log(
              '🚪 Sessione WhatsApp disconnessa.'
            );

            return;
          }

          console.log(
            '🔄 Riconnessione tra 5 secondi...'
          );

          setTimeout(
            startWhatsApp,
            5000
          );
        }
      }
    );

    sock.ev.on(
      'messages.upsert',
      async ({
        messages,
        type
      }) => {

        console.log(
          `📨 messages.upsert: ${type} (${messages.length})`
        );

        for (
          const message of messages
        ) {

          try {

            if (
              !message?.message
            ) {
              continue;
            }

            const chat =
              message.key
                .remoteJid;

            if (
              !isPrivateChat(
                chat
              )
            ) {
              console.log(
                '👥 Chat non privata. Ignorata:',
                chat
              );

              continue;
            }

            const fromMe =
              message.key
                .fromMe;

            const text =
              getMessageText(
                message.message
              ).trim();

            const buttonId =
              getButtonId(
                message.message
              ).trim();

            console.log(
              '📩 Messaggio:',
              chat,
              '| daMe:',
              fromMe,
              '| testo:',
              text ||
              '(nessun testo)',
              '| pulsante:',
              buttonId ||
              '-'
            );

            // ==========================================
            // MESSAGGIO INVIATO DA DAVIDE
            // ==========================================

            if (fromMe) {

              if (
                isBotMessage(
                  message.key.id
                )
              ) {

                console.log(
                  '🤖 Messaggio del bot ignorato.'
                );

                continue;
              }

              await pauseForDavide(
                chat
              );

              continue;
            }

            messagesReceived++;

            const chatState =
              await getChatState(
                chat
              );

            const lowerText =
              text.toLowerCase();

            // ==========================================
            // /ON
            // ==========================================

            if (
              lowerText ===
              '/on'
            ) {

              commandsExecuted++;

              await saveChatState(
                chat,
                'normal',
                null
              );

              clearAIHistory(
                chat
              );

              console.log(
                '🟢 /on: bot riattivato, nessuna risposta.'
              );

              continue;
            }

            // ==========================================
            // MODALITÀ DAVIDE
            // ==========================================

            if (
              chatState?.mode ===
              'davide'
            ) {

              const pausedUntil =
                chatState
                  .paused_until
                  ? new Date(
                      chatState
                        .paused_until
                    ).getTime()
                  : 0;

              if (
                pausedUntil >
                Date.now()
              ) {

                console.log(
                  '🤫 Bot in pausa fino a:',
                  chatState.paused_until
                );

                continue;
              }

              await saveChatState(
                chat,
                'waiting_choice',
                null
              );

              await sendModeSelection(
                sock,
                chat
              );

              continue;
            }

            // ==========================================
            // MODALITÀ AI
            // ==========================================

            if (
              chatState?.mode ===
              'ai'
            ) {

              if (!text) {
                continue;
              }

              try {

                const answer =
                  await askGroqAI(
                    chat,
                    text
                  );

                await sendTrackedMessage(
                  sock,
                  chat,
                  {
                    text:
                      answer
                  }
                );

                console.log(
                  '✅ Risposta AI inviata.'
                );

              } catch (e) {

                console.error(
                  '❌ Errore Groq AI:',
                  e.message
                );

                await sendTrackedMessage(
                  sock,
                  chat,
                  {
                    text:
                      "❌ Al momento non riesco a rispondere con l'Assistente AI. Riprova tra poco."
                  }
                );
              }

              continue;
            }

            // ==========================================
            // PULSANTE DAVIDE
            // ==========================================

            if (
              buttonId ===
              'mode_davide'
            ) {

              await activateDavideMode(
                sock,
                chat
              );

              continue;
            }

            // ==========================================
            // PULSANTE AI
            // ==========================================

            if (
              buttonId ===
              'mode_ai'
            ) {

              const saved =
                await saveChatState(
                  chat,
                  'ai',
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
                    '🤖 *Assistente AI attivato.*\n\n' +
                    'Puoi chiedermi qualsiasi cosa. Ad esempio:\n' +
                    '• ☀️ Che tempo farà domani?\n' +
                    '• 🕐 Che ore sono?\n' +
                    '• 🌐 Traduci questa frase\n' +
                    '• 🧮 Fammi un calcolo\n' +
                    '• 📝 Riassumi questo testo\n' +
                    '• 💬 Oppure scrivimi semplicemente la tua domanda.\n\n' +
                    'Scrivi qui sotto 👇'
                }
              );

              continue;
            }

            // ==========================================
            // /COMANDI
            // ==========================================

            if (
              lowerText ===
              '/comandi'
            ) {

              commandsExecuted++;

              await sendCommandsWithButtons(
                sock,
                chat
              );

              continue;
            }

            // ==========================================
            // /STATO
            // ==========================================

            if (
              lowerText ===
              '/stato'
            ) {

              commandsExecuted++;

              await sendTrackedMessage(
                sock,
                chat,
                {
                  text:
                    '📊 *STATO BOT*\n\n' +
                    `📡 WhatsApp: ${
                      whatsappConnected
                        ? '🟢 Connesso'
                        : '🔴 Disconnesso'
                    }\n` +
                    '🤖 Bot: 🟢 Attivo'
                }
              );

              continue;
            }

            // ==========================================
            // /UPTIME
            // ==========================================

            if (
              lowerText ===
              '/uptime'
            ) {

              commandsExecuted++;

              await sendTrackedMessage(
                sock,
                chat,
                {
                  text:
                    '🕐 *UPTIME BOT*\n\n' +
                    'Il bot è attivo da:\n\n' +
                    `*${getUptime()}*`
                }
              );

              continue;
            }

            // ==========================================
            // /INFO
            // ==========================================

            if (
              lowerText ===
              '/info'
            ) {

              commandsExecuted++;

              await sendTrackedMessage(
                sock,
                chat,
                {
                  text:
                    'ℹ️ *INFORMAZIONI BOT*\n\n' +
                    '🤖 Nome: Davide WhatsApp Bot\n' +
                    `📦 Versione: ${BOT_VERSION}\n` +
                    '⚡ Motore: Baileys\n' +
                    '🟢 Sistema: Linux'
                }
              );

              continue;
            }

            // ==========================================
            // /STATISTICHE
            // ==========================================

            if (
              lowerText ===
              '/statistiche'
            ) {

              commandsExecuted++;

              await sendTrackedMessage(
                sock,
                chat,
                {
                  text:
                    '📈 *STATISTICHE BOT*\n\n' +
                    `📥 Messaggi ricevuti: ${messagesReceived}\n` +
                    `📤 Messaggi inviati: ${messagesSent}\n` +
                    `⚡ Comandi eseguiti: ${commandsExecuted}`
                }
              );

              continue;
            }

            // ==========================================
            // PRIMO MESSAGGIO DELLA PERSONA
            // ==========================================

            if (
              !chatState ||
              chatState.mode ===
              'normal'
            ) {

              console.log(
                '👤 La persona ha scritto per prima.'
              );

              await saveChatState(
                chat,
                'waiting_choice',
                null
              );

              await sendModeSelection(
                sock,
                chat
              );

              continue;
            }

            // ==========================================
            // WAITING CHOICE
            // ==========================================

            if (
              chatState.mode ===
              'waiting_choice'
            ) {

              console.log(
                '⏳ La persona ha ignorato i pulsanti.'
              );

              console.log(
                '👤 Il nuovo messaggio viene interpretato come richiesta di parlare con Davide.'
              );

              await activateDavideMode(
                sock,
                chat
              );

              continue;
            }

          } catch (error) {

            console.error(
              '❌ Errore elaborazione messaggio:',
              error
            );
          }
        }
      }
    );

  } catch (error) {

    console.error(
      '❌ Errore avvio WhatsApp:',
      error
    );

    starting =
      false;

    whatsappConnected =
      false;

    setTimeout(
      startWhatsApp,
      5000
    );
  }
}

module.exports = {
  startWhatsApp,
  getQR
};
