import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard, updateQuestPolicy, type DashboardData, type PolicyUpdate } from '../api/buyerClient';
import { getAudit } from '../api/client';
import type { AuditRecord } from '../shared/types';

const API_KEY_STORAGE_KEY = 'buyer_api_key';

export default function BuyerConsole() {
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [questId, setQuestId] = useState('q_demo_petco');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRecord | null>(null);
  const [updatingPolicy, setUpdatingPolicy] = useState(false);

  // Policy state
  const [vendorList, setVendorList] = useState<string[]>([]);
  const [newVendor, setNewVendor] = useState('');
  const [maxPerPayout, setMaxPerPayout] = useState<number>(0);

  // Load API key from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
      setApiKeyInput(stored);
    }
  }, []);

  // Load dashboard when API key and quest ID are available
  useEffect(() => {
    if (apiKey && questId) {
      loadDashboard();
      const interval = setInterval(loadDashboard, 5000); // Refresh every 5s
      return () => clearInterval(interval);
    }
  }, [apiKey, questId]);

  // Load policy from dashboard when available
  useEffect(() => {
    if (dashboard) {
      // Extract vendor list from quest eligibility (if available)
      // This is a demo - in real app, policy would come from a separate endpoint
      setVendorList(['Petco', 'Chewy']); // Default demo values
      setMaxPerPayout(50); // Default demo value
    }
  }, [dashboard]);

  // Load audit when payout is selected
  useEffect(() => {
    if (selectedPayout) {
      loadAudit(selectedPayout);
    }
  }, [selectedPayout]);

  const handleApiKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKeyInput.trim()) {
      sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKeyInput.trim());
      setApiKey(apiKeyInput.trim());
    }
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDashboard(questId);
      setDashboard(data);
    } catch (err: any) {
      console.error('Failed to load dashboard:', err);
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async (payoutId: string) => {
    try {
      const data = await getAudit(payoutId);
      setAudit(data);
    } catch (err: any) {
      console.error('Failed to load audit:', err);
    }
  };

  const handleAddVendor = async () => {
    if (!newVendor.trim() || vendorList.includes(newVendor.trim())) {
      return;
    }

    const updatedList = [...vendorList, newVendor.trim()];
    setVendorList(updatedList);
    setNewVendor('');

    await updatePolicy({ vendor_allow_list: updatedList });
  };

  const handleRemoveVendor = async (vendor: string) => {
    const updatedList = vendorList.filter((v) => v !== vendor);
    setVendorList(updatedList);
    await updatePolicy({ vendor_allow_list: updatedList });
  };

  const handleMaxPayoutChange = async (value: number) => {
    setMaxPerPayout(value);
    await updatePolicy({ max_per_payout: value });
  };

  const updatePolicy = async (policy: PolicyUpdate) => {
    if (!questId) return;

    try {
      setUpdatingPolicy(true);
      await updateQuestPolicy(questId, policy);
      // Reload dashboard to reflect changes
      await loadDashboard();
    } catch (err: any) {
      console.error('Failed to update policy:', err);
      alert(err.message || 'Failed to update policy');
    } finally {
      setUpdatingPolicy(false);
    }
  };

  if (!apiKey) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Buyer Console</h1>
          <p className="text-gray-600 mb-6">
            Enter your API key to access the dashboard
          </p>
          <form onSubmit={handleApiKeySubmit}>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Enter API key"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Continue
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-4 text-center">
            Demo: Use "demo_buyer_key" or any key
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/quests"
            className="text-blue-600 hover:text-blue-800 text-sm mb-4 inline-block"
          >
            ← Back to Quests
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Buyer Console</h1>
              <p className="text-gray-600">Monitor your quests and manage policies</p>
            </div>
            <button
              onClick={() => {
                sessionStorage.removeItem(API_KEY_STORAGE_KEY);
                setApiKey('');
                setApiKeyInput('');
              }}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Change API Key
            </button>
          </div>
        </div>

        {/* Quest Selector */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Quest ID:</label>
            <input
              type="text"
              value={questId}
              onChange={(e) => setQuestId(e.target.value)}
              className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={loadDashboard}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {dashboard ? (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Budget Remaining</h3>
                <p className="text-2xl font-bold text-green-600">
                  ${dashboard.budget_remaining.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  of ${dashboard.budget_total.toFixed(2)} total
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Approved</h3>
                <p className="text-2xl font-bold text-blue-600">{dashboard.stats.approved}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {dashboard.stats.total_submissions} total submissions
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Rejected</h3>
                <p className="text-2xl font-bold text-red-600">{dashboard.stats.rejected}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {((dashboard.stats.rejected / dashboard.stats.total_submissions) * 100 || 0).toFixed(1)}% rejection rate
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Paid</h3>
                <p className="text-2xl font-bold text-purple-600">{dashboard.stats.paid}</p>
                <p className="text-xs text-gray-500 mt-1">
                  ${dashboard.total_spent.toFixed(2)} spent
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Policy Controls */}
              <div className="lg:col-span-1 bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Policy Controls</h2>

                {/* Vendor Allow List */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vendor Allow List
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newVendor}
                      onChange={(e) => setNewVendor(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddVendor();
                        }
                      }}
                      placeholder="Add vendor"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      onClick={handleAddVendor}
                      disabled={updatingPolicy || !newVendor.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {vendorList.map((vendor) => (
                      <span
                        key={vendor}
                        className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded"
                      >
                        {vendor}
                        <button
                          onClick={() => handleRemoveVendor(vendor)}
                          disabled={updatingPolicy}
                          className="hover:text-blue-900 disabled:opacity-50"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Max Per Payout */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Per Payout ($)
                  </label>
                  <input
                    type="number"
                    value={maxPerPayout}
                    onChange={(e) => handleMaxPayoutChange(Number(e.target.value))}
                    min="0"
                    step="0.01"
                    disabled={updatingPolicy}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Recent Payouts */}
              <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Payouts</h2>
                {dashboard.recent_payouts.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No payouts yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">
                            Wallet
                          </th>
                          <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">
                            Amount
                          </th>
                          <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">
                            TX Hash
                          </th>
                          <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.recent_payouts.map((payout) => (
                          <tr key={payout.payout_id} className="border-b border-gray-100">
                            <td className="py-2 px-3 text-sm text-gray-600">
                              {payout.wallet.slice(0, 10)}...
                            </td>
                            <td className="py-2 px-3 text-sm text-gray-900">
                              ${payout.amount.toFixed(2)} {dashboard.currency}
                            </td>
                            <td className="py-2 px-3 text-sm">
                              {payout.tx_hash ? (
                                <code className="text-xs font-mono text-gray-600">
                                  {payout.tx_hash.slice(0, 16)}...
                                </code>
                              ) : (
                                <span className="text-gray-400">Pending</span>
                              )}
                              {payout.mocked && (
                                <span className="ml-2 text-xs text-yellow-600">(Demo)</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <Link
                                to={`/audit/${payout.payout_id}`}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                View Audit
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading dashboard...</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
