import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

interface Quest {
  id: string;
  name: string;
  unit_amount: number;
  currency: string;
  budget_remaining: number;
  rules: any;
  created_at: string;
}

export default function QuestsPage() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/quests')
      .then(res => setQuests(res.data.quests))
      .catch(err => console.error('Failed to load quests:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading quests...</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <h1>Available Data Quests</h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        Complete quests and earn USDC rewards
      </p>

      {quests.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'white', borderRadius: '8px' }}>
          <p>No active quests available.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {quests.map(quest => (
            <div
              key={quest.id}
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ marginBottom: '0.5rem' }}>{quest.name}</h2>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem', color: '#666' }}>
                    <span>Reward: {quest.unit_amount} {quest.currency}</span>
                    <span>Budget: {quest.budget_remaining} {quest.currency}</span>
                  </div>
                </div>
                <Link
                  to={`/submit/${quest.id}`}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#007bff',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '4px',
                  }}
                >
                  Start Quest
                </Link>
              </div>

              {quest.rules?.eligibility && (
                <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '1rem' }}>
                  <strong>Requirements:</strong>
                  <ul style={{ marginTop: '0.5rem', marginLeft: '1.5rem' }}>
                    {quest.rules.eligibility.map((rule: any, idx: number) => (
                      <li key={idx}>
                        {rule.field}: {rule.op} {Array.isArray(rule.value) ? rule.value.join(', ') : rule.value}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <Link
          to="/buyer"
          style={{
            color: '#007bff',
            textDecoration: 'none',
          }}
        >
          Buyer Console →
        </Link>
      </div>
    </div>
  );
}

