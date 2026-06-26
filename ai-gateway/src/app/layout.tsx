export const metadata = {
  title: 'DailyNutry AI Gateway',
  description: 'Provider abstraction, fallback, guardrails and cost tracking for DailyNutry.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', margin: 0, background: '#f4f1e8', color: '#1a1a1a' }}>
        {children}
      </body>
    </html>
  );
}
