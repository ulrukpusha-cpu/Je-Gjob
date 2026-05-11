// Genere un lien d'invoice Telegram Stars (XTR) que la WebApp ouvre via
// tg.openInvoice(url) - paiement sans fermer la mini-app.
//
// Deploy : supabase functions deploy create-stars-invoice --no-verify-jwt
// Secret requis : TELEGRAM_BOT_TOKEN

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!TELEGRAM_BOT_TOKEN) return json({ error: 'TELEGRAM_BOT_TOKEN missing' }, 500);

  // 300 Stars ~ 4 USD ~ 2400 XOF
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Je Gjobe Premium',
      description: 'Abonnement mensuel - acces visibilite premium pendant 30 jours.',
      payload: 'premium-pass',
      currency: 'XTR',
      prices: [{ label: 'Premium - 1 mois', amount: 300 }],
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error('createInvoiceLink failed', data);
    return json({ error: data.description ?? 'invoice creation failed' }, 500);
  }

  return json({ url: data.result });
});
