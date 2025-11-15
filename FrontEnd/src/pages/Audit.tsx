import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAudit } from '../api/client';
import { useWallet } from '../hooks/useWallet';
import type { AuditRecord, VerificationTrace, RuleTrace } from '../shared/types';

export default function AuditPage() {
  const { payoutId } = useParams<{ payoutId: string }>();
  const { demoMode } = useWallet();
  const [audit, setAudit] = useState<AuditRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const BLOCK_EXPLORER_URL = import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://sepolia.basescan.org';

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

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const isRealTxHash = (hash: string | null): boolean => {
    if (!hash) return false;
    // Real tx hashes are 66 chars (0x + 64 hex chars) and don't start with demo patterns
    return hash.length === 66 && hash.startsWith('0x') && !hash.includes('demo');
  };

  const getExplorerUrl = (txHash: string): string => {
    return `${BLOCK_EXPLORER_URL}/tx/${txHash}`;
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

  const trace = audit.decision_trace;
  const verifierRules = trace?.verifier?.rules_fired || [];
  const fraudGuard = trace?.fraud_guard;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          to="/dashboard"
          className="text-blue-600 hover:text-blue-800 text-sm mb-6 inline-block"
        >
          ← Back to Dashboard
        </Link>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Audit Trail</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">Payout ID</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono text-gray-900 break-all">
                  {audit.payout_id}
                </code>
                <button
                  onClick={() => copyToClipboard(audit.payout_id, 'payout')}
                  className="text-blue-600 hover:text-blue-800 text-xs"
                >
                  {copied === 'payout' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Submission ID</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono text-gray-900 break-all">
                  {audit.submission_id}
                </code>
                <button
                  onClick={() => copyToClipboard(audit.submission_id, 'submission')}
                  className="text-blue-600 hover:text-blue-800 text-xs"
                >
                  {copied === 'submission' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Amount</p>
              <p className="text-2xl font-bold text-gray-900">
                ${audit.amount.toFixed(2)} {audit.currency}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Status</p>
              <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                audit.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                audit.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {audit.status}
              </span>
            </div>
          </div>

          {/* Transaction Hash */}
          {audit.tx_hash && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500 mb-2">Transaction Hash</p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-sm font-mono text-gray-900 break-all bg-gray-50 px-2 py-1 rounded">
                  {audit.tx_hash}
                </code>
                <button
                  onClick={() => copyToClipboard(audit.tx_hash!, 'tx')}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                >
                  {copied === 'tx' ? '✓ Copied' : 'Copy'}
                </button>
                {isRealTxHash(audit.tx_hash) ? (
                  <a
                    href={getExplorerUrl(audit.tx_hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                  >
                    View on Explorer
                  </a>
                ) : (
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded">
                    Mocked Payout
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Created At</p>
              <p className="text-sm text-gray-900">
                {new Date(audit.created_at).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Mocked</p>
              <p className="text-sm text-gray-900">
                {audit.mocked ? 'Yes (Demo Mode)' : 'No'}
              </p>
            </div>
          </div>
        </div>

        {/* Decision Trace */}
        {trace && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Decision Trace</h2>

            {/* Verifier Agent */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-lg font-medium text-gray-900">Verifier Agent</h3>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  Agent ID: verifier
                </span>
                {trace.verifier && (
                  <span className="text-xs text-gray-600">
                    Confidence: {(trace.verifier.confidence * 100).toFixed(1)}%
                  </span>
                )}
              </div>

              {/* Rule Trace */}
              {verifierRules.length > 0 && (
                <div className="space-y-2">
                  {verifierRules.map((rule: RuleTrace, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <span
                        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          rule.ok
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {rule.ok ? '✓' : '✗'}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">{rule.field}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              rule.ok
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {rule.ok ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          Observed: <code className="text-xs">{String(rule.observed)}</code>
                        </p>
                        {rule.reason && (
                          <p className="text-xs text-red-600 mt-1">{rule.reason}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Normalized Fields */}
              {trace.verifier?.normalizedFields && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs font-medium text-blue-900 mb-2">Normalized Fields:</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-blue-700">Merchant:</span>{' '}
                      <span className="font-mono">{trace.verifier.normalizedFields.merchant}</span>
                    </div>
                    <div>
                      <span className="text-blue-700">Date:</span>{' '}
                      <span className="font-mono">{trace.verifier.normalizedFields.dateISO}</span>
                    </div>
                    <div>
                      <span className="text-blue-700">Amount:</span>{' '}
                      <span className="font-mono">
                        ${(trace.verifier.normalizedFields.amountCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Fraud Guard Agent */}
            {fraudGuard && (
              <div className="mb-6 pt-6 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-lg font-medium text-gray-900">Fraud Guard Agent</h3>
                  <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                    Agent ID: fraud_guard
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Risk Score */}
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Risk Score</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            fraudGuard.riskScore < 0.3
                              ? 'bg-green-500'
                              : fraudGuard.riskScore < 0.7
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(fraudGuard.riskScore * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {fraudGuard.riskScore.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Quality Score */}
                  {fraudGuard.qualityScore !== undefined && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Quality Score</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${fraudGuard.qualityScore * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {(fraudGuard.qualityScore * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Flags */}
                {fraudGuard.flags.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-gray-500 mb-2">Flags:</p>
                    <div className="flex flex-wrap gap-2">
                      {fraudGuard.flags.map((flag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded"
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Audit Events */}
        {audit.audit_events.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Audit Events</h2>
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
                    <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-900 cursor-pointer">
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

