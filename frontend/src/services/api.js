/**
 * NeuroVault Frontend API Service
 * --------------------------------
 * Shared contract with Member 2 (FastAPI backend).
 * Specification: docs/ARCHITECTURE.md
 * Primary Endpoint: POST /api/v1/segment/predict
 * Health Endpoint: GET /api/v1/health
 */

// Configurable API base URL: defaults to empty string in production (relative reverse proxy) or local backend in development
export const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL !== undefined)
    ? import.meta.env.VITE_API_BASE_URL
    : ((typeof import.meta !== 'undefined' && import.meta.env?.DEV) ? 'http://localhost:8000' : 'http://localhost:8000');

export const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024; // 1 GiB challenge guardrail

// Backward compatibility aliases
export const BASE_URL = API_BASE_URL;
export const MAX_FILE_BYTES = MAX_FILE_SIZE_BYTES;

/**
 * Structured API error thrown by this client.
 * Check `error.code` or `error.errorCode` for programmatic handling in UI components.
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
    this.errorCode = code;
    this.detail = detail;
  }
}

/**
 * Validates a NIfTI file's extension and size on the client before dispatch.
 * Note: Server-side validation is authoritative for volume geometry, affines, and tensor shapes.
 *
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateNiftiFile(file) {
  if (!file) {
    return { valid: false, error: 'File is required' };
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith('.nii') && !name.endsWith('.nii.gz')) {
    return {
      valid: false,
      error: `"${file.name}" is not a valid NIfTI file. Must be .nii or .nii.gz format.`
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeGiB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `"${file.name}" exceeds the 1 GiB size limit (${sizeGiB} GiB).`
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: `"${file.name}" is empty (0 bytes).`
    };
  }

  return { valid: true };
}

/**
 * Checks backend health and GPU readiness.
 *
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ status: string, disclaimer?: string }>}
 */
export async function checkBackendHealth(signal) {
  const url = `${API_BASE_URL}/api/v1/health`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal
  });

  if (!response.ok) {
    throw new Error(`Backend health probe failed: HTTP ${response.status} (${response.statusText})`);
  }

  return response.json();
}

/**
 * Submits the four required co-registered MRI sequences (+ optional expert ground truth mask)
 * to Member 2's FastAPI MONAI sliding window segmentation endpoint.
 *
 * @param {Object} params
 * @param {File} params.t1 - T1 Native sequence
 * @param {File} params.t1gd - T1Gd / T1ce Post-contrast sequence
 * @param {File} params.t2 - T2-Weighted sequence
 * @param {File} params.flair - FLAIR sequence
 * @param {File} [params.expertSeg] - Optional BraTS 2021 ground-truth label map (0, 1, 2, 4)
 * @param {string} [params.patientId] - Anonymized patient/case identifier
 * @param {function(number): void} [params.onProgress] - Upload progress callback (0 - 100)
 * @param {AbortSignal} [params.signal] - Cancellation signal
 * @returns {Promise<Object>} Successful prediction response payload
 */
