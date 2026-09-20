export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <span className="brand-mark" aria-hidden="true"><span /></span>
    {!compact && <div><strong>Balance</strong><small>MOD MANAGER</small></div>}
  </div>;
}
