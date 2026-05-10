import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export type JobUI = {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  numericPrice: number;
  numericDistance: number;
  distance: string;
  postedTime: string;
  availability: string;
  tags: string[];
  photos: string[];
  contactEmail: string;
  isPremium: boolean;
  userId: string;
};

export type CreateJobInput = {
  title: string;
  description?: string;
  category: string;
  city: string;
  priceEur: number;
  availability?: string;
  tags?: string[];
  photos?: string[];
  lat?: number | null;
  lng?: number | null;
};

type Coords = { lat: number; lng: number } | null;

function haversineKm(a: Coords, lat: number | null, lng: number | null) {
  if (!a || lat == null || lng == null) return 0;
  const R = 6371;
  const dLat = ((lat - a.lat) * Math.PI) / 180;
  const dLng = ((lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function postedTimeFr(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `Il y a ${d} j` : new Date(iso).toLocaleDateString('fr-FR');
}

function fromDb(row: any, coords: Coords): JobUI {
  const km = haversineKm(coords, row.lat, row.lng);
  const owner = row.profiles ?? null;
  return {
    id: row.id,
    title: row.title ?? '',
    description: row.description ?? '',
    category: row.category ?? 'all',
    location: row.city ?? row.address ?? '',
    numericPrice: Number(row.price_eur) || 0,
    numericDistance: km,
    distance: km > 0 ? `${km.toFixed(1)} km` : '',
    postedTime: postedTimeFr(row.created_at),
    availability: row.availability ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    photos: Array.isArray(row.photos) ? row.photos : [],
    contactEmail: owner?.email ?? '',
    isPremium: !!owner?.is_premium,
    userId: row.user_id,
  };
}

type Filters = {
  category: string;
  coords: Coords;
};

/**
 * Liste les jobs ouverts depuis Supabase + souscrit aux nouveautes en Realtime.
 * Filtrage cote DB par categorie. Distance/availability/price : filtres cote UI.
 */
export function useJobs({ category, coords }: Filters) {
  const [jobs, setJobs] = useState<JobUI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const coordsRef = useRef<Coords>(coords);
  coordsRef.current = coords;

  const refetch = useCallback(async () => {
    setIsLoading(true);
    let q = supabase
      .from('jobs')
      .select('*, profiles!jobs_user_id_fkey(email, is_premium)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50);
    if (category && category !== 'all') q = q.eq('category', category);

    const { data, error } = await q;
    if (error) {
      console.error('[useJobs] fetch error', error);
      setJobs([]);
    } else {
      setJobs((data ?? []).map(r => fromDb(r, coordsRef.current)));
    }
    setIsLoading(false);
  }, [category]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Realtime : nouveaux jobs ajoutes en tete de liste
  useEffect(() => {
    const channel = supabase
      .channel('jobs-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs' },
        async (payload) => {
          const row = payload.new as any;
          if (row.status !== 'open') return;
          if (category !== 'all' && row.category !== category) return;
          // Re-fetch la ligne avec le join profiles (le payload INSERT ne l'a pas)
          const { data } = await supabase
            .from('jobs')
            .select('*, profiles!jobs_user_id_fkey(email, is_premium)')
            .eq('id', row.id)
            .maybeSingle();
          if (data) setJobs(prev => [fromDb(data, coordsRef.current), ...prev]);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [category]);

  const createJob = useCallback(async (input: CreateJobInput) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Vous devez etre connecte via Telegram pour publier');

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        user_id: user.id,
        title: input.title,
        description: input.description ?? '',
        category: input.category,
        city: input.city,
        price_eur: input.priceEur,
        availability: input.availability ?? null,
        tags: input.tags ?? [],
        photos: input.photos ?? [],
        lat: input.lat ?? null,
        lng: input.lng ?? null,
      })
      .select('*, profiles!jobs_user_id_fkey(email, is_premium)')
      .single();
    if (error) throw error;
    // Optimistic prepend (le Realtime peut aussi le pousser, dedup par id)
    setJobs(prev => prev.some(j => j.id === data.id) ? prev : [fromDb(data, coordsRef.current), ...prev]);
    return data;
  }, []);

  return { jobs, isLoading, refetch, createJob };
}
