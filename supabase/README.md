# Supabase — Je Gjobe

## Appliquer une migration

1. Ouvre le [dashboard Supabase](https://supabase.com/dashboard) → projet `je-gjobe`
2. Menu de gauche → **SQL Editor**
3. **New query**
4. Copie-colle le contenu du fichier `migrations/000X_*.sql`
5. **Run** (Ctrl+Enter)

Vérifier que tout s'est bien créé :

- **Table Editor** → tu dois voir `profiles`, `jobs`, `applications`, `reviews`, `notifications`
- **Authentication → Policies** → chaque table doit avoir RLS activée (bouclier vert)

## Storage bucket (à créer manuellement après la migration)

Dashboard → **Storage** → **New bucket** :
- Name : `avatars`
- Public bucket : ✅ (les photos de profil sont publiques)
- File size limit : `2 MB`
- Allowed MIME types : `image/jpeg, image/png, image/webp`

Puis : `avatars` → **Policies** → **New policy** → template "Allow authenticated uploads" en restreignant le path à `auth.uid()::text`.

## Edge Functions

### `verify-telegram-init`

Vérifie le HMAC du `initData` Telegram et émet un magic link à usage unique
que le frontend échange contre une session Supabase via `verifyOtp`.

#### Déploiement

**Option A — Supabase CLI (recommandé)**

```powershell
# 1. Installer la CLI une seule fois
npm install -g supabase

# 2. Se connecter
supabase login

# 3. Lier le projet local au projet Supabase
supabase link --project-ref dgjbibgubjcfemwosxmw

# 4. Définir les secrets de la fonction
supabase secrets set TELEGRAM_BOT_TOKEN=xxxxxxxxxxxxx
supabase secrets set APP_URL=https://votre-app.vercel.app

# 5. Déployer
supabase functions deploy verify-telegram-init --no-verify-jwt
```

Le flag `--no-verify-jwt` est requis car la fonction est appelée AVANT que
l'utilisateur ait une session — le `initData` est l'auth.

**Option B — Dashboard (copier-coller)**

1. Dashboard → **Edge Functions** → **Create a new function** → name : `verify-telegram-init`
2. Coche **Verify JWT with legacy secret** : ❌ DÉCOCHÉ
3. Copie-colle le contenu de `supabase/functions/verify-telegram-init/index.ts`
4. **Deploy**
5. Dashboard → **Settings → Edge Functions → Manage secrets** :
   - `TELEGRAM_BOT_TOKEN` = ton token de bot Telegram
   - `APP_URL` = l'URL Vercel de l'app (ex: `https://je-gjobe.vercel.app`)

#### Test rapide

```powershell
curl -X POST `
  "https://dgjbibgubjcfemwosxmw.supabase.co/functions/v1/verify-telegram-init" `
  -H "apikey: VOTRE_ANON_KEY" `
  -H "content-type: application/json" `
  -d '{\"initData\":\"foo=bar\"}'
```

Tu dois recevoir `{"error":"invalid initData: no hash"}` — c'est normal, ça
prouve juste que la fonction est joignable. Le vrai test se fait depuis
Telegram Web App via `signInWithTelegram()` côté frontend.

---

### `telegram-bot` (webhook)

Remplace l'ancien bot polling Node hébergé sur Railway. Telegram POST chaque
update directement sur cette fonction.

#### Déploiement

**Via Dashboard** (le plus simple) :
1. Edge Functions → **Deploy a new function** → **Via Editor**
2. Name : `telegram-bot`
3. **Décoche "Verify JWT"**
4. Colle le contenu de `supabase/functions/telegram-bot/index.ts`
5. **Deploy**

#### Secrets à configurer

Dashboard → Edge Functions → **Secrets** :

| Name | Valeur | Obligatoire |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token du bot (déjà set pour `verify-telegram-init`) | ✅ |
| `TELEGRAM_WEBHOOK_SECRET` | Chaîne aléatoire (ex: `openssl rand -hex 32`) | ✅ recommandé |
| `KIMI_API_KEY` | Clé Moonshot ou NVIDIA NIM | optionnel (chatbot IA) |
| `KIMI_BASE_URL` | `https://api.moonshot.ai/v1` ou `https://integrate.api.nvidia.com/v1` | optionnel |
| `KIMI_MODEL` | `kimi-k2-turbo-preview` ou `moonshotai/kimi-k2-instruct` | optionnel |
| `ANTHROPIC_API_KEY` | Clé Claude | optionnel (fallback IA) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | optionnel |
| `TELEGRAM_PAYMENT_PROVIDER_TOKEN` | Token provider XOF (BotFather → Payments) | optionnel (Premium) |

#### Enregistrer le webhook côté Telegram

Une fois déployée, dis à Telegram d'envoyer les updates ici (à faire UNE FOIS) :

```powershell
$BOT_TOKEN  = "1234567890:AAH..."
$FN_URL     = "https://dgjbibgubjcfemwosxmw.supabase.co/functions/v1/telegram-bot"
$SECRET     = "ton-webhook-secret-aleatoire"

curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook?url=$FN_URL&secret_token=$SECRET&drop_pending_updates=true&allowed_updates=[\"message\",\"edited_message\",\"pre_checkout_query\"]"
```

Réponse attendue : `{"ok":true,"result":true,"description":"Webhook was set"}`.

Vérifier l'état du webhook :
```powershell
curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

Pour le supprimer (revenir au polling) :
```powershell
curl "https://api.telegram.org/bot$BOT_TOKEN/deleteWebhook"
```

#### Migration depuis Railway

Une fois le webhook actif et testé (`/start` répond) :
1. Suspendre / supprimer le service Railway → plus aucun coût
2. Le fichier local `telegram-bot.mjs` reste pour dev local éventuel mais
   n'est plus utilisé en prod.

---

## Phase 4 — Premium serveur

L'activation Premium se fait UNIQUEMENT côté serveur :
1. L'utilisateur paie via Telegram (sendInvoice → succès)
2. Telegram envoie `successful_payment` au webhook bot
3. La fonction `telegram-bot` appelle `activatePremium(telegram_id)` avec
   la `service_role_key` (bypass RLS, bypass trigger protect_premium_columns)
4. Realtime notifie le frontend → badge Premium apparaît instantanément

### Activer les paiements Telegram (provider)

Telegram Payments demande un **provider token** (le bot "facture" via un fournisseur).

**Option 1 : Telegram Stars (le plus simple)**

Stars est la monnaie native Telegram, intégrée, **pas besoin de provider externe**.
Il faut :
1. Modifier le code de `sendInvoice` dans `telegram-bot/index.ts` pour utiliser
   `currency: 'XTR'` (Telegram Stars) au lieu de `'XOF'`
2. Le `provider_token` n'est PAS requis pour Stars
3. Les amounts sont exprimés en Stars (1 Star ≈ 0.013 USD environ)

Exemple :
```ts
await tg('sendInvoice', {
  chat_id: chatId,
  title: 'Je Gjobe Premium',
  description: 'Abonnement mensuel',
  payload: 'premium-pass',
  currency: 'XTR',
  prices: [{ label: 'Premium - 1 mois', amount: 100 }], // 100 Stars
  // pas de provider_token
});
```

**Option 2 : Provider XOF / EUR (Stripe, etc.)**

1. Sur Telegram, ouvre `@BotFather`
2. `/mybots` → choisis ton bot → **Payments**
3. Choisis un provider compatible avec ton pays/devise
4. Suis l'assistant → tu obtiens un `provider_token` (ex: `1234567:TEST:abc...`)
5. Mets-le dans Edge Function Secrets : `TELEGRAM_PAYMENT_PROVIDER_TOKEN`
6. Redéploie `telegram-bot` (ou attends une nouvelle invocation)

### Test du flow Premium

1. Dans la WebApp : clique "Passer Premium"
2. Le bot reçoit `web_app_data.action === 'premium_subscribe'` → `sendInvoice`
3. Tu paies dans Telegram (mode test si provider est en mode test)
4. Telegram envoie `pre_checkout_query` → le bot répond OK
5. Paiement traité → Telegram envoie `successful_payment`
6. Bot UPDATE `profiles.is_premium=true, premium_until=now()+30d`
7. Frontend reçoit l'UPDATE en Realtime → badge Premium apparaît automatiquement

### Djamo / Wave (paiements Mobile Money)

Hors Telegram. Eux n'envoient pas `successful_payment`. Pour les supporter :
1. Configurer un webhook côté Djamo/Wave qui pointe vers une nouvelle Edge Function
   `payment-callback` qui appelle `activatePremium()` après vérification de signature
2. Stocker le `telegram_id` dans la metadata de la transaction pour identifier l'user
3. (À implémenter ultérieurement)
