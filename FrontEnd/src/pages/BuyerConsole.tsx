import { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';

interface DashboardData {
  quest_id: string;
  name: string;
  status: string;
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
    tx_hash: string;
    mocked: boolean;
    created_at: string;
    wallet: string;
  }>;
}

interface AuditData {
  payout_id: string;
  submission_id: string;
  amount: number;
  currency: string;
  tx_hash: string;
  mocked: boolean;
  status: string;
  created_at: string;
  decision_trace: any;
  audit_events: Array<{
    actor_id: string;
    event_type: string;
    payload: any;
    timestamp: string;
  }>;
}

export default function BuyerConsole() {
  const [questId, setQuestId] = useState('q_demo_petco');
  const [selectedPayout, setSelectedPayout] = useState<string | null>(null);

  const { data: dashboard, refetch } = useQuery<DashboardData>(
    ['dashboard', questId],
    async () => {
      const res = await axios.get(`/api/quests/${questId}/dashboard`);
      return res.data;
    },
    {
      refetchInterval: 5000, // Refresh every 5 seconds
    }
  );

  const { data: audit } = useQuery<AuditData>(
    ['audit', selectedPayout],
    async () => {
      if (!selectedPayout) return null;
      const res = await axios.get(`/api/payouts/audits/${selectedPayout}`);
      return res.data;
    },
    {
      enabled: !!selectedPayout,
    }
  );

  if (!dashboard) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading dashboard...</div>;
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
      <h1>Buyer Console</h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        Monitor your quests and view audit trails
      </p>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ marginRight: '1rem' }}>Quest ID:</label>
        <input
          type="text"
          value={questId}
          onChange={(e) => setQuestId(e.target.value)}
          style={{
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            width: '300px',
          }}
        />
        <button
          onClick={() => refetch()}
          style={{
            marginLeft: '1rem',
            padding: '0.5rem 1rem',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px' }}>
          <h2>{dashboard.name}</h2>
          <div style={{ marginTop: '1rem' }}>
            <p><strong>Status:</strong> {dashboard.status}</p>
            <p><strong>Budget Total:</strong> {dashboard.budget_total} {dashboard.currency}</p>
            <p><strong>Budget Remaining:</strong> {dashboard.budget_remaining} {dashboard.currency}</p>
            <p><strong>Total Spent:</strong> {dashboard.total_spent} {dashboard.currency}</p>
          </div>
        </div>

        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px' }}>
          <h3>Statistics</h3>
          <div style={{ marginTop: '1rem' }}>
            <p><strong>Total Submissions:</strong> {dashboard.stats.total_submissions}</p>
            <p><strong>Approved:</strong> {dashboard.stats.approved}</p>
            <p><strong>Rejected:</strong> {dashboard.stats.rejected}</p>
            <p><strong>Paid:</strong> {dashboard.stats.paid}</p>
          </div>
        </div>
      </div>

      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
        <h3>Recent Payouts</h3>
        {dashboard.recent_payouts.length === 0 ? (
          <p style={{ marginTop: '1rem', color: '#666' }}>No payouts yet</p>
        ) : (
          <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Wallet</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Amount</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>TX Hash</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recent_payouts.map((payout) => (
                <tr key={payout.payout_id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>{payout.wallet.slice(0, 10)}...</td>
                  <td style={{ padding: '0.5rem' }}>{payout.amount} USDC</td>
                  <td style={{ padding: '0.5rem' }}>
                    <code style={{ fontSize: '0.9rem' }}>
                      {payout.tx_hash ? payout.tx_hash.slice(0, 16) + '...' : 'Pending'}
                    </code>
                    {payout.mocked && <span style={{ marginLeft: '0.5rem', color: '#666' }}>(Demo)</span>}
                  </td>
                  <td style={{ padding: '0.5rem' }}>Completed</td>
                  <td style={{ padding: '0.5rem' }}>
                    <button
                      onClick={() => setSelectedPayout(payout.payout_id)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                      }}
                    >
                      View Audit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedPayout && audit && (
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Audit Trail</h3>
            <button
              onClick={() => setSelectedPayout(null)}
              style={{
                padding: '0.5rem 1rem',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <p><strong>Payout ID:</strong> {audit.payout_id}</p>
            <p><strong>Amount:</strong> {audit.amount} {audit.currency}</p>
            <p><strong>TX Hash:</strong> <code>{audit.tx_hash}</code></p>
            <p><strong>Mocked:</strong> {audit.mocked ? 'Yes (Demo Mode)' : 'No'}</p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <h4>Decision Trace</h4>
            <pre style={{
              background: '#f5f5f5',
              padding: '1rem',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '0.9rem',
            }}>
              {JSON.stringify(audit.decision_trace, null, 2)}
            </pre>
          </div>

          <div>
            <h4>Audit Events</h4>
            {audit.audit_events.map((event, idx) => (
              <div key={idx} style={{
                marginTop: '1rem',
                padding: '1rem',
                background: '#f5f5f5',
                borderRadius: '4px',
              }}>
                <p><strong>Actor:</strong> {event.actor_id}</p>
                <p><strong>Event Type:</strong> {event.event_type}</p>
                <p><strong>Timestamp:</strong> {new Date(event.timestamp).toLocaleString()}</p>
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ cursor: 'pointer' }}>Payload</summary>
                  <pre style={{
                    marginTop: '0.5rem',
                    fontSize: '0.9rem',
                    overflow: 'auto',
                  }}>
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <a
          href="/quests"
          style={{
            color: '#007bff',
            textDecoration: 'none',
          }}
        >
          ← Back to Quests
        </a>
      </div>
    </div>
  );
}

