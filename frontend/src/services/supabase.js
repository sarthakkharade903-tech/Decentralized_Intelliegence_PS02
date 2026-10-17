/**
 * Supabase Client & Cloud Synchronization Service
 * ------------------------------------------------
 * Manages persisting segmentation reports, volumetric analytics, and study metadata
 * to Supabase PostgreSQL / Storage with fail-soft graceful degradation.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '';

const SUPABASE_KEY =
  (typeof import.meta !== 'undefined' && (
    import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    import.meta.env?.VITE_SUPABASE_ANON_KEY
  )) || '';

/**
 * Indicates whether Supabase credentials are validly supplied.
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_KEY &&
    !SUPABASE_URL.includes('<your-project-ref>')
  );
}

/**
 * Singleton Supabase client instance (or null if unconfigured).
 */
export const supabase = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/**
 * Saves a segmentation run result and clinical volumetrics to Supabase.
 *
 * @param {Object} payload
 * @param {string} payload.patientId
 * @param {Object} payload.volumesMl
 * @param {Object} [payload.metrics]
 * @param {Object} [payload.artifacts]
 * @param {Object} [payload.geometry]
 * @param {string} [payload.hardwareDevice]
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
export async function saveCaseRecord({
  patientId = 'ANONYMOUS',
  volumesMl = {},
  metrics = {},
  artifacts = {},
  geometry = {},
  hardwareDevice = 'CPU',
}) {
  if (!isSupabaseConfigured() || !supabase) {
    return {
      success: false,
      error: 'Supabase is not configured. Record stored in local session only.',
    };
  }

  try {
    const record = {
      patient_id: patientId,
      volumes_ml: volumesMl,
      metrics,
      artifacts,
      original_geometry: geometry,
      hardware_device: hardwareDevice,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('segmentation_cases')
      .insert([record])
      .select();

    if (error) {
      console.warn('Supabase case insertion warning:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Failed to sync case record to Supabase:', err);
    return { success: false, error: err.message || 'Unknown network error' };
  }
}

/**
 * Fetches recent segmentation case records from Supabase.
 *
 * @param {number} [limit=20]
 * @returns {Promise<{ success: boolean, records: any[], error?: string }>}
 */
export async function fetchRecentCases(limit = 20) {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, records: [], error: 'Supabase is not configured.' };
  }

  try {
    const { data, error } = await supabase
      .from('segmentation_cases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, records: [], error: error.message };
    }

    return { success: true, records: data || [] };
  } catch (err) {
    return { success: false, records: [], error: err.message };
  }
}
