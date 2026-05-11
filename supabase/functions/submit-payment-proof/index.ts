// Recoit une preuve de paiement Wave/Djamo, cree la ligne payment_proofs
// (status pending), genere un signed URL pour l'image, et envoie l'image
// avec boutons inline a tous les admins Telegram (ADMIN_TELEGRAM_IDS).
//
// Deploy : supabase functions deploy submit-payment-proof
// Secrets : TELEGRAM_BOT_TOKEN, ADMIN_TELEGRAM_IDS (csv ex: "6735995998,12345")

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_IDS = (Deno.env.get('ADMIN_TELEGRAM_IDS') ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { 'content-type': 'application/json', ...corsHeaders },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!TELEGRAM_BOT_TOKEN) return json({ error: 'TELEGRAM_BOT_TOKEN missing' }, 500);
  if (ADMIN_IDS.length === 0) return json({ error: 'ADMIN_TELEGRAM_IDS not configured' }, 500);

  // Auth user via JWT Supabase (passe par Authorization: Bearer ...)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Authorization header required' }, 401);

  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes?.user) return json({ error: 'invalid session' }, 401);
  const userId = userRes.user.id;

  let body: { method?: 'wave' | 'djamo'; storage_path?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!body.method || !body.storage_path) return json({ error: 'method and storage_path required' }, 400);
  if (body.method !== 'wave' && body.method !== 'djamo') return json({ error: 'invalid method' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Genere un signed URL valide 7 jours pour que l'admin puisse voir l'image
  const { data: signed, error: signErr } = await admin.storage
    .from('payment-proofs')
    .createSignedUrl(body.storage_path, 7 * 24 * 3600);
  if (signErr || !signed) {
    console.error('signed url error', signErr);
    return json({ error: 'cannot sign url' }, 500);
  }

  // 2. Recupere le profil pour le nom + telegram_id
  const { data: profile } = await admin
    .from('profiles')
    .select('id, name, telegram_id, email')
    .eq('id', userId)
    .single();
  if (!profile) return json({ error: 'profile not found' }, 404);

  // 3. Cree la ligne payment_proofs
  const { data: proof, error: proofErr } = await admin
    .from('payment_proofs')
    .insert({
      applicant_id: userId,
      method: body.method,
      image_url: signed.signedUrl,
      status: 'pending',
    })
    .select('id')
    .single();
  if (proofErr || !proof) {
    console.error('proof insert error', proofErr);
    return json({ error: 'cannot save proof' }, 500);
  }

  // 4. Envoie l'image a tous les admins avec boutons inline
  const caption =
    `📩 *Nouvelle preuve de paiement*\n\n` +
    `👤 ${profile.name ?? 'Sans nom'}\n` +
    `🆔 Telegram : \`${profile.telegram_id ?? '?'}\`\n` +
    `📧 ${profile.email ?? '?'}\n` +
    `💳 Méthode : *${body.method.toUpperCase()}*\n` +
    `🔖 Proof ID : \`${proof.id}\``;

  const replyMarkup = {
    inline_keyboard: [[
      { text: '✅ Activer Premium', callback_data: `proof:approve:${proof.id}` },
      { text: '❌ Refuser',          callback_data: `proof:reject:${proof.id}` },
    ]],
  };

  for (const adminId of ADMIN_IDS) {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminId,
          photo: signed.signedUrl,
          caption,
          parse_mode: 'Markdown',
          reply_markup: replyMarkup,
        }),
      });
    } catch (e) {
      console.error(`sendPhoto to admin ${adminId} failed`, e);
    }
  }

  return json({ ok: true, proof_id: proof.id });
});
