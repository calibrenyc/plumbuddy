import type { LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state">
    <div className="empty-icon"><Icon size={24} /></div>
    <h3>{title}</h3><p>{text}</p>{action}
  </div>;
}
