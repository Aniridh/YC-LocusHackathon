import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAudit } from '../api/client';
import type { AuditRecord } from '../shared/types';

export default function AuditPage() {
  const { payoutId } = useParams<{ payoutId: string }>();
  const [audit, setAudit] = useState<AuditRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (payoutId) {
      loadAudit();
    }
  }, [payoutId]);

  const loadAudit = async () => {
    if (!payoutId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getAudit(payoutId);
      setAudit(data);
    } catch (err: any) {
      console.error('Failed to load audit:', err);
      setError(err.message || 'Failed to load audit');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading audit...</p>
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-800">{error || 'Audit not found'}</p>
            <Link
              to="/dashboard"
              className="mt-4 inline-block text-blue-600 hover:text-blue-800"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          to="/dashboard"
          className="text-blue-600 hover:text-blue-800 text-sm mb-4 inline-block"
        >
          ← Back to Dashboard
        </Link>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Audit Trail</h1>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-500">Payout ID</p>
              <p className="text-sm font-mono text-gray-900">{audit.payout_id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Submission ID</p>
              <p className="text-sm font-mono text-gray-900">{audit.submission_id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Amount</p>
              <p className="text-lg font-semibold text-gray-900">
                ${audit.amount.toFixed(2)} {audit.currency}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className="text-sm font-medium text-gray-900">{audit.status}</p>
            </div>
            {audit.tx_hash && (
              <div className="col-span-2">
                <p className="text-sm text-gray-500 mb-1">Transaction Hash</p>
                <code className="text-xs font-mono text-gray-900 break-all">{audit.tx_hash}</code>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">Mocked</p>
              <p className="text-sm text-gray-900">{audit.mocked ? 'Yes (Demo Mode)' : 'No'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Created At</p>
              <p className="text-sm text-gray-900">
                {new Date(audit.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {audit.decision_trace && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Decision Trace</h2>
            <details className="cursor-pointer">
              <summary className="text-sm font-medium text-gray-700 mb-2">
                View Verification Details
              </summary>
              <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <pre className="text-xs overflow-auto max-h-96">
                  {JSON.stringify(audit.decision_trace, null, 2)}
                </pre>
              </div>
            </details>
          </div>
        )}

        {audit.audit_events.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Audit Events</h2>
            <div className="space-y-4">
              {audit.audit_events.map((event, idx) => (
                <div
                  key={idx}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{event.actor_id}</p>
                      <p className="text-xs text-gray-500">{event.event_type}</p>
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <details className="mt-2">
                    <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-900">
                      View Payload
                    </summary>
                    <pre className="mt-2 text-xs bg-white border border-gray-200 rounded p-2 overflow-auto">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

