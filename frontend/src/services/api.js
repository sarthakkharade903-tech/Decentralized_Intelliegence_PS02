/**
 * NeuroVault Frontend API Service
 * --------------------------------
 * Shared contract with Member 2 (FastAPI backend).
 * Specification: docs/ARCHITECTURE.md
 * Endpoint: POST /api/v1/segment/predict
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024; // 1 GiB challenge guardrail

/**
 * Validates a NIfTI file's extension and size.
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
      error: `"${file.name}" is not a valid NIfTI file. Must be .nii or .nii.gz.`
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `"${file.name}" exceeds the 1 GiB size limit (${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GiB).`
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
 * Checks backend health / liveness.
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ status: string, disclaimer: string }>}
 */
export async function checkBackendHealth(signal) {
  const response = await fetch(`${API_BASE_URL}/api/v1/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal
  });

  if (!response.ok) {
    throw new Error(`Backend health check failed: HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Submits the 4 co-registered MRI sequences (+ optional expert mask) for 3D segmentation.
 *
 * @param {Object} params
 * @param {File} params.t1 - T1 Native sequence
 * @param {File} params.t1gd - T1Gd Post-contrast sequence (also accepts t1ce)
 * @param {File} params.t2 - T2-Weighted sequence
 * @param {File} params.flair - FLAIR sequence
 * @param {File} [params.expertSeg] - Optional BraTS 2021 ground-truth label map
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
  onProgress = null,
  signal = null
}) {
  // 1. Client-Side Pre-Flight Validation
  const sequences = [
    { name: 'T1 Native', file: t1 },
    { name: 'T1Gd Contrast', file: t1gd },
    { name: 'T2-Weighted', file: t2 },
    { name: 'FLAIR Edema', file: flair }
  ];

  for (const seq of sequences) {
    if (!seq.file) {
      throw new Error(`Missing required sequence: ${seq.name}.`);
    }
    const val = validateNiftiFile(seq.file);
    if (!val.valid) {
      throw new Error(`${seq.name}: ${val.error}`);
    }
  }

  if (expertSeg) {
    const val = validateNiftiFile(expertSeg);
    if (!val.valid) {
      throw new Error(`Expert Ground Truth: ${val.error}`);
    }
  }

  // 2. Build Multipart FormData according to ARCHITECTURE.md contract
  const formData = new FormData();
  formData.append('t1', t1, t1.name);
  formData.append('t1gd', t1gd, t1gd.name);
  formData.append('t2', t2, t2.name);
  formData.append('flair', flair, flair.name);

  if (expertSeg) {
    formData.append('expert_seg', expertSeg, expertSeg.name);
  }
  if (patientId) {
    formData.append('patient_id', patientId);
  }

  // 3. Dispatch Request via XMLHttpRequest for accurate upload progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/v1/segment/predict`, true);
    xhr.timeout = 180000; // 3-minute timeout for 3D sliding window inference

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new DOMException('Upload aborted by user', 'AbortError'));
      });
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON response
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        if (data && data.status === 'success') {
          resolve(data);
        } else if (data) {
          resolve(data);
        } else {
          reject(new Error('Invalid non-JSON response from server.'));
        }
      } else {
        // RFC 7807 Error handling
        const errorMessage =
          data?.message ||
          data?.detail?.message ||
          (typeof data?.detail === 'string' ? data.detail : null) ||
          `Server returned error HTTP ${xhr.status}: ${xhr.statusText}`;

        const err = new Error(errorMessage);
        err.status = xhr.status;
        err.detail = data?.detail;
        err.errorCode = data?.error;
        reject(err);
      }
    };

    xhr.onerror = () => {
      reject(
        new Error(
          `Unable to reach backend at ${API_BASE_URL}. Ensure the FastAPI server is running.`
        )
      );
    };

    xhr.ontimeout = () => {
      reject(
        new Error(
          'Request timed out. 3D inference took longer than 180 seconds.'
        )
      );
    };

    xhr.send(formData);
  });
}
