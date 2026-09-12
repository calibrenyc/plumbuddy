import { Archive, Check, Download, FolderOpen, LoaderCircle, RotateCw, X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { formatBytes, timeAgo } from '../lib/format';

export function DownloadsPage() {
  const { settings, downloads, cancelDownload, retryDownload, clearFinishedDownloads } = useApp();
  if (!settings) return null;
  const active = downloads.filter(item => item.state === 'downloading').length;
  const completed = downloads.filter(item => item.state === 'installed' || item.state === 'downloaded').length;
  return <>
    <PageHeader eyebrow="INSTALL QUEUE" title="Downloads" description="Only downloads you start appear here—no sample or placeholder items." />
    <div className="download-stats"><div><Download size={20} /><span><strong>{active} active</strong><small>{active ? 'Downloading now' : 'Queue is idle'}</small></span></div><div><Check size={20} /><span><strong>{completed} completed</strong><small>This device</small></span></div><button onClick={() => void api.openFolder(settings.downloadsFolder)}><FolderOpen size={16} /> Open downloads folder</button></div>
    {!downloads.length ? <div className="downloads-empty"><EmptyState icon={Download} title="No downloads yet" text="Go to Discover, paste a direct mod link, and choose where it should be installed. Your real queue will appear here." /></div> :
      <section className="queue-card"><div className="queue-head"><h2>Download queue</h2><button onClick={clearFinishedDownloads} disabled={!downloads.some(item => item.state !== 'downloading')}>Clear finished</button></div>
        {downloads.map(item => <article className="download-row real-download" key={item.id}>
          <span className={`download-file ${item.state}`}>{item.state === 'downloading' ? <LoaderCircle className="spin" size={19} /> : item.state === 'downloaded' ? <Archive size={19} /> : <Download size={19} />}</span>
          <div className="download-info"><div><strong>{item.title}</strong>{item.size !== undefined && <span>{formatBytes(item.size)}</span>}</div><small>{item.source} · {item.category} · started {timeAgo(item.createdAt)}{item.archiveDeleted ? ` · ${item.extractedFiles} files extracted · ZIP deleted` : ''}</small>{item.error && <p className="download-error">{item.error}</p>}{item.state === 'downloading' && <div className="progress-track indeterminate"><i /></div>}<code>{item.filePath ?? item.installPath}</code></div>
          <b className={`download-state ${item.state}`}>{item.state === 'downloading' ? 'Downloading' : item.state === 'installed' ? 'Installed' : item.state === 'downloaded' ? 'Archive ready' : item.state === 'cancelled' ? 'Cancelled' : 'Failed'}</b>
          <div className="row-actions">{item.state === 'downloading' && <button onClick={() => void cancelDownload(item.id)} aria-label={`Cancel ${item.title}`}><X size={16} /></button>}{(item.state === 'failed' || item.state === 'cancelled') && <button onClick={() => void retryDownload(item.id)} aria-label={`Retry ${item.title}`}><RotateCw size={16} /></button>}{item.filePath && <button onClick={() => void api.openFolder(item.filePath!.replace(/[\\/][^\\/]+$/, ''))} aria-label={`Open folder for ${item.title}`}><FolderOpen size={16} /></button>}</div>
        </article>)}
      </section>}
  </>;
}
