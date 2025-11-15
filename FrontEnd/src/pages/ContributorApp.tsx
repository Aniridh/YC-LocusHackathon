import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { useQuery } from 'react-query';
import axios from 'axios';

export default function ContributorApp() {
  const { questId } = useParams<{ questId: string }>();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState('');
  const [zipPrefix, setZipPrefix] = useState('100');
  const [justification, setJustification] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [birthYear, setBirthYear] = useState('');
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Demo mode: generate fake wallet
  useEffect(() => {
    if (!wallet) {
      const demoWallet = `0x${Math.random().toString(16).slice(2, 42).padEnd(40, '0')}`;
      setWallet(demoWallet);
    }
  }, []);

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

  // Poll submission status
  const { data: statusData, refetch } = useQuery(
    ['submission-status', submissionId],
    async () => {
      if (!submissionId) return null;
      const res = await axios.get(`/api/submissions/${submissionId}/status`);
      return res.data;
    },
    {
      enabled: !!submissionId,
      refetchInterval: (data) => {
        if (!data) return false;
        const status = data.status;
        return status === 'PENDING' || status === 'PROCESSING' ? 2000 : false;
      },
    }
  );

  // Queue stats
  const { data: queueStats } = useQuery(
    'queue-stats',
    async () => {
      const res = await axios.get('/api/queue/stats');
      return res.data;
    },
    {
      refetchInterval: 2000,
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file || !wallet || !zipPrefix || !justification || !ageConfirmed || !consent) {
      alert('Please fill in all fields and confirm age/consent');
      return;
    }

    if (birthYear && parseInt(birthYear) >= 2007) {
      alert('You must be 18 or older to participate');
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('quest_id', questId!);
      formData.append('wallet', wallet);
      formData.append('zip_prefix', zipPrefix);
      formData.append('justification_text', justification);
      formData.append('receipt_image', file);

      const res = await axios.post('/api/submissions', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSubmissionId(res.data.submission_id);
    } catch (error: any) {
      console.error('Submission error:', error);
      alert(error.response?.data?.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const status = statusData?.status;
  const decisionTrace = statusData?.decision_trace;
  const txHash = statusData?.tx_hash;
  const errorMessage = statusData?.error_message;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <h1>Submit Your Receipt</h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        Upload your receipt and complete the quest
      </p>

      {queueStats && (queueStats.queued > 0 || queueStats.processing > 0) && (
        <div style={{
          background: '#fff3cd',
          padding: '1rem',
          borderRadius: '4px',
          marginBottom: '1rem',
        }}>
          Processing {queueStats.processing} submission(s), {queueStats.queued} in queue
        </div>
      )}

      {!submissionId ? (
        <form onSubmit={handleSubmit} style={{ background: 'white', padding: '2rem', borderRadius: '8px' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Wallet Address
            </label>
            <input
              type="text"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="0x..."
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
            <small style={{ color: '#666' }}>Demo mode: Auto-generated</small>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Receipt Image
            </label>
            <div
              {...getRootProps()}
              style={{
                border: '2px dashed #ddd',
                borderRadius: '4px',
                padding: '2rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragActive ? '#f0f0f0' : 'white',
              }}
            >
              <input {...getInputProps()} />
              {file ? (
                <p>{file.name}</p>
              ) : (
                <p>Drag & drop receipt image here, or click to select</p>
              )}
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              ZIP Code Prefix
            </label>
            <input
              type="text"
              value={zipPrefix}
              onChange={(e) => setZipPrefix(e.target.value)}
              placeholder="100"
              maxLength={3}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Justification ({justification.length} characters)
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="What did you buy for your pet?"
              rows={4}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
              />
              I am 18 years or older
            </label>
            {ageConfirmed && (
              <input
                type="number"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                placeholder="Birth year (optional)"
                min="1900"
                max="2007"
                style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  width: '200px',
                }}
              />
            )}
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I consent to the use of my data for this quest
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || !file || !wallet || !zipPrefix || !justification || !ageConfirmed || !consent}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: submitting ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </form>
      ) : (
        <div style={{ background: 'white', padding: '2rem', borderRadius: '8px' }}>
          <h2>Submission Status</h2>
          <div style={{ marginTop: '1rem' }}>
            <p><strong>Status:</strong> {status}</p>
            {status === 'APPROVED' && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#d4edda', borderRadius: '4px' }}>
                <p style={{ color: '#155724', fontWeight: 'bold' }}>✓ Approved!</p>
                {txHash && (
                  <p style={{ marginTop: '0.5rem' }}>
                  Transaction: <code>{txHash}</code>
                </p>
                )}
              </div>
            )}
            {status === 'REJECTED' && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8d7da', borderRadius: '4px' }}>
                <p style={{ color: '#721c24', fontWeight: 'bold' }}>✗ Rejected</p>
                {errorMessage && (
                  <p style={{ marginTop: '0.5rem' }}>{errorMessage}</p>
                )}
              </div>
            )}
            {(status === 'PENDING' || status === 'PROCESSING') && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff3cd', borderRadius: '4px' }}>
                <p>Processing your submission...</p>
              </div>
            )}
          </div>

          {decisionTrace && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f5f5f5', borderRadius: '4px' }}>
              <strong>Decision Trace:</strong>
              <pre style={{ marginTop: '0.5rem', fontSize: '0.9rem', overflow: 'auto' }}>
                {JSON.stringify(decisionTrace, null, 2)}
              </pre>
            </div>
          )}

          <button
            onClick={() => navigate('/quests')}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Back to Quests
          </button>
        </div>
      )}
    </div>
  );
}

