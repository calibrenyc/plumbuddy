import { Archive, ArrowRight, CalendarDays, FolderOpen, HardDrive, Plus, RotateCcw, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { formatBytes, timeAgo } from '../lib/format';
import { api } from '../lib/api';

export function BackupsPage() {
  const { settings, backups, runBackup } = useApp();
  if (!settings) return null;
  return <>
    <PageHeader eyebrow="YOUR SAFETY NET" title="Backups" description="Recoverable snapshots of your Mods folder, kept away from the live game." actions={<button className="button primary" onClick={runBackup}><Plus size={16} /> Create backup</button>} />
    <div className="backup-summary"><div className="summary-art"><ShieldCheck size={31} /></div><div><span>BACKUP PROTECTION</span><h2>{backups.length ? 'Your collection is protected.' : 'Ready when you are.'}</h2><p>{backups.length ? `${backups.length} recoverable archive${backups.length === 1 ? '' : 's'} stored safely.` : 'Create a ZIP snapshot before making big changes.'}</p></div><button onClick={() => void api.openFolder(settings.backupStorage)}><FolderOpen size={16} /> Open storage</button></div>
    <section className="section-block"><div className="section-heading"><div><h2>Backup history</h2><p>{settings.backupStorage}</p></div></div>
      {!backups.length ? <EmptyState icon={Archive} title="No backups yet" text="Your first backup will appear here with its size, mod count, and restore options." action={<button className="button primary" onClick={runBackup}>Create a safe backup</button>} /> :
      <div className="backup-list">{backups.map(backup => <article key={backup.id}><span className="backup-file"><Archive size={20} /></span><div><strong>{backup.name}</strong><small><CalendarDays size={13} /> {timeAgo(backup.createdAt)} · {backup.modCount} mods</small></div><span><HardDrive size={14} /> {formatBytes(backup.size)}</span><button className="button subtle" data-planned="true"><RotateCcw size={15} /> Restore</button><button className="icon-button" aria-label={`Backup details for ${backup.name}`} data-planned="true"><ArrowRight size={17} /></button></article>)}</div>}
    </section>
  </>;
}
