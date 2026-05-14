// Supabase Edge Function (Deno) - Webhook Telegram pour Je Gjobe
//
// Remplace le polling node-telegram-bot-api precedemment heberge sur Railway.
// Telegram POST chaque update directement sur cette URL.
//
// Deploy : supabase functions deploy telegram-bot --no-verify-jwt
// Secrets requis :
//   TELEGRAM_BOT_TOKEN              (token bot)
//   TELEGRAM_WEBHOOK_SECRET         (chaine aleatoire, ex: openssl rand -hex 32)
// Secrets optionnels :
//   KIMI_API_KEY  + KIMI_BASE_URL + KIMI_MODEL    (chatbot IA Moonshot/NVIDIA)
//   ANTHROPIC_API_KEY + ANTHROPIC_MODEL           (chatbot IA Claude, fallback)
//   TELEGRAM_PAYMENT_PROVIDER_TOKEN               (paiement Telegram Stars/XOF)
//
// Apres deploy, enregistrer le webhook une fois :
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FN_URL>&secret_token=<SECRET>&drop_pending_updates=true"

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const WEBHOOK_SECRET     = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const KIMI_API_KEY  = Deno.env.get('KIMI_API_KEY');
// Auto-detect NVIDIA NIM (cle "nvapi-...") sinon Moonshot par defaut
const IS_NVIDIA = !!KIMI_API_KEY && KIMI_API_KEY.startsWith('nvapi-');
const KIMI_BASE_URL = (Deno.env.get('KIMI_BASE_URL')
  ?? (IS_NVIDIA ? 'https://integrate.api.nvidia.com/v1' : 'https://api.moonshot.ai/v1')).replace(/\/$/, '');
const KIMI_MODEL    = Deno.env.get('KIMI_MODEL')
  ?? (IS_NVIDIA ? 'moonshotai/kimi-k2-instruct' : 'kimi-k2-turbo-preview');

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL   = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-20250514';

// (TELEGRAM_PAYMENT_PROVIDER_TOKEN n'est plus utilise : Stars = paiement natif sans provider)
const ADMIN_IDS = (Deno.env.get('ADMIN_TELEGRAM_IDS') ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);

// ===========================================================================
// Telegram Bot API helpers
// ===========================================================================
async function tg<T = any>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`tg ${method} ${res.status}`, await res.text().catch(() => ''));
  return res.json() as Promise<T>;
}

const sendMessage = (chat_id: number, text: string, extra: Record<string, unknown> = {}) =>
  tg('sendMessage', { chat_id, text, ...extra });

const sendTyping = (chat_id: number) =>
  tg('sendChatAction', { chat_id, action: 'typing' });

// ===========================================================================
// Reponses statiques
// ===========================================================================
const WELCOME =
  "👋 Bienvenue sur le bot *Je Gjobe*.\n\n" +
  "Je peux t'aider à trouver ou proposer des petits boulots, " +
  "améliorer ton profil, et rédiger de bonnes annonces.\n\n" +
  "Tape /help pour voir les commandes, ou pose ta question directement.";

const HELP =
  "🧾 *Commandes Je Gjobe*\n\n" +
  "/start - Présentation\n" +
  "/help - Cette aide\n" +
  "/exemple_annonce - Exemple d'annonce bien rédigée\n" +
  "/conseils_profil - Conseils pour optimiser ton profil\n\n" +
  "Tu peux aussi écrire ta question (sans /) - l'IA te répondra.";

const SAMPLE_AD =
  "📌 *Exemple d'annonce Je Gjobe*\n\n" +
  "*Titre* : Ménage appartement 2h - Centre-ville\n\n" +
  "*Description* :\n" +
  "Je recherche une personne sérieuse et ponctuelle pour un ménage complet " +
  "d'un appartement de 45m² (salon, cuisine, salle de bain) une fois par semaine.\n\n" +
  "*Détails* :\n" +
  "• Durée : 2 heures\n" +
  "• Jour : samedi matin de préférence\n" +
  "• Matériel fourni sur place\n\n" +
  "*Tarif* : 30€ pour la prestation.\n\n" +
  "N'hésite pas à adapter cet exemple avec tes propres informations.";