export async function predictSegmentation({
  t1,
  t1gd,
  t2,
  flair,
  expertSeg = null,
  patientId = 'ANONYMOUS',
  patient_id = null,
  onProgress = null,
  signal = null
}) {
  // 1. Client-Side Pre-Flight Validation
  const sequenceEntries = [
    { key: 't1', name: 'T1 Native', file: t1 },
    { key: 't1gd', name: 'T1Gd Contrast', file: t1gd },
    { key: 't2', name: 'T2-Weighted', file: t2 },
    { key: 'flair', name: 'FLAIR Edema', file: flair }
  ];

  for (const seq of sequenceEntries) {
    if (!seq.file) {
      throw new Error(`Missing required sequence: ${seq.name}.`);
    }
    const val = validateNiftiFile(seq.file);
    if (!val.valid) {
      throw new Error(`${seq.name}: ${val.error}`);
    }
  }

  // Check for duplicate file assignment across slots
  const assigned = sequenceEntries.filter((s) => s.file);
  for (let i = 0; i < assigned.length; i++) {
    for (let j = i + 1; j < assigned.length; j++) {
      if (
        assigned[i].file.name === assigned[j].file.name &&
        assigned[i].file.size === assigned[j].file.size
      ) {
        throw new Error(
          `Duplicate file detected: "${assigned[i].file.name}" is assigned to both ${assigned[i].name} and ${assigned[j].name}. Each sequence must be a distinct MRI modality.`
        );
      }
    }
  }

  if (expertSeg) {
    const val = validateNiftiFile(expertSeg);
    if (!val.valid) {
      throw new Error(`Expert Ground Truth: ${val.error}`);
    }
  }

  // 2. Build Multipart FormData according to docs/ARCHITECTURE.md contract
  const formData = new FormData();
  formData.append('t1', t1, t1.name || 't1.nii.gz');
  formData.append('t1gd', t1gd, t1gd.name || 't1gd.nii.gz');
  formData.append('t2', t2, t2.name || 't2.nii.gz');
  formData.append('flair', flair, flair.name || 'flair.nii.gz');

  if (expertSeg) {
    formData.append('expert_seg', expertSeg, expertSeg.name || 'expert_seg.nii.gz');
  }
  const effectivePatientId = patient_id || patientId || 'ANONYMOUS';
  formData.append('patient_id', effectivePatientId);

  // 3. Dispatch Request via XMLHttpRequest for real upload progress events
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const endpoint = `${API_BASE_URL}/api/v1/segment/predict`;

    xhr.open('POST', endpoint, true);
    xhr.timeout = 300000; // 5-minute timeout for large sliding window 3D inference

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
        const abortErr = new Error('Upload aborted by user');
        abortErr.name = 'AbortError';
        reject(abortErr);
      });
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Response is non-JSON or HTML error page
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        if (data) {
          resolve(data);
        } else {
          const err = new ApiError('EMPTY_RESPONSE', 'Server returned empty or non-JSON response.');
          err.status = xhr.status;
          reject(err);
        }
      } else {
        // Structured error extraction
        let errorMessage = 'Inference request failed.';
        const errorCode = data?.error || (xhr.status === 404 ? 'NOT_FOUND' : 'API_ERROR');

        if (data?.message) {
          errorMessage = data.message;
        } else if (typeof data?.detail === 'string') {
          errorMessage = data.detail;
        } else if (Array.isArray(data?.detail)) {
          errorMessage = data.detail
            .map((d) => (d.msg ? `${d.loc?.join('.') || 'field'}: ${d.msg}` : JSON.stringify(d)))
            .join('; ');
        } else if (data?.error) {
          errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        } else if (xhr.status === 404) {
          errorMessage = `Endpoint not found (HTTP 404). Backend at ${API_BASE_URL} does not expose /api/v1/segment/predict.`;
        } else if (xhr.status === 503) {
          errorMessage = 'Backend service or model weights unavailable (HTTP 503). Ensure local GPU and MONAI models are initialized.';
        } else if (xhr.status === 500) {
          errorMessage = 'Internal server error during 3D sliding window inference (HTTP 500).';
        } else {
          errorMessage = `Server returned HTTP ${xhr.status} (${xhr.statusText || 'Error'}).`;
        }

        const err = new ApiError(errorCode, errorMessage, data?.detail || {});
        err.status = xhr.status;
        reject(err);
      }
    };

    xhr.onerror = () => {
      const err = new ApiError(
        'BACKEND_UNAVAILABLE',
        `Unable to connect to backend at "${API_BASE_URL || window.location.origin}". Ensure the FastAPI server is running on port 8000.`
      );
      err.status = 0;
      reject(err);
    };

    xhr.ontimeout = () => {
      const err = new ApiError('REQUEST_TIMEOUT', 'Request timed out. 3D sliding window inference exceeded the 300-second limit.');
      err.status = 408;
      reject(err);
    };

    xhr.send(formData);
  });
}

/**
 * Safely downloads a binary artifact (such as predicted NIfTI mask or clinical report)
 *
 * @param {string} url - Artifact URL (relative or absolute)
 * @param {string} [filename] - Desired download filename
 * @returns {Promise<void>}
 */
export async function downloadArtifact(url, filename = 'segmentation_result.nii.gz') {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
  const response = await fetch(fullUrl, { method: 'GET' });

  if (!response.ok) {
    throw new Error(`Failed to download artifact: HTTP ${response.status} (${response.statusText})`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
