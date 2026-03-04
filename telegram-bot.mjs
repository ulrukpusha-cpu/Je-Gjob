import TelegramBot from 'node-telegram-bot-api';
import OpenAI from 'openai';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Charger .env.local depuis la racine du projet
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '.env.local');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

if (!telegramToken) {
  console.error('TELEGRAM_BOT_TOKEN manquant dans les variables d’environnement.');
  process.exit(1);
}

if (!openaiApiKey) {
  console.error('OPENAI_API_KEY manquant dans les variables d’environnement.');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: openaiApiKey });
const bot = new TelegramBot(telegramToken, { polling: true });
const paymentProviderToken = process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN;

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "👋 Bienvenue sur le bot *Je Gjobe*.\n\n" +
      "Je peux t'aider à trouver ou proposer des petits boulots, à améliorer ton profil, et à rédiger de bonnes annonces.\n\n" +
      "Tape /help pour voir les commandes disponibles, ou envoie simplement une question en texte libre.",
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage =
    "🧾 *Commandes disponibles Je Gjobe*\n\n" +
    "/start - Présentation du bot\n" +
    "/help - Afficher cette aide\n" +
    "/exemple_annonce - Exemple d'annonce bien rédigée\n" +
    "/conseils_profil - Conseils pour optimiser ton profil\n\n" +
    "Tu peux aussi simplement écrire ta question (sans /) et je te répondrai avec l'IA.";
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/exemple_annonce/, (msg) => {
  const chatId = msg.chat.id;
  const sample =
    "📌 *Exemple d'annonce Je Gjobe*\n\n" +
    "*Titre* : Ménage appartement 2h - Centre-ville\n\n" +
    "*Description* :\n" +
    "Je recherche une personne sérieuse et ponctuelle pour un ménage complet d'un appartement de 45m² (salon, cuisine, salle de bain) une fois par semaine.\n\n" +
    "*Détails* :\n" +
    "• Durée : 2 heures\n" +
    "• Jour : samedi matin de préférence\n" +
    "• Matériel fourni sur place\n\n" +
    "*Tarif* : 30€ pour la prestation.\n\n" +
    "N'hésite pas à adapter cet exemple avec tes propres informations.";
  bot.sendMessage(chatId, sample, { parse_mode: 'Markdown' });
});

bot.onText(/\/conseils_profil/, (msg) => {
  const chatId = msg.chat.id;
  const tips =
    "✨ *Conseils pour un bon profil Je Gjobe*\n\n" +
    "1️⃣ Ajoute une photo de profil claire et professionnelle.\n" +
    "2️⃣ Décris précisément tes compétences (ex : ménage, babysitting, plomberie...).\n" +
    "3️⃣ Indique ta zone géographique et tes disponibilités.\n" +
    "4️⃣ Mets en avant tes expériences ou avis clients si tu en as.\n" +
    "5️⃣ Soigne l'orthographe, ça donne confiance.\n\n" +
    "Tu peux aussi m'envoyer la description de ton profil, et je t'aiderai à l'améliorer.";
  bot.sendMessage(chatId, tips, { parse_mode: 'Markdown' });
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Paiement Telegram réussi
  if (msg.successful_payment) {
    console.log('Paiement réussi :', msg.successful_payment);
    await bot.sendMessage(
      chatId,
      "✅ Paiement reçu ! Ton compte *Je Gjobe Premium* est activé. Ouvre à nouveau la webapp si besoin.",
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Données envoyées depuis la WebApp (ex: demande d'abonnement premium)
  if (msg.web_app_data && msg.web_app_data.data) {
    try {
      const data = JSON.parse(msg.web_app_data.data);
      if (data.action === 'premium_subscribe') {
        if (!paymentProviderToken) {
          await bot.sendMessage(chatId, "Le paiement Telegram n'est pas encore configuré côté serveur.");
          return;
        }
        await bot.sendInvoice(
          chatId,
          'Je Gjobe Premium',
          "Abonnement mensuel Je Gjobe Premium (2 000 XOF).",
          'premium-pass', // payload
          paymentProviderToken,
          'XOF',
          [
            { label: 'Je Gjobe Premium - 1 mois', amount: 200000 } // 2 000 XOF en plus petite unité
          ]
        );
        return;
      }
    } catch (e) {
      console.error('Erreur traitement web_app_data :', e);
      await bot.sendMessage(chatId, "Impossible de traiter la demande de paiement depuis la WebApp.");
      return;
    }
  }

  const text = msg.text || '';

  // On ignore les commandes déjà gérées plus haut
  if (!text || text.startsWith('/')) {
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');

    const completion = await openai.chat.completions.create({
      model: openaiModel,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            "Tu es l'assistant officiel de l'application Je Gjobe. " +
            "Tu aides les utilisateurs à trouver ou proposer des petits boulots, " +
            "à rédiger de bonnes annonces, et à utiliser la plateforme en français clair et simple."
        },
        { role: 'user', content: text }
      ]
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() || "Désolé, je n'ai pas réussi à générer une réponse.";
    await bot.sendMessage(chatId, answer);
  } catch (error) {
    console.error('Erreur OpenAI ou Telegram :', error);
    await bot.sendMessage(
      chatId,
      "😕 Une erreur est survenue en parlant avec l'IA. Réessaie dans un instant."
    );
  }
});

console.log('Bot Telegram Je Gjobe démarré.');