const PROFILE_TIPS =
  "✨ *Conseils pour un bon profil Je Gjobe*\n\n" +
  "1️⃣ Ajoute une photo de profil claire et professionnelle.\n" +
  "2️⃣ Décris précisément tes compétences (ex : ménage, baby-sitting, plomberie...).\n" +
  "3️⃣ Indique ta zone géographique et tes disponibilités.\n" +
  "4️⃣ Mets en avant tes expériences ou avis clients si tu en as.\n" +
  "5️⃣ Soigne l'orthographe, ça donne confiance.\n\n" +
  "Tu peux aussi m'envoyer la description de ton profil, et je t'aiderai à l'améliorer.";

// ===========================================================================
// Chatbot IA - Kimi puis fallback Anthropic
// ===========================================================================
const SYSTEM_PROMPT =
  "Tu es l'assistant officiel de l'application Je Gjobe (marketplace de petits boulots " +
  "en Afrique de l'Ouest : ménage, baby-sitter, plombier, livreur, dev...). " +
  "Tu aides les utilisateurs à trouver ou proposer des missions, améliorer leur profil, " +
  "rédiger de bonnes annonces. Réponds en français clair, court, concret.";

// Stocke la derniere erreur pour la remonter a l'user (debug)
let lastAiError: string | null = null;

