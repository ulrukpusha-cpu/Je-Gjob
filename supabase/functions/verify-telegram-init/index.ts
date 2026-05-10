// Supabase Edge Function (Deno)
// Verifie le initData Telegram (HMAC SHA256 avec TELEGRAM_BOT_TOKEN)
// puis emet un magic link a usage unique que le frontend echange contre une session Supabase.
//
// Deploy : supabase functions deploy verify-telegram-init --no-verify-jwt
// Secrets : supabase secrets set TELEGRAM_BOT_TOKEN=xxx APP_URL=https://votre-app.vercel.app

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? '';
// initData accepte si moins vieux que MAX_INITDATA_AGE_S secondes
const MAX_INITDATA_AGE_S = 60 * 60 * 24; // 24h

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no hash' as const };

  // Build data_check_string : trier par cle, exclure 'hash', joindre key=value avec \n
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const computedHash = bufToHex(await hmacSha256(secretKey, dataCheckString));
  if (computedHash !== hash) return { ok: false, reason: 'bad hash' as const };

  // Anti-replay : check auth_date
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_INITDATA_AGE_S) {
    return { ok: false, reason: 'expired' as const };
  }

  const userJson = params.get('user');
  if (!userJson) return { ok: false, reason: 'no user' as const };
  const user = JSON.parse(userJson) as {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  };

  return { ok: true as const, user };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  if (!TELEGRAM_BOT_TOKEN) return json({ error: 'TELEGRAM_BOT_TOKEN missing' }, 500);

  let body: { initData?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  if (!body.initData) return json({ error: 'initData required' }, 400);

  const verified = await verifyInitData(body.initData, TELEGRAM_BOT_TOKEN);
  if (!verified.ok) return json({ error: `invalid initData: ${verified.reason}` }, 401);

  const tg = verified.user;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Email synthetique stable lie au telegram_id
  const email = `tg-${tg.id}@je-gjobe.local`;
  const fullName = [tg.first_name, tg.last_name].filter(Boolean).join(' ') || tg.username || `User ${tg.id}`;

  // Cree l'utilisateur s'il n'existe pas (idempotent)
  const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  // listUsers ne filtre pas par email, on tente createUser et on ignore l'erreur "already exists"
  const { error: createErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      telegram_id: tg.id,
      name: fullName,
      username: tg.username,
      photo_url: tg.photo_url,
    },
  });
  if (createErr && !/already.*registered|exists/i.test(createErr.message)) {
    return json({ error: createErr.message }, 500);
  }

  // Genere un magic link a usage unique - le frontend l'echange via verifyOtp
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !linkData) return json({ error: linkErr?.message ?? 'link error' }, 500);

  return json({
    email,
    token_hash: linkData.properties.hashed_token,
    user: {
      telegram_id: tg.id,
      name: fullName,
      username: tg.username,
      photo_url: tg.photo_url,
    },
  });
});
