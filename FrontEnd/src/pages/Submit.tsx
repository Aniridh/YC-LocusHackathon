import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { createSubmission, getSubmissionStatus } from '../api/client';
import { useWallet } from '../hooks/useWallet';
import type { SubmissionStatus, VerificationTrace } from '../shared/types';

export default function SubmitPage() {
  const { questId } = useParams<{ questId: string }>();
  const navigate = useNavigate();
  const { address, demoMode, ensureWalletOrDemo } = useWallet();

  const [zipPrefix, setZipPrefix] = useState('');
  const [justification, setJustification] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [trace, setTrace] = useState<VerificationTrace | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [payoutId, setPayoutId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  // Ensure wallet or demo on mount
  useEffect(() => {
    ensureWalletOrDemo().catch(console.error);
  }, [ensureWalletOrDemo]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png'],
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
      }
    },
  });

  // Poll submission status every 1s until terminal
  useEffect(() => {
    if (!submissionId || !polling) return;

    const pollStatus = async () => {
      try {
        const result = await getSubmissionStatus(submissionId);
        setStatus(result.status);
        setTrace(result.trace || null);
        setTxHash(result.tx_hash || null);
        setPayoutId(result.payout_id || null);

        // Stop polling on terminal states
        if (
          result.status === 'APPROVED' ||
          result.status === 'PAID' ||
          result.status === 'REJECTED' ||
          result.status === 'FAILED'
        ) {
          setPolling(false);
        }
      } catch (error: any) {
        console.error('Error polling status:', error);
        setErrorMessage(error.message || 'Failed to check status');
        setPolling(false);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 1000);

    return () => clearInterval(interval);
  }, [submissionId, polling]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file || !zipPrefix || !justification || !ageConfirmed || !consent) {
      alert('Please fill in all required fields');
      return;
    }

    if (justification.length < 10) {
      alert('Justification must be at least 10 characters');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      // Ensure wallet address
      const walletAddress = address || (await ensureWalletOrDemo());

      // Build FormData
      const formData = new FormData();
      formData.append('quest_id', questId!);
      formData.append('wallet', walletAddress);
      formData.append('zip_prefix', zipPrefix);
      formData.append('justification_text', justification);
      formData.append('receipt_image', file);

      // Create submission
      const result = await createSubmission(formData);
      setSubmissionId(result.submission_id);
      setPolling(true);
      setStatus('QUEUED');
    } catch (error: any) {
      console.error('Submission error:', error);
      setErrorMessage(error.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const copyTxHash = useCallback(() => {
    if (txHash) {
      navigator.clipboard.writeText(txHash);
      // You could add a toast notification here
    }
  }, [txHash]);

  const getRejectionReasons = (): string[] => {
    if (!trace) return [];
    const reasons: string[] = [];

    // Check verifier rules
    if (trace.verifier?.rules_fired) {
      trace.verifier.rules_fired.forEach((rule) => {
        if (!rule.ok && rule.reason) {
          reasons.push(rule.reason);
        }
      });
    }

    // Check fraud guard flags
    if (trace.fraud_guard?.flags) {
      trace.fraud_guard.flags.forEach((flag) => {
        if (flag === 'duplicate_receipt') {
          reasons.push('This receipt has already been used');
        } else if (flag === 'similar_receipt_pattern') {
          reasons.push('Similar receipt pattern detected');
        } else if (flag.includes('velocity')) {
          reasons.push('Too many submissions from this device');
        }
      });
    }

    return reasons.length > 0 ? reasons : ['Submission did not meet quest requirements'];
  };

  const isTerminal = status === 'APPROVED' || status === 'PAID' || status === 'REJECTED' || status === 'FAILED';
  const isProcessing = status === 'QUEUED' || status === 'PROCESSING';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/quests"
            className="text-blue-600 hover:text-blue-800 text-sm mb-4 inline-block"
          >
            ← Back to Quests
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Submit Your Receipt</h1>
          <p className="text-gray-600">
            Upload your receipt and complete the quest
          </p>
          {demoMode && (
            <div className="mt-2">
              <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-1 rounded">
                Demo Mode
              </span>
            </div>
          )}
        </div>

        {/* Submission Form */}
        {!submissionId ? (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6">
            {/* Receipt Upload */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Receipt Image *
              </label>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <input {...getInputProps()} />
                {file ? (
                  <div>
                    <p className="text-sm text-gray-600">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-600">
                      Drag & drop receipt image here, or click to select
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      Supports JPG, PNG (max 10MB)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ZIP Prefix */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ZIP Code Prefix *
              </label>
              <input
                type="text"
                value={zipPrefix}
                onChange={(e) => setZipPrefix(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="941"
                maxLength={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">First 3 digits of your ZIP code</p>
            </div>

            {/* Justification */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Justification * ({justification.length} characters)
              </label>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="What did you buy for your pet? Describe your purchase..."
                rows={4}
                maxLength={500}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {justification.length}/500 characters (minimum 10)
              </p>
            </div>

            {/* Age Confirmation */}
            <div className="mb-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  required
                />
                <span className="text-sm text-gray-700">
                  I am 18 years or older *
                </span>
              </label>
            </div>

            {/* Consent */}
            <div className="mb-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  required
                />
                <span className="text-sm text-gray-700">
                  I consent to the use of my data for this quest *
                </span>
              </label>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{errorMessage}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={
                submitting ||
                !file ||
                !zipPrefix ||
                justification.length < 10 ||
                !ageConfirmed ||
                !consent
              }
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit Receipt'}
            </button>
          </form>
        ) : (
          /* Status Display */
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Submission Status</h2>

            {/* Processing Skeleton */}
            {isProcessing && (
              <div className="space-y-4">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800">
                    {status === 'QUEUED' && '⏳ Your submission is in the queue...'}
                    {status === 'PROCESSING' && '🔄 Processing your submission...'}
                  </p>
                </div>
              </div>
            )}

            {/* Success States */}
            {(status === 'APPROVED' || status === 'PAID') && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-3">
                  <svg
                    className="w-6 h-6 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <h3 className="text-lg font-semibold text-green-800">
                    {status === 'PAID' ? 'Payment Complete!' : 'Approved!'}
                  </h3>
                </div>
                {txHash && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Transaction Hash:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white border border-gray-300 rounded px-3 py-2 text-sm font-mono break-all">
                        {txHash}
                      </code>
                      <button
                        onClick={copyTxHash}
                        className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rejection/Failure States */}
            {(status === 'REJECTED' || status === 'FAILED') && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-3">
                  <svg
                    className="w-6 h-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <h3 className="text-lg font-semibold text-red-800">
                    {status === 'REJECTED' ? 'Submission Rejected' : 'Submission Failed'}
                  </h3>
                </div>
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Reasons:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                    {getRejectionReasons().map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Trace Expansion */}
            {trace && (status === 'REJECTED' || status === 'FAILED') && (
              <details className="mt-6">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                  View Detailed Trace
                </summary>
                <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(trace, null, 2)}
                  </pre>
                </div>
              </details>
            )}

            {/* Back Button */}
            <div className="mt-6 flex gap-3">
              <Link
                to="/quests"
                className="flex-1 text-center bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Back to Quests
              </Link>
              {!isTerminal && (
                <button
                  onClick={() => {
                    setSubmissionId(null);
                    setStatus(null);
                    setPolling(false);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Submit Another
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

