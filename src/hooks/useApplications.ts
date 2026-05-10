import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export type ApplicationRow = {
  id: string;
  job_id: string;
  applicant_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  message: string | null;
  created_at: string;
  jobs?: any;
};

/**
 * Gere les candidatures de l'utilisateur courant.
 * Hors auth (dev local), retourne un set vide et les actions sont no-op.
 */
export function useApplications(userId: string | null) {
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!userId) {
      setApplications([]);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from('applications')
      .select('*, jobs(*)')
      .eq('applicant_id', userId)
      .order('created_at', { ascending: false });
    if (error) console.error('[useApplications] fetch', error);
    setApplications((data ?? []) as ApplicationRow[]);
    setIsLoading(false);
  }, [userId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Realtime sur les changements de statut (job owner accepte/rejette)
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`apps-${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'applications', filter: `applicant_id=eq.${userId}` },
        () => { refetch(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refetch]);

  const appliedSet = useMemo(
    () => new Set(applications.filter(a => a.status !== 'withdrawn').map(a => a.job_id)),
    [applications],
  );

  const completedSet = useMemo(
    () => new Set(applications.filter(a => a.status === 'accepted' && a.jobs?.status === 'completed').map(a => a.job_id)),
    [applications],
  );

  const applyToJob = useCallback(async (jobId: string, message?: string) => {
    if (!userId) throw new Error('Connectez-vous via Telegram pour postuler');
    const { error } = await supabase
      .from('applications')
      .insert({ job_id: jobId, applicant_id: userId, message: message ?? null });
    if (error && !/duplicate/i.test(error.message)) throw error;
    await refetch();
  }, [userId, refetch]);

  const cancelApplication = useCallback(async (jobId: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from('applications')
      .update({ status: 'withdrawn' })
      .eq('job_id', jobId)
      .eq('applicant_id', userId);
    if (error) throw error;
    await refetch();
  }, [userId, refetch]);

  return { applications, appliedSet, completedSet, isLoading, applyToJob, cancelApplication, refetch };
}