async function callKimi(text: string): Promise<string | null> {
  if (!KIMI_API_KEY) {
    lastAiError = 'KIMI_API_KEY missing';
    return null;
  }
  try {
    let res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${KIMI_API_KEY}` },
      body: JSON.stringify({
        model: KIMI_MODEL,
        temperature: 0.4,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
    });

    // NVIDIA NIM peut renvoyer 202 + NVCF-REQID -> polling status/{id}
    if (res.status === 202) {
      const reqId = res.headers.get('NVCF-REQID') ?? res.headers.get('nvcf-reqid');
      if (!reqId) {
        console.error('Kimi 202 sans NVCF-REQID');
        return null;
      }
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1500));
        res = await fetch(`${KIMI_BASE_URL}/status/${reqId}`, {
          headers: { Authorization: `Bearer ${KIMI_API_KEY}` },
        });
        if (res.status === 200) break;
        if (res.status !== 202) {
          console.error('Kimi poll error', res.status, await res.text().catch(() => ''));
          return null;
        }
      }
      if (res.status !== 200) {
        console.error('Kimi polling timeout');
        return null;
      }
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('Kimi error', res.status, txt);
      lastAiError = `Kimi HTTP ${res.status} | url=${KIMI_BASE_URL}/chat/completions | model='${KIMI_MODEL}' | nvidia=${IS_NVIDIA} | body=${txt.slice(0, 80)}`;
      return null;
    }
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    if (!out) lastAiError = 'Kimi reponse vide';
    return out || null;
  } catch (e) {
    lastAiError = `Kimi exception: ${(e as Error).message}`;
    console.error('Kimi exception', e);
    return null;
  }
}

async function callAnthropic(text: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }],
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('Anthropic error', res.status, txt);
      lastAiError = `Anthropic HTTP ${res.status} - ${txt.slice(0, 120)}`;
      return null;
    }
    const data = await res.json();
    const block = data?.content?.find?.((b: { type: string }) => b.type === 'text');
    const out = ((block as { text?: string })?.text ?? '').trim();
    if (!out) lastAiError = 'Anthropic reponse vide';
    return out || null;
  } catch (e) {
    lastAiError = `Anthropic exception: ${(e as Error).message}`;
    console.error('Anthropic exception', e);
    return null;
  }
}

async function callAi(text: string): Promise<string> {
  lastAiError = null;
  const kimi = await callKimi(text);
  if (kimi) return kimi;
  const anthropic = await callAnthropic(text);
  if (anthropic) return anthropic;
  if (!KIMI_API_KEY && !ANTHROPIC_API_KEY) {
    return "⚠️ Chatbot IA non configuré : ajoute KIMI_API_KEY ou ANTHROPIC_API_KEY dans Supabase > Edge Functions > Secrets.";
  }
  return `😕 L'IA n'arrive pas à répondre.\n\n_Détail : ${lastAiError ?? 'erreur inconnue'}_`;
}

// ===========================================================================
// Activation Premium serveur (Phase 4 - prepare)
// ===========================================================================
async function activatePremium(telegramId: number, days = 30) {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const until = new Date(Date.now() + days * 86400_000).toISOString();
  const { error } = await supabase
    .from('profiles')
    .update({ is_premium: true, premium_until: until })
    .eq('telegram_id', telegramId);
  if (error) console.error('activatePremium error', error);
}

// ===========================================================================
// Handler principal
// ===========================================================================
async function handleUpdate(update: any): Promise<void> {
  const msg = update.message ?? update.edited_message;
  if (!msg) return;

  const chatId: number = msg.chat.id;
  const fromId: number | undefined = msg.from?.id;
  const text: string = msg.text ?? '';

  // 1. Paiement Telegram réussi
  if (msg.successful_payment) {
    if (fromId) await activatePremium(fromId, 30);
    await sendMessage(
      chatId,
      "✅ Paiement reçu ! Ton compte *Je Gjobe Premium* est activé pour 30 jours.",
      { parse_mode: 'Markdown' },
    );
    return;
  }

  // 2. WebApp data (demande d'abonnement Premium depuis la mini-app)
  if (msg.web_app_data?.data) {
    try {
      const data = JSON.parse(msg.web_app_data.data);
      if (data.action === 'premium_subscribe') {
        // Telegram Stars (XTR) : pas besoin de provider_token, integration native.
        // 300 Stars ~ 4 USD ~ 2400 XOF. Telegram prend ~30% de commission.
        await tg('sendInvoice', {
          chat_id: chatId,
          title: 'Je Gjobe Premium',
          description: 'Abonnement mensuel Je Gjobe Premium - acces visibilite premium pendant 30 jours.',
          payload: 'premium-pass',
          currency: 'XTR',
          prices: [{ label: 'Je Gjobe Premium - 1 mois', amount: 300 }],
        });
        return;
      }
    } catch (e) {
      console.error('web_app_data parse error', e);
      await sendMessage(chatId, "Impossible de traiter la demande de paiement.");
      return;
    }
  }

  // 3. Commandes (insensibles a la casse + accepte avec ou sans underscore)
  const cmd = text.split(' ')[0].toLowerCase().replace(/_/g, '');
  switch (cmd) {
    case '/start':                                          return void await sendMessage(chatId, WELCOME,       { parse_mode: 'Markdown' });
    case '/help':                                           return void await sendMessage(chatId, HELP,          { parse_mode: 'Markdown' });
    case '/exempleannonce':                                 return void await sendMessage(chatId, SAMPLE_AD,     { parse_mode: 'Markdown' });
    case '/conseilsprofil':                                 return void await sendMessage(chatId, PROFILE_TIPS,  { parse_mode: 'Markdown' });
  }

  // 4. Texte libre -> IA (ignore les autres commandes inconnues)
  if (!text || text.startsWith('/')) {
    if (text.startsWith('/')) {
      await sendMessage(chatId, "Commande inconnue. Tape /help pour voir la liste.");
    }
    return;
  }
  await sendTyping(chatId);
  const answer = await callAi(text);
  await sendMessage(chatId, answer);
}

// ===========================================================================
// Pre-checkout query (obligatoire pour Telegram payments)
// ===========================================================================
async function handlePreCheckout(query: any): Promise<void> {
  await tg('answerPreCheckoutQuery', { pre_checkout_query_id: query.id, ok: true });
}

// ===========================================================================
// Callback query : boutons inline admin sur les preuves de paiement Wave/Djamo
// ===========================================================================
async function handleCallbackQuery(cb: any): Promise<void> {
  const data: string = cb.data ?? '';
  const fromId: number = cb.from?.id;
  const msg = cb.message;
  const chatId: number = msg?.chat?.id;
  const messageId: number = msg?.message_id;

  // Securite : seuls les admins declares peuvent traiter
  if (!ADMIN_IDS.includes(String(fromId))) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Action reservee aux admins.', show_alert: true });
    return;
  }

  // Format attendu : proof:approve:<uuid>  ou  proof:reject:<uuid>
  const m = /^proof:(approve|reject):([0-9a-f-]{36})$/i.exec(data);
  if (!m) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id });
    return;
  }
  const action = m[1] as 'approve' | 'reject';
  const proofId = m[2];

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Recupere la preuve + l'user
  const { data: proof, error: proofErr } = await supabase
    .from('payment_proofs')
    .select('id, applicant_id, status, method, profiles(telegram_id, name)')
    .eq('id', proofId)
    .maybeSingle();
  if (proofErr || !proof) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Preuve introuvable', show_alert: true });
    return;
  }
  if (proof.status !== 'pending') {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `Deja traitee (${proof.status})`, show_alert: true });
    return;
  }

  const targetTelegramId: number | undefined = (proof as any).profiles?.telegram_id;
  const targetName: string = (proof as any).profiles?.name ?? 'utilisateur';

  if (action === 'approve') {
    // Marque la preuve comme approuvee + active Premium
    await supabase.from('payment_proofs').update({
      status: 'approved',
      processed_at: new Date().toISOString(),
      processed_by: fromId,
    }).eq('id', proofId);

    if (targetTelegramId) await activatePremium(targetTelegramId, 30);

    // Notifie l'user
    if (targetTelegramId) {
      await sendMessage(targetTelegramId,
        `✅ Ta preuve ${proof.method.toUpperCase()} a ete validee !\n\n` +
        `Ton statut *Je Gjobe Premium* est actif pour 30 jours.`,
        { parse_mode: 'Markdown' });
    }

    // Update le caption + supprime les boutons sur le message admin
    await tg('editMessageCaption', {
      chat_id: chatId,
      message_id: messageId,
      caption: (msg.caption ?? '') + `\n\n✅ *APPROUVEE* par admin ${fromId}`,
      parse_mode: 'Markdown',
    });
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `Premium active pour ${targetName} ✅` });
    return;
  }

  // action === 'reject'
  await supabase.from('payment_proofs').update({
    status: 'rejected',
    processed_at: new Date().toISOString(),
    processed_by: fromId,
    reject_reason: 'Refuse par admin via Telegram',
  }).eq('id', proofId);

  if (targetTelegramId) {
    await sendMessage(targetTelegramId,
      `❌ Ta preuve de paiement ${proof.method.toUpperCase()} n'a pas pu etre validee.\n\n` +
      `Verifie le montant (2 000 XOF), le destinataire et la date, puis renvoie une nouvelle preuve depuis l'app.`);
  }

  await tg('editMessageCaption', {
    chat_id: chatId,
    message_id: messageId,
    caption: (msg.caption ?? '') + `\n\n❌ *REFUSEE* par admin ${fromId}`,
    parse_mode: 'Markdown',
  });
  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `Preuve de ${targetName} refusee` });
}

// ===========================================================================
// HTTP entry point
// ===========================================================================
Deno.serve(async (req) => {
  console.log('[telegram-bot] request received', req.method, req.url);

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  if (WEBHOOK_SECRET) {
    const got = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (got !== WEBHOOK_SECRET) {
      console.warn('[telegram-bot] secret mismatch');
      return new Response('forbidden', { status: 403 });
    }
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.error('[telegram-bot] TELEGRAM_BOT_TOKEN missing');
    return new Response('TELEGRAM_BOT_TOKEN missing', { status: 500 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch (e) {
    console.error('[telegram-bot] bad json', e);
    return new Response('bad json', { status: 400 });
  }

  console.log('[telegram-bot] update', JSON.stringify(update).slice(0, 500));

  try {
    if (update.pre_checkout_query) {
      await handlePreCheckout(update.pre_checkout_query);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else {
      await handleUpdate(update);
    }
  } catch (err) {
    console.error('[telegram-bot] handler error', err);
  }

  return new Response('ok');
});
