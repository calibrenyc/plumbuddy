import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Download, ExternalLink, Folder, Link2, ShieldCheck, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import type { PageId } from '../components/Sidebar';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { categoryLabel, organizedLocations } from '../lib/categories';
import { recommendLocation } from '../lib/recommendLocation';
import { openBrowserUrl } from '../lib/navigation';

const sources = [
  { name: 'CurseForge', tag: 'Browse Sims 4 mods', color: '#ef6c35', letter: 'C', url: 'https://www.curseforge.com/sims4' },
  { name: 'Mod The Sims', tag: 'Browse downloads', color: '#2c76c4', letter: 'M', url: 'https://modthesims.info/downloads/ts4/' },
  { name: 'GitHub', tag: 'Creator releases', color: '#262b2a', letter: 'G', url: 'https://github.com/topics/sims4' },
];

export function DiscoverPage({ onNavigate }: { onNavigate(page: PageId): void }) {
  const { settings, scan, queueDownload } = useApp();
  const [url, setUrl] = useState('');
  const [installOpen, setInstallOpen] = useState(false);
  const [location, setLocation] = useState('Uncategorized');
  const [customPath, setCustomPath] = useState<string | null>(null);
  const [error, setError] = useState('');
  const recommended = useMemo(() => recommendLocation(url), [url]);
  const estimatedFileName = useMemo(() => {
    try { return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '').trim(); }
    catch { return ''; }
  }, [url]);
  const installConflict = useMemo(() => {
    if (!estimatedFileName || !/\.(package|ts4script|cfg|zip)$/i.test(estimatedFileName)) return null;
    const normalized = estimatedFileName.toLowerCase();
    const exact = scan?.files.find(file => file.name.toLowerCase() === normalized);
    if (exact) return exact;
    return null;
  }, [estimatedFileName, scan]);
  if (!settings) return null;
  const installPath = customPath ?? `${settings.modsFolder}\\${location}`;

  function inspectLink() {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      setLocation(recommended); setCustomPath(null); setError(''); setInstallOpen(true);
    } catch { setError('Enter a complete HTTP or HTTPS link.'); }
  }
  async function chooseCustomFolder() {
    const selected = await api.chooseFolder('Choose where to install this mod', installPath);
    if (selected) setCustomPath(selected);
  }
  function beginDownload(replaceExisting = false) {
    setInstallOpen(false);
    onNavigate('downloads');
    void queueDownload({ url, category: customPath ? 'Custom folder' : categoryLabel(location), installPath, replaceExisting });
    setUrl('');
  }

  return <>
    <PageHeader eyebrow="FIND SOMETHING NEW" title="Discover" description="Bring your favorite Sims content together in one organized place." />
    <section className="download-hero">
      <div className="download-copy"><span className="eyebrow"><Sparkles size={13} /> SMART INSTALL</span><h2>Download from a link</h2><p>Paste a direct mod or archive URL. We’ll ask where it belongs before anything is downloaded.</p>
        <form className="url-form" onSubmit={event => { event.preventDefault(); inspectLink(); }}><Link2 size={19} /><input aria-label="Mod URL" value={url} onChange={event => { setUrl(event.target.value); setError(''); }} placeholder="Paste a Sims mod link…" /><button disabled={!url}><span>Continue</span><ArrowRight size={17} /></button></form>
        {error && <div className="url-error">{error}</div>}
        <div className="safety-note"><ShieldCheck size={15} /> Files are never executed, and overwrites only happen when you choose replace.</div>
      </div>
      <div className="download-visual"><span className="download-ring r1" /><span className="download-ring r2" /><div className="download-badge"><Download size={30} /><i><Check size={13} /></i></div></div>
    </section>
    <section className="section-block"><div className="section-heading"><div><h2>Browse trusted sources</h2><p>Open the sites you already know and love</p></div></div>
      <div className="source-grid">{sources.map(source => <div className="source-card" key={source.name}><span className="source-logo" style={{ background: source.color }}>{source.letter}</span><div><strong>{source.name}</strong><small><Check size={12} /> {source.tag}</small></div><button aria-label={`Open ${source.name}`} onClick={() => openBrowserUrl(source.url)}><ExternalLink size={17} /></button></div>)}</div>
    </section>
    {installOpen && <Modal title="Choose an install location" subtitle="Review our recommendation or choose any folder. Downloading starts only after you confirm." onClose={() => setInstallOpen(false)}>
      <div className="recommended-box"><span><Sparkles size={15} /> RECOMMENDED</span><strong>{categoryLabel(recommended)}</strong><p>Based on keywords in the link. You’re always in control.</p></div>
      <label className="field-label" htmlFor="install-location">Organized location</label>
      <select id="install-location" className="location-select" value={location} onChange={event => { setLocation(event.target.value); setCustomPath(null); }}>{organizedLocations.map(item => <option key={item} value={item}>{categoryLabel(item)}</option>)}</select>
      <button className="custom-folder-button" onClick={chooseCustomFolder}><Folder size={16} /><span><strong>{customPath ? 'Custom folder selected' : 'Choose another folder'}</strong><small>{installPath}</small></span></button>
      {installConflict && <div className="conflict-warning"><AlertTriangle size={17} /><span><strong>You may already have this mod</strong><small>{installConflict.relativePath}</small><small>If this is an update, replace it. If it was a mistake, skip the download.</small></span></div>}
      <div className="modal-note"><ShieldCheck size={17} /><span>Direct Sims files install here. ZIPs are safely extracted and deleted after success; RAR and 7Z files remain in Downloads for now.</span></div>
      <div className="modal-actions"><button className="button ghost" onClick={() => setInstallOpen(false)}>Cancel</button>{installConflict && <button className="button subtle" onClick={() => { setInstallOpen(false); setUrl(''); }}>Skip download</button>}<button className="button primary" onClick={() => beginDownload(Boolean(installConflict))}><Download size={16} /> {installConflict ? 'Download and replace' : 'Download here'}</button></div>
    </Modal>}
  </>;
}
