import axios, { AxiosInstance } from 'axios';
import type {
  Quest,
  SubmissionStatus,
  VerificationTrace,
  AuditRecord,
  QueueStats,
} from '../shared/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.error || error.response.data?.message || 'An error occurred';
      return Promise.reject(new Error(message));
    } else if (error.request) {
      // Request made but no response
      return Promise.reject(new Error('Network error: Could not reach server'));
    } else {
      // Something else happened
      return Promise.reject(error);
    }
  }
);

/**
 * List all active quests
 */
export async function listQuests(): Promise<Quest[]> {
  const response = await apiClient.get<{ quests: Quest[]; requestId: string }>('/api/quests');
  return response.data.quests;
}

/**
 * Create a new submission with receipt image
 */
export async function createSubmission(
  formData: FormData
): Promise<{ submission_id: string }> {
  const response = await apiClient.post<{ submission_id: string; requestId: string }>(
    '/api/submissions',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return { submission_id: response.data.submission_id };
}

/**
 * Get submission status and trace
 */
export async function getSubmissionStatus(
  id: string
): Promise<{
  status: SubmissionStatus;
  trace?: VerificationTrace | null;
  tx_hash?: string | null;
  payout_id?: string | null;
  requestId: string;
}> {
  const response = await apiClient.get<{
    submission_id: string;
    status: SubmissionStatus;
    trace: VerificationTrace | null;
    tx_hash: string | null;
    payout_id: string | null;
    requestId: string;
  }>(`/api/submissions/${id}/status`);
  return {
    status: response.data.status,
    trace: response.data.trace || undefined,
    tx_hash: response.data.tx_hash || undefined,
    payout_id: response.data.payout_id || undefined,
    requestId: response.data.requestId,
  };
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<QueueStats> {
  const response = await apiClient.get<QueueStats>('/api/queue/stats');
  return response.data;
}

/**
 * Get audit record for a payout
 */
export async function getAudit(payoutId: string): Promise<AuditRecord> {
  const response = await apiClient.get<AuditRecord>(`/api/audits/${payoutId}`);
  return response.data;
}

export default apiClient;

