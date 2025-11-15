import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

// Create buyer-specific client with API key from sessionStorage
function createBuyerClient(): AxiosInstance {
  const apiKey = sessionStorage.getItem('buyer_api_key') || '';

  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
  });

  // Response interceptor for error handling
  client.interceptors.response.use(
    (response: any) => response,
    (error: any) => {
      if (error.response) {
        const message = error.response.data?.error || error.response.data?.message || 'An error occurred';
        return Promise.reject(new Error(message));
      } else if (error.request) {
        return Promise.reject(new Error('Network error: Could not reach server'));
      } else {
        return Promise.reject(error);
      }
    }
  );

  return client;
}

export interface DashboardData {
  quest_id: string;
  name: string;
  status: string;
  currency: string;
  budget_total: number;
  budget_remaining: number;
  total_spent: number;
  stats: {
    total_submissions: number;
    approved: number;
    rejected: number;
    paid: number;
  };
  recent_payouts: Array<{
    payout_id: string;
    submission_id: string;
    amount: number;
    tx_hash: string | null;
    mocked: boolean;
    created_at: string;
    wallet: string;
  }>;
}

export interface PolicyUpdate {
  vendor_allow_list?: string[];
  max_per_payout?: number;
  max_per_day?: number;
}

/**
 * Get dashboard data for a quest
 */
export async function getDashboard(questId: string): Promise<DashboardData> {
  const client = createBuyerClient();
  const response = await client.get<DashboardData>(`/api/quests/${questId}/dashboard`);
  return response.data;
}

/**
 * Update quest policy
 */
export async function updateQuestPolicy(
  questId: string,
  policy: PolicyUpdate
): Promise<{ success: boolean; requestId: string }> {
  const client = createBuyerClient();
  const response = await client.post<{ success: boolean; requestId: string }>(
    `/api/quests/${questId}/policy`,
    policy
  );
  return response.data;
}

