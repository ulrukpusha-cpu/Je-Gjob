# Déploiement Je Gjobe

- **Vercel** → webapp (frontend React/Vite)
- **Railway** → bot Telegram (Node.js, tourne en continu)

---

## 1. Vercel (webapp)

### Prérequis
- Compte [Vercel](https://vercel.com)
- Projet poussé sur **GitHub** (ou GitLab / Bitbucket)

### Étapes

1. Va sur [vercel.com](https://vercel.com) → **Add New** → **Project**.
2. Importe le dépôt **je-gjobe**.
3. Vercel détecte la config dans `vercel.json` :
   - **Build Command** : `npm run build`
   - **Output Directory** : `dist`
4. **Variables d’environnement** (Settings → Environment Variables) — à renseigner pour que la webapp fonctionne en prod :

   | Nom | Valeur | Exemple |
   |-----|--------|--------|
   | `KIMI_API_KEY` | Clé Kimi (Moonshot ou NVIDIA NIM) | si VITE_AI_PROVIDER=kimi |
   | `KIMI_MODEL` | (optionnel) Modèle Kimi | `moonshotai/kimi-k2-instruct` (NIM) |
   | `KIMI_BASE_URL` | (optionnel) URL API | `https://integrate.api.nvidia.com/v1` (NIM) |
   | `ANTHROPIC_API_KEY` | Clé Anthropic (Claude) | si VITE_AI_PROVIDER=anthropic |
   | `ANTHROPIC_MODEL` | (optionnel) Modèle Claude | `claude-sonnet-4-20250514` |
   | `VITE_AI_PROVIDER` | `kimi` / `anthropic` | `kimi` |
   | `TELEGRAM_PREMIUM_INVOICE_SLUG` | (optionnel) | `premium-pass` |
   | `DJAMO_PAYMENT_URL` | (optionnel) URL Djamo | `https://pay.djamo.com/...` |
   | `WAVE_QR_URL` | (optionnel) Document QR Wave (PDF ou image) | `/wave-qr.pdf` ou `/wave-qr.png` ou URL complète |

5. **Deploy** : chaque push sur la branche connectée déclenche un déploiement.
6. L’URL de la webapp sera du type : `https://je-gjobe-xxx.vercel.app`.

---

## 2. Railway (bot Telegram)

### Prérequis
- Compte [Railway](https://railway.app)
- Même dépôt **je-gjobe** sur GitHub

### Étapes

1. Va sur [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Choisis le dépôt **je-gjobe**.
3. Railway utilise `railway.toml` : la **Start Command** est `node telegram-bot.mjs` (pas de build nécessaire pour le bot).
4. **Variables d’environnement** (onglet **Variables**) — indispensables pour le bot :

   | Nom | Valeur |
   |-----|--------|
   | `TELEGRAM_BOT_TOKEN` | Token du bot (BotFather) |
   | `KIMI_API_KEY` | (recommandé) Clé Kimi/Moonshot pour le **chatbot** d'aide aux utilisateurs |
   | `KIMI_MODEL` | (optionnel) Ex. `kimi-k2-turbo-preview` |
   | `KIMI_BASE_URL` | (optionnel) `https://api.moonshot.ai/v1` |
   | `ANTHROPIC_API_KEY` | Clé Anthropic (Claude) (pour l’assistant du bot) |
   | `ANTHROPIC_MODEL` | (optionnel) Ex. `claude-sonnet-4-20250514` |
   | `TELEGRAM_PAYMENT_PROVIDER_TOKEN` | (optionnel) Token paiement Telegram |

5. **Deploy** : Railway installe les dépendances puis lance `node telegram-bot.mjs`. Le bot reste actif en continu.
6. Aucune URL publique n’est nécessaire pour le bot (il utilise le polling Telegram).

### Note
- Le bot lit aussi `.env.local` en local ; sur Railway il n’y a pas de fichier `.env.local`, donc **toutes** les variables doivent être définies dans l’onglet Variables du projet Railway.

---

## Récap

| Plateforme | Rôle | Commande / config |
|------------|------|--------------------|
| **Vercel** | Webapp (SPA) | `npm run build` → `dist/` + `vercel.json` |
| **Railway** | Bot Telegram | `node telegram-bot.mjs` (voir `railway.toml`) |

Après déploiement, configure l’URL de la **WebApp Telegram** (dans le bot ou le menu) avec l’URL Vercel (ex. `https://je-gjobe-xxx.vercel.app`).
