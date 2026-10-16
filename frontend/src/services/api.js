/**
 * NeuroVault API Service Client
 *
 * Implements the backend API contract documented in docs/ARCHITECTURE.md.
 *
 * Endpoint: POST /api/v1/segment/predict
 * Transport: multipart/form-data
 * Fields:    t1, t1gd, t2, flair (File objects), patient_id (string, optional)
 *
 * ─── ASSUMPTION LOG ─────────────────────────────────────────────────────────
 * A1. Base URL: Assumes backend runs locally at http://localhost:8000 during
 *     development. Change BASE_URL if the backend team uses a different port.
 *     This MUST be confirmed with Sarthak before integration testing.
 *
 * A2. Field names: Uses 't1gd' (not 't1ce' or 't1_gd') per ARCHITECTURE.md §3.
 *     If the FastAPI route signature uses different names, update here and
 *     coordinate with backend — do NOT change silently.
 *
 * A3. Timeout: 300 seconds (5 minutes). MONAI sliding-window inference on
 *     240×240×155 on RTX 3050 is expected to complete in ~5–60 s.
 *     CPU fallback may take longer; adjust with backend if needed.
 *
 * A4. Error shape: Expects RFC 7807-style JSON:
 *       { "error": "ERROR_CODE", "message": "...", "detail": { ... } }
 *     Non-JSON or network-level errors are surfaced via a generic message.
 *
 * A5. Artifact URLs: mask_url and report_url in the success response are
 *     relative paths (e.g. /api/v1/artifacts/…). This client prepends BASE_URL
 *     to make them absolute for downstream use.
 *
 * UNRESOLVED: Backend /api/v1/segment/predict does not yet exist (Sarthak's
 * workstream). This client will return a BACKEND_UNAVAILABLE error until the
 * backend is running. No fake inference results are ever produced.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Base URL of the FastAPI backend. Adjust if backend runs on a different port. */
export const BASE_URL = 'http://localhost:8000';

/** Maximum allowed per-file size: 1 GiB (per hackathon challenge rules). */
export const MAX_FILE_BYTES = 1 * 1024 * 1024 * 1024; // 1,073,741,824 bytes

/** Default request timeout in milliseconds (5 minutes). */
const REQUEST_TIMEOUT_MS = 300_000;

/**
 * Sends 4 NIfTI sequence files to the backend segmentation endpoint.
 *
 * @param {object} params
 * @param {File}   params.t1              T1 native weighted NIfTI file
 * @param {File}   params.t1gd            T1 gadolinium contrast NIfTI file
 * @param {File}   params.t2              T2 weighted NIfTI file
 * @param {File}   params.flair           FLAIR NIfTI file
 * @param {string} [params.patientId]     Optional patient identifier (default: 'ANONYMOUS')
 *
 * @returns {Promise<object>} Resolved prediction payload (see SegmentationResult typedef)
 * @throws  {ApiError}        Structured error from backend or network layer
 */
export async function predictSegmentation({ t1, t1gd, t2, flair, patientId = 'ANONYMOUS' }) {
  // Build multipart form per the documented API contract (ARCHITECTURE.md §3)
  const form = new FormData();
  form.append('t1', t1);
  form.append('t1gd', t1gd);       // Assumption A2: field name is 't1gd'
  form.append('t2', t2);
  form.append('flair', flair);
  form.append('patient_id', patientId);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${BASE_URL}/api/v1/segment/predict`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } catch (networkError) {
    clearTimeout(timeoutId);
    if (networkError.name === 'AbortError') {
      throw new ApiError(
        'REQUEST_TIMEOUT',
        `The segmentation request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. ` +
          'Ensure the backend server is running and the model is loaded correctly.'
      );
    }
    // e.g. ECONNREFUSED — backend not started yet
    throw new ApiError(
      'BACKEND_UNAVAILABLE',
      'Cannot reach the backend server at ' + BASE_URL + '. ' +
        'Start the FastAPI server (uvicorn app.main:app --reload) and try again.',
      { originalMessage: networkError.message }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // Parse body regardless of HTTP status so we can extract RFC 7807 errors
  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      'INVALID_RESPONSE',
      `Backend returned a non-JSON response (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    // Backend returned an RFC 7807 error envelope (Assumption A4)
    throw new ApiError(
      body?.error ?? 'UNKNOWN_ERROR',
      body?.message ?? `Unexpected error (HTTP ${response.status}).`,
      body?.detail ?? {}
    );
  }

  // Resolve relative artifact URLs to absolute (Assumption A5)
  if (body.artifacts?.segmentation_mask_url?.startsWith('/')) {
    body.artifacts.segmentation_mask_url = BASE_URL + body.artifacts.segmentation_mask_url;
  }
  if (body.artifacts?.report_summary_url?.startsWith('/')) {
    body.artifacts.report_summary_url = BASE_URL + body.artifacts.report_summary_url;
  }

  return body;
}

// ─── Structured Error Class ───────────────────────────────────────────────────

/**
 * Structured API error thrown by this client.
 * Check `error.code` for programmatic handling in UI components.
 */
export class ApiError extends Error {
  /**
   * @param {string} code        Machine-readable error code
   * @param {string} message     Human-readable description for display
   * @param {object} [detail={}] Optional structured detail from the backend
   */
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail;
  }
}
