import { getRecentStats } from '@/db/request-log';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const stats = await getRecentStats(50);

  if (!stats) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px' }}>
        <h1>Observability</h1>
        <p>No request stats to show. The gateway itself is unaffected — it is still serving
        requests and logging them to stdout.</p>
        <p>This happens when any of the following is true:</p>
        <ul>
          <li><code>DATABASE_URL</code> is unset, so logs go to stdout instead of Postgres.</li>
          <li>Postgres is unreachable — check that it is running (<code>docker compose up -d</code>).</li>
          <li>
            The schema has not been applied yet — run <code>npm run db:init</code>.
          </li>
        </ul>
        <p>The gateway logs the specific reason to stderr.</p>
      </main>
    );
  }

  const cell: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #ddd', textAlign: 'left', fontSize: 13 };

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '48px 24px' }}>
      <h1>Observability</h1>
      <div style={{ display: 'flex', gap: 24, margin: '16px 0 32px' }}>
        <Stat label="Requests" value={String(stats.total)} />
        <Stat label="Fallbacks" value={String(stats.fallbacks)} />
        <Stat label="Failures" value={String(stats.failures)} />
        <Stat label="Est. cost" value={`$${stats.totalUsd.toFixed(4)}`} />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['When', 'OK', 'Provider', 'Model', 'Fallback', 'Repairs', 'Cache', 'USD', 'ms'].map((h) => (
              <th key={h} style={{ ...cell, fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.rows.map((r, i) => (
            <tr key={i}>
              <td style={cell}>{new Date(r.created_at).toLocaleString('pt-BR')}</td>
              <td style={cell}>{r.success ? '✓' : '✗'}</td>
              <td style={cell}>{r.provider_used ?? '—'}</td>
              <td style={cell}>{r.model ?? '—'}</td>
              <td style={cell}>{r.fallback_reason ? '⚠︎' : '—'}</td>
              <td style={cell}>{r.repair_count}</td>
              <td style={cell}>{r.cache_hit ? 'hit' : '—'}</td>
              <td style={cell}>{r.estimated_usd != null ? `$${Number(r.estimated_usd).toFixed(5)}` : '—'}</td>
              <td style={cell}>{r.latency_ms}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#777' }}>{label}</div>
    </div>
  );
}
