import { useState } from 'react';
import { Archive, ArrowRight, Check, ChevronRight, CloudDownload, FolderSync, Gamepad2, PackagePlus, Plus, RefreshCw, ScanSearch, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatBytes, shortPath, timeAgo } from '../lib/format';
import type { ActivityType } from '../types';
import type { PageId } from '../components/Sidebar';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';

const activityAppearance: Record<ActivityType, { icon: typeof RefreshCw; tone: string }> = {
  scan: { icon: ScanSearch, tone: 'green' }, download: { icon: CloudDownload, tone: 'purple' },
  backup: { icon: Archive, tone: 'blue' }, pack: { icon: FolderSync, tone: 'green' },
  organize: { icon: Sparkles, tone: 'orange' }, settings: { icon: RefreshCw, tone: 'blue' },
};

export function HomePage({ onNavigate }: { onNavigate(page: PageId): void }) {
  const { settings, scan, packs, activities, runScan, runBackup, createPack, launchGame } = useApp();
  const [packModal, setPackModal] = useState(false);
  const [newsModal, setNewsModal] = useState(false);
  const [activityModal, setActivityModal] = useState(false);
  const [packName, setPackName] = useState('');
  if (!settings) return null;
  const modCount = scan?.files.length ?? 0;
  const totalSize = scan?.totalSize ?? 0;
  const activePack = packs[0];
  const activityRows = (limit?: number) => activities.slice(0, limit).map(activity => {
    const appearance = activityAppearance[activity.type];
    const Icon = appearance.icon;
    return <div className="activity-row" key={activity.id}><span className={`activity-icon ${appearance.tone}`}><Icon size={16} /></span><div><strong>{activity.title}</strong><small>{activity.detail}</small></div><time>{timeAgo(activity.createdAt)}</time></div>;
  });
  return <>
    <PageHeader eyebrow="GOOD AFTERNOON, RUDY" title="Your game, your way." description="Everything you need to keep your Sims world running smoothly." actions={<button className="button subtle" onClick={() => setNewsModal(true)}><WandSparkles size={16} /> What’s new</button>} />
    {activePack ? <section className="hero-card">
      <div className="hero-copy"><span className="status-pill"><span /> ACTIVE MOD PACK</span><h2>{activePack.name}</h2><p className="hero-meta"><b>{activePack.fileCount}</b> mods <i /> <b>{formatBytes(activePack.totalSize)}</b></p><div className="health-line"><span><Check size={14} /></span><div><strong>Everything looks good</strong><small>{scan ? `Last checked ${timeAgo(scan.scannedAt)}` : 'Run a scan when you’re ready'}</small></div></div><div className="hero-actions"><button className="button primary" onClick={launchGame}><Gamepad2 size={17} /> Launch The Sims 4</button><button className="button glass" onClick={() => onNavigate('packs')}>Switch pack <ChevronRight size={16} /></button></div></div>
      <div className="hero-art" aria-hidden="true"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="plumbob"><span className="plumbob-top" /><span className="plumbob-bottom" /></div><div className="floating-chip chip-one"><ShieldCheck size={16} /> Protected</div><div className="floating-chip chip-two"><Sparkles size={16} /> In sync</div></div>
    </section> : <section className="hero-card empty-pack-hero">
      <div className="hero-copy"><span className="status-pill"><span /> START YOUR COLLECTION</span><h2>No mod pack yet</h2><p className="empty-pack-copy">Discover new mods or turn the {modCount ? `${modCount} files already in your Mods folder` : 'mods in your folder'} into your first organized pack.</p><div className="hero-actions"><button className="button primary" onClick={() => onNavigate('discover')}><CloudDownload size={17} /> Find new mods</button><button className="button glass" onClick={() => setPackModal(true)}><PackagePlus size={16} /> Create a mod pack</button></div></div>
      <div className="hero-art empty-art" aria-hidden="true"><div className="hero-orbit orbit-one" /><div className="plumbob muted"><span className="plumbob-top" /><span className="plumbob-bottom" /></div><div className="floating-chip chip-two"><Sparkles size={16} /> Ready when you are</div></div>
    </section>}
    <div className="home-columns"><section className="section-block activity-section"><div className="section-heading"><div><h2>Recent activity</h2><p>Real changes made through Plumbuddy</p></div>{activities.length > 4 && <button className="text-button" onClick={() => setActivityModal(true)}>View all</button>}</div>
      {activities.length ? <div className="activity-list">{activityRows(4)}</div> : <div className="activity-list empty-activity"><RefreshCw size={20} /><div><strong>No activity yet</strong><small>Scans, downloads, backups, pack creation, and organization changes will appear here.</small></div></div>}
    </section><section className="tip-card"><span className="tip-kicker"><Sparkles size={14} /> PLUMBUDDY TIP</span><h3>Play together, worry-free.</h3><p>Create a mod pack to compare your setup with friends before multiplayer.</p><button onClick={() => onNavigate('packs')}>Explore multiplayer sync <ArrowRight size={15} /></button><div className="tip-gems"><i /><i /><i /></div></section></div>
    <footer className="folder-footer"><ShieldCheck size={15} /><span>Managing <strong>{shortPath(settings.modsFolder, 74)}</strong></span><button onClick={() => onNavigate('settings')}>Change folder</button></footer>
    {packModal && <Modal title="Create a mod pack" subtitle="We’ll scan your current Mods folder and save a shareable manifest. Your original files stay exactly where they are." onClose={() => setPackModal(false)}><form onSubmit={async event => { event.preventDefault(); if (!packName.trim()) return; setPackModal(false); await createPack(packName.trim()); setPackName(''); }}><label className="field-label" htmlFor="pack-name">Pack name</label><input id="pack-name" className="text-input" autoFocus value={packName} onChange={event => setPackName(event.target.value)} placeholder="e.g. Multiplayer Night" /><div className="modal-note"><ShieldCheck size={17} /><span><strong>Manifest only</strong> — includes hashes and file metadata, not copyrighted mod files.</span></div><div className="modal-actions"><button type="button" className="button ghost" onClick={() => setPackModal(false)}>Cancel</button><button className="button primary" disabled={!packName.trim()}><Plus size={16} /> Create pack</button></div></form></Modal>}
    {activityModal && <Modal title="Activity history" subtitle={`${activities.length} recorded changes on this device`} onClose={() => setActivityModal(false)}><div className="activity-list modal-activity">{activityRows()}</div><div className="modal-actions"><button className="button primary" onClick={() => setActivityModal(false)}>Done</button></div></Modal>}
    {newsModal && <Modal title="What’s new in Plumbuddy" subtitle="Foundation release · Version 0.1.0" onClose={() => setNewsModal(false)}><div className="release-list"><div><Check size={15} /><span><strong>Safe ZIP extraction</strong><small>Supported mod files install automatically and successful ZIPs are removed.</small></span></div><div><Check size={15} /><span><strong>Choose before installing</strong><small>Review the recommended category or select a custom folder.</small></span></div><div><Check size={15} /><span><strong>Safer mod scanning</strong><small>SHA-256 duplicates and script-depth issues are detected locally.</small></span></div></div><div className="modal-actions"><button className="button primary" onClick={() => setNewsModal(false)}>Got it</button></div></Modal>}
  </>;
}
