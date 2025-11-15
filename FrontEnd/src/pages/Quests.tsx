import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listQuests, getQueueStats } from '../api/client';
import type { Quest, QueueStats } from '../shared/types';

export default function QuestsPage() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch quests on mount
  useEffect(() => {
    loadQuests();
  }, []);

  // Poll queue stats every 3 seconds
  useEffect(() => {
    loadQueueStats();
    const interval = setInterval(loadQueueStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadQuests = async () => {
    try {
      setLoading(true);
      const data = await listQuests();
      setQuests(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load quests:', err);
      setError(err.message || 'Failed to load quests');
    } finally {
      setLoading(false);
    }
  };

  const loadQueueStats = async () => {
    try {
      const stats = await getQueueStats();
      setQueueStats(stats);
    } catch (err) {
      // Silently fail for queue stats polling
      console.error('Failed to load queue stats:', err);
    }
  };

  // Extract vendor highlights from eligibility rules
  const getVendorHighlights = (quest: Quest): string[] => {
    const vendors: string[] = [];
    quest.eligibility.forEach((rule) => {
      if (rule.field === 'merchant') {
        if (Array.isArray(rule.value)) {
          vendors.push(...rule.value.map((v) => String(v)));
        } else {
          vendors.push(String(rule.value));
        }
      }
    });
    return vendors.length > 0 ? vendors : ['Any vendor'];
  };

  const totalInQueue = queueStats ? queueStats.queued + queueStats.processing : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Queue Banner */}
      {totalInQueue > 0 && (
        <div className="bg-blue-600 text-white py-3 px-4 text-center">
          <p className="text-sm font-medium">
            Processing {totalInQueue} {totalInQueue === 1 ? 'submission' : 'submissions'} ahead of you.
          </p>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Available Data Quests</h1>
          <p className="text-gray-600">
            Complete quests and earn USDC rewards
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading quests...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
            <button
              onClick={loadQuests}
              className="mt-2 text-red-600 hover:text-red-800 underline text-sm"
            >
              Retry
            </button>
          </div>
        ) : quests.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No active quests available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quests.map((quest) => {
              const vendors = getVendorHighlights(quest);
              const reward = quest.unit_amount.toFixed(2);

              return (
                <div
                  key={quest.id}
                  className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 flex flex-col"
                >
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-gray-900 mb-3">
                      {quest.name}
                    </h2>

                    {/* Reward */}
                    <div className="mb-4">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-green-600">
                          ${reward}
                        </span>
                        <span className="text-sm text-gray-500">
                          {quest.currency}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Budget remaining: ${quest.budget_remaining.toFixed(2)}
                      </p>
                    </div>

                    {/* Vendor Highlights */}
                    <div className="mb-4">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                        Eligible Vendors
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {vendors.slice(0, 3).map((vendor, idx) => (
                          <span
                            key={idx}
                            className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                          >
                            {vendor}
                          </span>
                        ))}
                        {vendors.length > 3 && (
                          <span className="inline-block text-gray-500 text-xs px-2 py-1">
                            +{vendors.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Requirements Preview */}
                    {quest.eligibility.length > 0 && (
                      <div className="mb-4 text-sm text-gray-600">
                        <p className="font-medium mb-1">Requirements:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          {quest.eligibility.slice(0, 2).map((rule, idx) => (
                            <li key={idx} className="text-gray-600">
                              {rule.field === 'merchant' && 'Specific vendors'}
                              {rule.field === 'receipt_age_days' &&
                                `Receipt within ${rule.value} days`}
                              {rule.field === 'amount' &&
                                `Amount ${rule.op} $${Number(rule.value) / 100}`}
                              {rule.field === 'zip_prefix' && 'Specific ZIP codes'}
                              {rule.field === 'age' && `Age ${rule.op} ${rule.value}`}
                            </li>
                          ))}
                          {quest.eligibility.length > 2 && (
                            <li className="text-gray-500">
                              +{quest.eligibility.length - 2} more
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* CTA Button */}
                  <Link
                    to={`/submit/${quest.id}`}
                    className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-center transition-colors block"
                  >
                    Try the Demo
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer Link */}
        <div className="mt-8 text-center">
          <Link
            to="/buyer"
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            Buyer Console →
          </Link>
        </div>
      </div>
    </div>
  );
}
