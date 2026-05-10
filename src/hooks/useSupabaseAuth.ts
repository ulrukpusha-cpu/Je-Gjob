import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { signInWithTelegram } from '../lib/auth';

export type AuthState = {
  userId: string | null;
  isLoading: boolean;
  isTelegram: boolean;
};

/**
 * Connecte automatiquement l'utilisateur via Telegram WebApp si dispo.
 * Hors Telegram (dev local en navigateur), userId reste null
 * et l'app retombe en mode localStorage.
 */
export function useSupabaseAuth(): AuthState {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isTelegram = typeof window !== 'undefined' && !!window.Telegram?.WebApp?.initData;

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data.session) {
        setUserId(data.session.user.id);
        setIsLoading(false);
        return;
      }

      if (isTelegram) {
        const session = await signInWithTelegram();
        if (!active) return;
        setUserId(session?.user.id ?? null);
      }
      setIsLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user.id ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [isTelegram]);

  return { userId, isLoading, isTelegram };
}
