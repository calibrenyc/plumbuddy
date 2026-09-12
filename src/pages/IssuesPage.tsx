import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, FileQuestion, FolderTree, ScanSearch, ShieldCheck, Sparkles, Trash2, Wrench } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { api } from '../lib/api';
import type { ModFile } from '../types';

type IssueKind = 'duplicates' | 'depth' | 'mismatch' | 'emptyFolders' | 'uncategorized';

export function IssuesPage() {
  const { settings, scan, runScan, addActivity } = useApp();
  const [selectedIssue, setSelectedIssue] = useState<IssueKind | null>(null);
  const [cleanupError, setCleanupError] = useState('');
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, ModFile[]>();
    for (const file of scan?.files.filter(item => item.duplicate) ?? []) {
      groups.set(file.hash, [...(groups.get(file.hash) ?? []), file]);
    }
    return [...groups.values()].map(group => [...group].sort((a, b) => a.relativePath.length - b.relativePath.length || a.relativePath.localeCompare(b.relativePath)));
  }, [scan]);
  const duplicateTrashCandidates = useMemo(() => duplicateGroups.flatMap(group => group.slice(1)), [duplicateGroups]);
  const depthFiles = scan?.files.filter(file => file.depthIssue) ?? [];
  const mismatchFiles = scan?.files.filter(file => file.categoryMismatch && file.recommendedLocation) ?? [];
  const uncategorizedFiles = scan?.files.filter(file => file.category === 'Uncategorized') ?? [];
  const fileProblems = duplicateGroups.length + depthFiles.length + mismatchFiles.length;
  const reviewCount = fileProblems + uncategorizedFiles.length;
  const issues = scan ? [
    { kind: 'duplicates' as const, icon: AlertTriangle, tone: 'orange', title: 'Duplicate groups', count: duplicateGroups.length, text: `${duplicateGroups.flat().length} files share identical SHA-256 fingerprints` },
    { kind: 'depth' as const, icon: FolderTree, tone: 'purple', title: 'Script mods too deep', count: depthFiles.length, text: 'These script files may not be loaded by The Sims' },
    { kind: 'mismatch' as const, icon: Wrench, tone: 'orange', title: 'Category mismatches', count: mismatchFiles.length, text: 'Files whose detected category does not match their current folder' },
    { kind: 'emptyFolders' as const, icon: Trash2, tone: 'blue', title: 'Empty folders', count: emptyFolders.length, text: 'Old empty setup folders that can be safely recycled' },
    { kind: 'uncategorized' as const, icon: FileQuestion, tone: 'blue', title: 'Uncategorized files', count: uncategorizedFiles.length, text: 'Optional organization suggestions, not file errors' },
  ].filter(issue => issue.count > 0) : [];
  const health = scan ? Math.max(70, 100 - fileProblems * 5) : null;

  useEffect(() => {
    let active = true;
    if (!settings || !scan) {
      setEmptyFolders([]);
      return;
    }
    void api.findEmptyFolders(settings.modsFolder)
      .then(folders => { if (active) setEmptyFolders(folders); })
      .catch(() => { if (active) setEmptyFolders([]); });
    return () => { active = false; };
  }, [settings?.modsFolder, scan?.scannedAt]);

  function openMods() {
    setSelectedIssue(null);
    window.dispatchEvent(new CustomEvent('plumbuddy:navigate', { detail: 'mods' }));
  }

  async function cleanDuplicates() {
    if (!settings || duplicateTrashCandidates.length === 0) return;
    setCleanupBusy(true);
    setCleanupError('');
    try {
      const result = await api.deleteDuplicates(duplicateTrashCandidates.map(file => file.path), settings.modsFolder);
      await addActivity({ type: 'organize', title: 'Duplicate mods moved to Recycle Bin', detail: `${result.deleted.length} duplicate file${result.deleted.length === 1 ? '' : 's'} cleaned up` });
      if (result.errors.length) setCleanupError(`${result.deleted.length} moved, ${result.errors.length} could not be moved. ${result.errors[0].message}`);
      else setSelectedIssue(null);
      await runScan();
    } catch (error) {
      setCleanupError(error instanceof Error ? error.message : 'Duplicate cleanup could not be completed');
    } finally {
      setCleanupBusy(false);
    }
  }

  async function cleanEmptyFolders() {
    if (!settings || emptyFolders.length === 0) return;
    setCleanupBusy(true);
    setCleanupError('');
    try {
      const result = await api.removeEmptyFolders(emptyFolders, settings.modsFolder);
      await addActivity({ type: 'organize', title: 'Empty folders cleaned', detail: `${result.removed.length} empty folder${result.removed.length === 1 ? '' : 's'} moved to the Recycle Bin` });
      if (result.errors.length) setCleanupError(`${result.removed.length} removed, ${result.errors.length} skipped. ${result.errors[0].message}`);
      else setSelectedIssue(null);
      setEmptyFolders(await api.findEmptyFolders(settings.modsFolder));
    } catch (error) {
      setCleanupError(error instanceof Error ? error.message : 'Empty folders could not be removed');
    } finally {
      setCleanupBusy(false);
    }
  }

  return <>
    <PageHeader eyebrow="COLLECTION HEALTH" title="Issues" description="Real results from your Mods folder—nothing is deleted automatically." actions={<button className="button primary" onClick={runScan}><ScanSearch size={16} /> {scan ? 'Scan again' : 'Scan now'}</button>} />
    <section className={`health-summary ${scan && fileProblems === 0 ? 'all-good' : ''} ${!scan ? 'scan-required' : ''}`}>
      <div className="health-score"><span>{health ?? '—'}</span><small>{scan ? 'HEALTH' : 'NOT SCANNED'}</small></div>
      <div><span className="eyebrow">{scan ? 'LATEST CHECK' : 'NO SCAN YET'}</span><h2>{!scan ? 'Scan your Mods folder for real results' : fileProblems ? `${fileProblems} file ${fileProblems === 1 ? 'problem' : 'problems'} found` : reviewCount ? 'No file problems found' : 'Everything looks great'}</h2><p>{!scan ? 'Plumbuddy will check the selected folder for duplicates, script depth, and files that could be organized.' : fileProblems ? `${reviewCount} item${reviewCount === 1 ? '' : 's'} may be worth reviewing. Your files have not been changed.` : uncategorizedFiles.length ? `${uncategorizedFiles.length} file${uncategorizedFiles.length === 1 ? '' : 's'} can optionally be organized into categories.` : 'No duplicates, folder-depth issues, or uncategorized files were found.'}</p></div>
      <Sparkles className="health-sparkle" />
    </section>
    {!scan ? <EmptyState icon={ScanSearch} title="No scan results yet" text="Run a scan to see issues found in your actual Mods folder." action={<button className="button primary" onClick={runScan}>Scan my mods</button>} /> : issues.length ? <div className="issue-grid">{issues.map(({ kind, icon: Icon, tone, title, count, text }) => <article key={kind} className="issue-card"><span className={`issue-icon ${tone}`}><Icon size={20} /></span><div><span>{count}</span><h3>{title}</h3><p>{text}</p></div><button onClick={() => setSelectedIssue(kind)}>Review <ChevronRight size={15} /></button></article>)}</div> : <EmptyState icon={CheckCircle2} title="No issues found" text="The latest scan found no duplicate, misplaced script, or uncategorized files." />}
    <div className="safe-fix"><ShieldCheck size={21} /><div><strong>Safe fixes only</strong><p>Duplicate cleanup shows what will be kept and moves extras to the Recycle Bin only after you confirm.</p></div><span><CheckCircle2 size={14} /> Protection on</span></div>
    {selectedIssue && <Modal title={selectedIssue === 'duplicates' ? 'Duplicate groups' : selectedIssue === 'depth' ? 'Script mods too deep' : selectedIssue === 'mismatch' ? 'Category mismatches' : selectedIssue === 'emptyFolders' ? 'Empty folders' : 'Uncategorized files'} subtitle="These paths come from your latest completed scan." onClose={() => setSelectedIssue(null)}>
      <div className="issue-review-list">
        {selectedIssue === 'duplicates' && duplicateGroups.map((group, index) => <section key={group.map(file => file.path).join('|')}><strong>Matching group {index + 1}</strong><code className="duplicate-keeper">Keep: {group[0].relativePath}</code>{group.slice(1).map(file => <code className="duplicate-trash" key={file.id}>Recycle: {file.relativePath}</code>)}</section>)}
        {selectedIssue === 'depth' && depthFiles.map(file => <code key={file.id}>{file.relativePath}</code>)}
        {selectedIssue === 'mismatch' && mismatchFiles.map(file => <section key={file.id}><strong>{file.name}</strong><code>{file.relativePath} {'->'} {file.recommendedLocation}</code></section>)}
        {selectedIssue === 'emptyFolders' && emptyFolders.map(folder => <code key={folder}>{folder.replace(`${settings?.modsFolder}\\`, '')}</code>)}
        {selectedIssue === 'uncategorized' && uncategorizedFiles.map(file => <code key={file.id}>{file.relativePath}</code>)}
      </div>
      {selectedIssue === 'duplicates' && <div className="modal-note"><Trash2 size={17} /><span>Plumbuddy keeps the shortest/cleanest path in each duplicate group and moves the rest to the Recycle Bin. The Sims 4 must be closed.</span></div>}
      {selectedIssue === 'emptyFolders' && <div className="modal-note"><Trash2 size={17} /><span>Only folders that are still completely empty are moved to the Recycle Bin. The main Mods folder is never removed.</span></div>}
      {cleanupError && <p className="form-error">{cleanupError}</p>}
      <div className="modal-actions"><button className="button ghost" disabled={cleanupBusy} onClick={() => setSelectedIssue(null)}>Close</button>{selectedIssue === 'duplicates' ? <button className="button primary danger" disabled={cleanupBusy || duplicateTrashCandidates.length === 0} onClick={() => void cleanDuplicates()}><Trash2 size={15} /> {cleanupBusy ? 'Cleaning...' : `Recycle ${duplicateTrashCandidates.length} duplicate files`}</button> : selectedIssue === 'emptyFolders' ? <button className="button primary danger" disabled={cleanupBusy || emptyFolders.length === 0} onClick={() => void cleanEmptyFolders()}><Trash2 size={15} /> {cleanupBusy ? 'Cleaning...' : `Recycle ${emptyFolders.length} empty folders`}</button> : selectedIssue === 'uncategorized' || selectedIssue === 'mismatch' ? <button className="button primary" onClick={openMods}><FolderTree size={15} /> Review in My Mods</button> : <button className="button primary" onClick={() => { setSelectedIssue(null); void runScan(); }}><ScanSearch size={15} /> Scan again</button>}</div>
    </Modal>}
  </>;
}
