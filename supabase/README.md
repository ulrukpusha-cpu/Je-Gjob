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
