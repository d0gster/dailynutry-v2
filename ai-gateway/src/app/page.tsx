import { buildProviderChain } from '@/core/config';
import { isDbEnabled } from '@/db/client';

export default function Home() {
  const chain = buildProviderChain();
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: 32, marginBottom: 4 }}>DailyNutry AI Gateway</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Provider abstraction · fallback · guardrails · cost tracking
      </p>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Provider chain (primary → fallback)</h2>
        <ol>
          {chain.map((p, i) => (
            <li key={i}>
              <code>{p.name}</code> — {p.model}
            </li>
          ))}
        </ol>
        <p style={{ color: '#777', fontSize: 14 }}>
          Persistence: {isDbEnabled() ? 'Postgres' : 'stdout (DATABASE_URL unset)'}
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <a href="/dashboard">→ Observability dashboard</a>
      </section>
    </main>
  );
}
