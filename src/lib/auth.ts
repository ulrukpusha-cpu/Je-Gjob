import { supabase } from './supabase';

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: { user?: TelegramUser };
        ready?: () => void;
        expand?: () => void;
        sendData?: (data: string) => void;
        [key: string]: any;
      };
    };
  }
}

/**
 * Authentifie l'utilisateur courant via le initData Telegram.
 * - Lance verify-telegram-init Edge Function (HMAC + creation user)
 * - Echange le magic link contre une session Supabase persistante
 * Retourne la session ou null si echec / hors Telegram.
 */
export async function signInWithTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg?.initData) return null;

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-telegram-init`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ initData: tg.initData }),
  });
  if (!res.ok) {
    console.error('verify-telegram-init failed', await res.text());
    return null;
  }
  const { email, token_hash } = await res.json() as { email: string; token_hash: string };

  const { data, error } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash,
  });
  if (error) {
    console.error('verifyOtp failed', error);
    return null;
  }
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function onAuthChange(cb: (userId: string | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user.id ?? null);
  });
}
