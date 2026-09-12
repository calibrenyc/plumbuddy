import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, Copy, FileJson, FolderOpen, Link2, PackageOpen, Plus, Radio, RefreshCw, ShieldCheck, Trash2, UploadCloud, Users, Wifi, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatBytes, timeAgo } from '../lib/format';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { api } from '../lib/api';
import type { DiscoveredHostedPack, HostedPackInstallProgress, HostedPackSession, HostTransferStatus, ModPackRecord, PackComparisonResult } from '../types';

export function PacksPage() {
  const { settings, packs, createPack, updatePack, refreshPacks, switchPack, addActivity } = useApp();
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [connectionUrl, setConnectionUrl] = useState('');
  const [hosted, setHosted] = useState<Record<string, HostedPackSession>>({});
  const [discovered, setDiscovered] = useState<DiscoveredHostedPack[]>([]);
  const [comparison, setComparison] = useState<PackComparisonResult | null>(null);
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [installProgress, setInstallProgress] = useState<HostedPackInstallProgress | null>(null);
  const [transfers, setTransfers] = useState<HostTransferStatus[]>([]);
  const [collabSyncOpen, setCollabSyncOpen] = useState(false);
  const [collabConfirmOpen, setCollabConfirmOpen] = useState(false);
  const [pendingCollabPeers, setPendingCollabPeers] = useState<DiscoveredHostedPack[]>([]);
  const [layoutConfirmOpen, setLayoutConfirmOpen] = useState(false);
  const [layoutPeers, setLayoutPeers] = useState<DiscoveredHostedPack[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ModPackRecord | null>(null);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const packs = await api.discoverHostedPacks();
        if (active) setDiscovered(packs);
      } catch {
        if (active) setDiscovered([]);
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    async function refreshTransfers() {
      try {
        const status = await api.listHostTransfers();
        if (active) setTransfers(status);
      } catch {
        if (active) setTransfers([]);
      }
    }
    void refreshTransfers();
    const timer = window.setInterval(refreshTransfers, 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, [hosted]);

  useEffect(() => api.onHostedPackInstallProgress(progress => {
    const size = progress.bytes ? ` (${formatBytes(progress.bytes)})` : '';
    setInstallProgress(progress);
    setInstallLog(current => [...current.slice(-79), `${progress.message}${size}`]);
  }), []);

  if (!settings) return null;

  function normalizeConnectionUrl(value: string) {
    const trimmed = value.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  }

  async function updateShareFile(pack: ModPackRecord) {
    setWorking(pack.id);
    setError('');
    try {
      await updatePack(pack.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The mod pack could not be updated');
    } finally {
      setWorking('');
    }
  }

  async function toggleHost(pack: ModPackRecord, collaboration = false) {
    if (!settings) return;
    const activeSettings = settings;
    setError('');
    if (hosted[pack.id]) {
      await api.stopPackHost(pack.id);
      setHosted(current => {
        const next = { ...current };
        delete next[pack.id];
        return next;
      });
      return;
    }
    setWorking(`host-${pack.id}`);
    try {
      const session = await api.startPackHost(pack.id, activeSettings.modsFolder, { collaboration, hostName: activeSettings.displayName });
      setHosted(current => ({ ...current, [pack.id]: session }));
      await addActivity({ type: 'pack', title: collaboration ? 'Collab pack started' : 'Pack host started', detail: `${session.name} v${session.version} available on LAN from ${activeSettings.displayName}` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The pack could not be hosted');
    } finally {
      setWorking('');
    }
  }

  async function connectToHost() {
    if (!settings || !connectionUrl.trim()) return;
    setError('');
    setWorking('connect');
    try {
      const result = await api.connectHostedPack(normalizeConnectionUrl(connectionUrl), settings.modsFolder);
      setComparison(result);
      const changes = result.missing.length + result.updated.length;
      await addActivity({ type: 'pack', title: changes ? 'Hosted pack update found' : 'Hosted pack checked', detail: changes ? `${result.manifest.name} v${result.manifest.version} has ${changes} changes` : `${result.manifest.name} already matches` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not connect to the host');
    } finally {
      setWorking('');
    }
  }

  async function connectToDiscovered(pack: DiscoveredHostedPack) {
    if (!settings) return;
    setConnectionUrl(pack.url);
    setError('');
    setWorking(`connect-${pack.url}`);
    try {
      const result = await api.connectHostedPack(pack.url, settings.modsFolder);
      setComparison(result);
      const changes = result.missing.length + result.updated.length;
      await addActivity({ type: 'pack', title: pack.collaboration ? 'Collab sync checked' : changes ? 'LAN pack update found' : 'LAN pack checked', detail: `${result.manifest.name} from ${pack.hostName ?? pack.host}` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not connect to the LAN pack');
    } finally {
      setWorking('');
    }
  }

  async function installHostedPack() {
    if (!settings || !comparison?.hostUrl) return;
    setWorking('install');
    setError('');
    setInstallProgress(null);
    setInstallLog(['Preparing hosted pack transfer...', 'Requesting files from the host computer...']);
    try {
      const result = await api.installHostedPack(comparison.hostUrl, settings.downloadsFolder, settings.modsFolder, settings.packStorage);
      setInstallLog(current => [...current, `Saved ${result.installedFiles} files into a local pack folder.`, result.installFolder ? `Ready for hotswap: ${result.installFolder}` : 'No transfer ZIP was created.']);
      await refreshPacks();
      await addActivity({ type: 'download', title: 'Hosted pack saved', detail: `${result.packName} v${result.version} - ${result.installedFiles} files saved with categorized folders` });
      setComparison(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Hosted pack could not be installed');
    } finally {
      setWorking('');
      window.setTimeout(() => { setInstallLog([]); setInstallProgress(null); }, 2000);
    }
  }

  async function syncEveryone() {
    if (!settings) return;
    const activePack = packs.find(pack => pack.id === settings.activePackId);
    const peers = discovered.filter(pack => pack.collaboration && (!activePack || pack.shareCode === activePack.shareCode));
    if (!peers.length) return;
    setPendingCollabPeers(peers);
    setCollabConfirmOpen(true);
  }

  async function acceptCollabSync() {
    if (!settings || !pendingCollabPeers.length) return;
    const peers = pendingCollabPeers;
    setCollabConfirmOpen(false);
    setWorking('collab-sync');
    setError('');
    setCollabSyncOpen(true);
    setInstallProgress(null);
    setInstallLog([`Preparing ${peers.length} collab peer${peers.length === 1 ? '' : 's'}...`, 'Downloading missing files into your active Mods folder...']);
    try {
      const result = await api.syncCollabPacks(peers.map(peer => peer.url), settings.modsFolder);
      setInstallLog(current => [...current, `Synced ${result.syncedFiles} files. ${result.skippedFiles} already matched.`]);
      await refreshPacks();
      await addActivity({ type: 'pack', title: 'Collab pack synced', detail: `${result.packName} synced from ${result.peerCount} peer${result.peerCount === 1 ? '' : 's'}` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Collab sync failed');
    } finally {
      setWorking('');
    }
  }

  async function cancelCollabSync() {
    setInstallLog(current => [...current, 'Cancelling sync after the current file operation stops...']);
    await api.cancelCollabSync().catch(() => false);
  }

  async function deletePack(pack: ModPackRecord) {
    setWorking(`delete-${pack.id}`);
    setError('');
    try {
      await api.deleteModPack(pack.id);
      await refreshPacks();
      await addActivity({ type: 'pack', title: 'Mod pack deleted', detail: `${pack.name} moved to the Recycle Bin` });
      setDeleteTarget(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The mod pack could not be deleted');
    } finally {
      setWorking('');
    }
  }

  function confirmFolderLayoutSync() {
    if (!collabPeers.length) return;
    setLayoutPeers(collabPeers);
    setLayoutConfirmOpen(true);
  }

  async function acceptFolderLayoutSync() {
    if (!settings || !layoutPeers.length) return;
    setWorking('layout-sync');
    setError('');
    try {
      const result = await api.syncFolderLayout(layoutPeers.map(peer => peer.url), settings.modsFolder);
      await addActivity({ type: 'organize', title: 'Folder layout synced', detail: `${result.moved} moved · ${result.alreadyCorrect} already matched · ${result.unmatched} missing locally` });
      if (result.moved > 0 && settings.activePackId) await updatePack(settings.activePackId).catch(() => undefined);
      if (result.errors.length) setError(`${result.moved} moved, ${result.errors.length} failed. ${result.errors[0].message}`);
      setLayoutConfirmOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Folder layout sync failed');
    } finally {
      setWorking('');
    }
  }

  const progressPercent = installProgress?.total && installProgress.index ? Math.round(Math.min(100, Math.max(1, (installProgress.index / installProgress.total) * 100))) : 0;
  const activePack = packs.find(pack => pack.id === settings.activePackId);
  const collabPeers = discovered.filter(pack => pack.collaboration && (!activePack || pack.shareCode === activePack.shareCode));

  return <>
    <PageHeader eyebrow="PLAY YOUR WAY" title="Mod Packs" description="Host a pack on your network, let friends connect, and transfer the files directly." actions={<button className="button primary" onClick={() => setModal(true)}><Plus size={16} /> Create pack</button>} />

    <section className="sync-card">
      <div className="sync-icon"><Users size={25} /></div>
      <div>
        <span className="eyebrow">COLLAB MODPACKS</span>
        <h2>Sync with friends</h2>
        <p>Start a collab pack, then everyone can pull missing or updated files one-by-one. Folder paths are included, so cleaned categories sync too.</p>
        <div className="code-form">
          <Link2 size={17} />
          <input aria-label="Host connection link" value={connectionUrl} onChange={event => setConnectionUrl(event.target.value)} placeholder="10.0.0.8:31845/pack/CODE" />
          <button disabled={!connectionUrl.trim() || working === 'connect'} onClick={connectToHost}>{working === 'connect' ? 'Connecting...' : 'Connect'} <ArrowRight size={16} /></button>
        </div>
      </div>
      <div className="sync-people" aria-hidden="true"><i>{settings.displayName.slice(0, 1).toUpperCase() || 'Y'}</i><i>W</i><span><Radio size={15} /></span></div>
    </section>

    {error && <div className="form-error pack-error">{error}</div>}

    <section className="section-block">
      <div className="section-heading">
        <div><h2>Available on your LAN</h2><p>{discovered.length ? 'Click a shared or collab pack to compare and sync' : 'Waiting for a host to click Share or Start collab'}</p></div>
        <div className="header-actions"><button className="button subtle small" onClick={() => void api.discoverHostedPacks().then(setDiscovered)}><RefreshCw size={15} /> Refresh</button>{collabPeers.length > 0 && <button className="button subtle small" disabled={working === 'layout-sync'} onClick={confirmFolderLayoutSync}><FolderOpen size={15} /> {working === 'layout-sync' ? 'Syncing folders...' : 'Sync folder layout'}</button>}{collabPeers.length > 0 && <button className="button primary small" disabled={working === 'collab-sync'} onClick={() => void syncEveryone()}><Users size={15} /> {working === 'collab-sync' ? 'Syncing...' : `Sync everyone (${collabPeers.length})`}</button>}</div>
      </div>
      {discovered.length ? <div className="lan-pack-list">{discovered.map(pack => <article key={pack.url} className={pack.collaboration ? 'collab' : ''}>
        <span><Wifi size={18} /></span>
        <div><strong>{pack.name} v{pack.version} {pack.collaboration && <em className="collab-badge">Collab</em>}</strong><small>{pack.fileCount} files · {pack.hostName ?? pack.host} · {pack.shareCode}</small><code>{pack.url}</code></div>
        <button className="button primary small" disabled={working === `connect-${pack.url}`} onClick={() => void connectToDiscovered(pack)}>{working === `connect-${pack.url}` ? 'Connecting...' : pack.collaboration ? 'Sync' : 'Compare'} <ArrowRight size={15} /></button>
      </article>)}</div> : <div className="lan-empty"><Wifi size={18} /> No shared packs found yet. Make sure both computers are on the same network and the host clicked Share pack or Start collab.</div>}
    </section>

    <section className="section-block">
      <div className="section-heading"><div><h2>Your mod packs</h2><p>{packs.length ? `${packs.length} locally managed setup${packs.length === 1 ? '' : 's'}` : 'Locally managed setups appear here'}</p></div></div>
      {!packs.length ? <EmptyState icon={PackageOpen} title="Create your first mod pack" text="Capture your current setup, then host it so friends can connect and download." action={<button className="button primary" onClick={() => setModal(true)}>Create from current mods</button>} /> :
        <div className="pack-grid">{packs.map((pack, index) => {
          const session = hosted[pack.id];
          const isActive = settings.activePackId === pack.id;
          return <article className={`pack-card ${session?.collaboration ? 'collab' : ''}`} key={pack.id}>
            <div className={`pack-cover cover-${index % 3}`}><span className="mini-plumbob" /><b>{isActive ? 'ACTIVE' : session?.collaboration ? 'COLLAB' : session ? 'HOSTING' : `v${pack.version}`}</b></div>
            <div className="pack-body">
              <div><h3>{pack.name} {session?.collaboration && <em className="collab-badge">Collab</em>}</h3><button aria-label="Copy share code" onClick={() => void navigator.clipboard?.writeText(session?.url ?? pack.shareCode)}><Copy size={15} /></button></div>
              <p><b>{pack.fileCount}</b> mods <i /> <b>{formatBytes(pack.totalSize)}</b></p>
              <span className="pack-code"><FileJson size={13} /> {session?.shareCode ?? pack.shareCode}</span>
              <span className="pack-status"><Check size={13} /> {isActive ? 'Active in The Sims 4 Mods folder' : 'Stored beside your Sims 4 Mods folder'}</span>
              {session && <div className="host-link"><Wifi size={14} /><code>{session.url}</code></div>}
              <button className="button primary full" disabled={isActive || working === `switch-${pack.id}`} onClick={() => { setWorking(`switch-${pack.id}`); setError(''); void switchPack(pack.id).catch(caught => setError(caught instanceof Error ? caught.message : 'Could not activate this pack')).finally(() => setWorking('')); }}><Check size={15} /> {isActive ? 'Active pack' : working === `switch-${pack.id}` ? 'Activating...' : 'Activate for game'}</button>
              <div className="pack-actions">
                <button className="button subtle full" title={isActive ? 'Update this pack from the active Sims 4 Mods folder' : 'Activate this pack before updating it from the game Mods folder'} disabled={!isActive || working === pack.id} onClick={() => void updateShareFile(pack)}><RefreshCw size={15} /> {working === pack.id ? 'Updating...' : 'Update pack'}</button>
                <button className="button subtle full" disabled={working === `host-${pack.id}`} onClick={() => void toggleHost(pack)}><UploadCloud size={15} /> {session ? 'Stop sharing' : working === `host-${pack.id}` ? 'Sharing...' : 'Share pack'}</button>
              </div>
              <button className="button primary full" disabled={Boolean(session) || working === `host-${pack.id}`} onClick={() => void toggleHost(pack, true)}><Users size={15} /> {session?.collaboration ? 'Collab live' : 'Start collab'}</button>
              <button className="button ghost full" onClick={() => void api.openFolder(pack.sharePath?.replace(/[\\/][^\\/]+$/, '') ?? pack.manifestPath.replace(/[\\/][^\\/]+$/, ''))}><FolderOpen size={15} /> Open pack folder</button>
              <button className="button ghost danger full" disabled={isActive || Boolean(session) || working === `delete-${pack.id}`} onClick={() => setDeleteTarget(pack)}><Trash2 size={15} /> {isActive ? 'Active pack cannot be deleted' : 'Delete mod pack'}</button>
            </div>
          </article>;
        })}</div>}
      {Object.keys(hosted).length > 0 && <div className="host-transfer-panel"><div><strong>Host activity</strong><small>{transfers.length ? 'Recent client transfer status' : 'Waiting for clients to download'}</small></div>{transfers.length ? transfers.slice(0, 6).map(transfer => <article key={transfer.id}><span className={transfer.status}>{transfer.status}</span><p><b>{transfer.client}</b> · {transfer.packName}</p><small>{transfer.message ?? 'Transfer status updated'} · {timeAgo(transfer.finishedAt ?? transfer.startedAt)}</small></article>) : <p>No clients are downloading yet.</p>}</div>}
    </section>

    {modal && <Modal title="Create from current mods" subtitle="Plumbuddy will scan the active folder and create a pack that can be hosted over your local network." onClose={() => setModal(false)}>
      <form onSubmit={async event => { event.preventDefault(); if (!name.trim()) return; setModal(false); await createPack(name.trim()); setName(''); }}>
        <label className="field-label" htmlFor="new-pack-name">Pack name</label>
        <input id="new-pack-name" className="text-input" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Multiplayer Night" />
        <div className="modal-note"><ShieldCheck size={17} /><span>Only start hosting for people you trust. The client downloads the mod files from your computer while the host session is open.</span></div>
        <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setModal(false)}>Cancel</button><button className="button primary" disabled={!name.trim()}>Create pack</button></div>
      </form>
    </Modal>}

    {comparison && <Modal title={comparison.missing.length || comparison.updated.length ? 'Pack update found' : 'Pack already matches'} subtitle={`${comparison.manifest.name} v${comparison.manifest.version} - ${comparison.manifest.shareCode}`} onClose={() => working !== 'install' && setComparison(null)}>
      <div className="comparison-summary"><span><strong>{comparison.missing.length}</strong><small>Missing</small></span><span><strong>{comparison.updated.length}</strong><small>Updated</small></span><span><strong>{comparison.added.length}</strong><small>Extra local</small></span><span><strong>{comparison.matching}</strong><small>Matching</small></span></div>
      <div className="issue-review-list location-list compact-compare-list">{[...comparison.missing.slice(0, 3).map(file => ({ label: 'Missing', text: file.path })), ...comparison.updated.slice(0, 3).map(item => ({ label: 'Updated', text: `${item.local.relativePath} -> ${item.expected.name}` })), ...comparison.added.slice(0, 2).map(file => ({ label: 'Extra local', text: file.path }))].map((item, index) => <section key={`${item.label}-${index}`}><strong>{item.label}</strong><code>{item.text}</code></section>)}</div>
      {installLog.length > 0 ? <div className="install-log"><div className="plumbob-progress" style={{ ['--progress' as string]: `${progressPercent}%` }}><span /><strong>{progressPercent || '—'}%</strong></div><div className="install-log-lines"><strong>{working === 'install' ? 'Saving hosted pack' : 'Install finished'}</strong>{installLog.map((line, index) => <span key={`${line}-${index}`} className={index === installLog.length - 1 && working === 'install' ? 'active' : ''}>{line}</span>)}</div></div> : <div className="modal-note"><ArrowDownToLine size={17} /><span>Sync streams hosted files into a local modpack folder first and keeps the host&apos;s categorized paths. Your live Sims Mods folder is left alone until you activate the pack.</span></div>}
      <div className="modal-actions"><button className="button ghost" disabled={working === 'install'} onClick={() => setComparison(null)}>Cancel</button><button className="button primary" disabled={working === 'install'} onClick={() => void installHostedPack()}><ArrowDownToLine size={16} /> {working === 'install' ? 'Syncing...' : 'Sync / download pack'}</button></div>
    </Modal>}
    {collabConfirmOpen && <Modal title="Accept collab sync?" subtitle="Plumbuddy will download missing or updated files from these peers into your active Mods folder." onClose={() => setCollabConfirmOpen(false)}>
      <div className="issue-review-list location-list">
        {pendingCollabPeers.map(peer => <section key={peer.url}><strong>{peer.name} v{peer.version}</strong><code>{peer.hostName ?? peer.host} · {peer.fileCount} files · {peer.shareCode}</code></section>)}
      </div>
      <div className="modal-note"><ShieldCheck size={17} /><span>This safe sync preserves categorized folders and does not delete your extra local files. Make sure The Sims 4 is closed before accepting.</span></div>
      <div className="modal-actions"><button className="button ghost" onClick={() => setCollabConfirmOpen(false)}>Cancel</button><button className="button primary" onClick={() => void acceptCollabSync()}><Users size={15} /> Accept and sync</button></div>
    </Modal>}
    {layoutConfirmOpen && layoutPeers.length > 0 && <Modal title="Sync folder layout?" subtitle={`Copy folder organization from ${layoutPeers.length} visible collab peer${layoutPeers.length === 1 ? '' : 's'}. No mods are downloaded or deleted.`} onClose={() => setLayoutConfirmOpen(false)}>
      <div className="issue-review-list location-list">{layoutPeers.map(peer => <section key={peer.url}><strong>{peer.name} v{peer.version}</strong><code>{peer.hostName ?? peer.host} · {peer.fileCount} files · {peer.shareCode}</code></section>)}</div>
      <div className="modal-note"><ShieldCheck size={17} /><span>This moves matching local files into the same categorized folders used by the peer. It matches by hash first, then filename, and preserves existing files.</span></div>
      <div className="modal-actions"><button className="button ghost" disabled={working === 'layout-sync'} onClick={() => setLayoutConfirmOpen(false)}>Cancel</button><button className="button primary" disabled={working === 'layout-sync'} onClick={() => void acceptFolderLayoutSync()}><FolderOpen size={15} /> {working === 'layout-sync' ? 'Moving...' : 'Accept folder layout'}</button></div>
    </Modal>}
    {collabSyncOpen && <Modal title="Collab sync" subtitle="Pulling missing and updated mods from every visible collab peer." onClose={() => working !== 'collab-sync' && setCollabSyncOpen(false)}>
      <div className="install-log"><div className="plumbob-progress" style={{ ['--progress' as string]: `${progressPercent}%` }}><span /><strong>{progressPercent || '—'}%</strong></div><div className="install-log-lines"><strong>{working === 'collab-sync' ? 'Syncing everyone' : 'Sync finished'}</strong>{installLog.map((line, index) => <span key={`${line}-${index}`} className={index === installLog.length - 1 && working === 'collab-sync' ? 'active' : ''}>{line}</span>)}</div></div>
      <div className="modal-note"><Users size={17} /><span>Files are saved into the same categorized paths used by the peer who shared them. Extras are not deleted in this safe first version.</span></div>
      <div className="modal-actions">{working === 'collab-sync' && <button className="button ghost danger" onClick={() => void cancelCollabSync()}><XCircle size={15} /> Cancel sync</button>}<button className="button primary" disabled={working === 'collab-sync'} onClick={() => setCollabSyncOpen(false)}>Done</button></div>
    </Modal>}
    {deleteTarget && <Modal title="Delete mod pack?" subtitle={`Move "${deleteTarget.name}" to the Recycle Bin and remove it from Plumbuddy.`} onClose={() => working !== `delete-${deleteTarget.id}` && setDeleteTarget(null)}>
      <div className="modal-note"><Trash2 size={17} /><span>This only deletes the stored mod pack folder. Plumbuddy will not delete the active Sims 4 Mods folder, and active/shared packs must be stopped first.</span></div>
      <div className="modal-actions"><button className="button ghost" disabled={working === `delete-${deleteTarget.id}`} onClick={() => setDeleteTarget(null)}>Cancel</button><button className="button primary danger" disabled={working === `delete-${deleteTarget.id}`} onClick={() => void deletePack(deleteTarget)}><Trash2 size={15} /> {working === `delete-${deleteTarget.id}` ? 'Deleting...' : 'Delete pack'}</button></div>
    </Modal>}
  </>;
}
