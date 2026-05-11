import { supabase } from './supabase';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;   // 2 Mo
const MAX_JOB_PHOTO_BYTES = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function safeExt(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function validate(file: File, maxBytes: number) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Format non supporté (JPEG, PNG ou WebP uniquement).');
  }
  if (file.size > maxBytes) {
    const maxMo = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`Image trop lourde (max ${maxMo} Mo).`);
  }
}

/**
 * Upload un avatar et retourne son URL publique.
 * Chemin : avatars/{userId}/avatar.{ext} - upsert pour ecraser l'ancien.
 */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  validate(file, MAX_AVATAR_BYTES);
  const path = `${userId}/avatar.${safeExt(file)}`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, {
      upsert: true,
      cacheControl: '3600',
      contentType: file.type,
    });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // Cache-busting pour forcer le navigateur a recharger l'image apres upsert
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Upload une photo de mission. Genere un nom unique (pas d'upsert).
 * Chemin : job-photos/{userId}/{timestamp}-{random}.{ext}
 */
export async function uploadJobPhoto(file: File, userId: string): Promise<string> {
  validate(file, MAX_JOB_PHOTO_BYTES);
  const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt(file)}`;
  const path = `${userId}/${fname}`;
  const { error } = await supabase.storage
    .from('job-photos')
    .upload(path, file, {
      upsert: false,
      cacheControl: '31536000',
      contentType: file.type,
    });
  if (error) throw error;
  const { data } = supabase.storage.from('job-photos').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload plusieurs photos en parallele. Renvoie les URLs dans l'ordre des fichiers.
 */
export async function uploadJobPhotos(files: File[], userId: string): Promise<string[]> {
  return Promise.all(files.map(f => uploadJobPhoto(f, userId)));
}

/**
 * Upload une preuve de paiement Wave/Djamo.
 * Bucket PRIVE, retourne le path interne (pas une URL publique). L'admin recevra
 * un signed URL genere par l'Edge Function submit-payment-proof.
 */
export async function uploadPaymentProof(file: File, userId: string): Promise<string> {
  validate(file, MAX_JOB_PHOTO_BYTES);
  const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt(file)}`;
  const path = `${userId}/${fname}`;
  const { error } = await supabase.storage
    .from('payment-proofs')
    .upload(path, file, {
      upsert: false,
      cacheControl: '3600',
      contentType: file.type,
    });
  if (error) throw error;
  return path;
}
