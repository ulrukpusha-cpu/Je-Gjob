import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export type Profile = {
  name: string;
  email: string;
  jobTitle: string;
  skills: string[];
  bio: string;
  locationPreference: string;
  availability: string;
  isCreated: boolean;
  profilePicture?: string;
  isPremium: boolean;
  reviews: any[];
  completedMissions: number;
  telegramId?: number;
};

const EMPTY: Profile = {
  name: '',
  email: '',
  jobTitle: '',
  skills: [],
  bio: '',
  locationPreference: '',
  availability: '',
  isCreated: false,
  isPremium: false,
  reviews: [],
  completedMissions: 0,
};

const LS_KEY = 'je_gjobe_profile';

function fromDb(row: any): Profile {
  return {
    name: row.name ?? '',
    email: row.email ?? '',
    jobTitle: row.job_title ?? '',
    skills: row.skills ?? [],
    bio: row.bio ?? '',
    locationPreference: row.location_preference ?? '',
    availability: row.availability ?? '',
    isCreated: row.is_created ?? false,
    profilePicture: row.profile_picture_url ?? undefined,
    isPremium: row.is_premium ?? false,
    completedMissions: row.completed_missions ?? 0,
    telegramId: row.telegram_id ?? undefined,
    reviews: [],
  };
}

function toDb(p: Profile) {
  return {
    name: p.name,
    email: p.email,
    job_title: p.jobTitle,
    bio: p.bio,
    skills: p.skills,
    location_preference: p.locationPreference,
    availability: p.availability,
    profile_picture_url: p.profilePicture ?? null,
    is_created: p.isCreated,
    completed_missions: p.completedMissions,
    telegram_id: p.telegramId ?? null,
    // is_premium / premium_until volontairement omis :
    // le trigger protect_premium_columns bloquerait l'update de toute facon.
  };
}

function loadLs(): Profile {
  try {
    const saved = localStorage.getItem(LS_KEY);
    return saved ? { ...EMPTY, ...JSON.parse(saved) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

type Setter = (next: Profile | ((prev: Profile) => Profile)) => void;

/**
 * Drop-in replacement de useState pour le profil :
 * - Charge depuis Supabase quand userId est defini
 * - Fallback localStorage hors Telegram (dev local)
 * - Persist en debounce 400ms (LS + DB si userId)
 */
export function useProfile(userId: string | null): [Profile, Setter] {
  const [profile, setProfileState] = useState<Profile>(loadLs);
  const hydratedFor = useRef<string | null>(null);

  // Hydrate depuis la DB quand on a un userId
  useEffect(() => {
    if (!userId || hydratedFor.current === userId) return;
    let active = true;

    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('[useProfile] load error', error);
          return;
        }
        hydratedFor.current = userId;
        if (data) {
          // Fusion : la DB prime, mais on garde les champs locaux qui n'y sont pas
          setProfileState(prev => ({ ...prev, ...fromDb(data) }));
        }
      });

    return () => {
      active = false;
    };
  }, [userId]);

  // Persist (LS toujours + DB si auth)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!profile.isCreated) return;

    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(profile));
      } catch (e) {
        console.warn('[useProfile] LS save failed', e);
      }
      if (userId) {
        supabase
          .from('profiles')
          .update(toDb(profile))
          .eq('id', userId)
          .then(({ error }) => {
            if (error) console.warn('[useProfile] DB sync failed', error);
          });
      }
    }, 400);

    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [profile, userId]);

  const setProfile: Setter = useCallback(next => {
    setProfileState(prev => (typeof next === 'function' ? (next as any)(prev) : next));
  }, []);

  return [profile, setProfile];
}
