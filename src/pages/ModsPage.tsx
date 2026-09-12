import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, FileBox, FolderCog, FolderOpen, LayoutGrid, List, MoreHorizontal, Search, SlidersHorizontal, Wrench } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatBytes, timeAgo } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { api } from '../lib/api';
import { categoryLabel, organizedLocations } from '../lib/categories';
import type { ModFile } from '../types';

const filters = ['All Mods', 'Gameplay', 'CAS', 'Build/Buy', 'Script Mods', 'Overrides', 'Uncategorized', 'Needs Moving'];
const visibleBatchSize = 350;

export function ModsPage() {
  const { settings, scan, packs, runScan, updatePack, addActivity } = useApp();
  const [filter, setFilter] = useState('All Mods');
  const [search, setSearch] = useState('');
  const [selectedMod, setSelectedMod] = useState<ModFile | null>(null);
  const [category, setCategory] = useState<string>('Uncategorized');
  const [moveError, setMoveError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState<string>('Gameplay');
  const [bulkError, setBulkError] = useState('');
  const [categorizeAllOpen, setCategorizeAllOpen] = useState(false);
  const [reviewCategory, setReviewCategory] = useState<string>('BuildBuy\\Decorations');
  const [fixOpen, setFixOpen] = useState(false);
  const [fixError, setFixError] = useState('');
  const [moving, setMoving] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(visibleBatchSize);

  const needsMoving = useMemo(() => (scan?.files ?? []).filter(file => file.categoryMismatch && file.recommendedLocation), [scan]);
  const confidentCategorize = useMemo(() => (scan?.files ?? []).filter(file => file.recommendedLocation && (!file.relativePath.includes('\\') || file.categoryMismatch)), [scan]);
  const needsUserChoice = useMemo(() => (scan?.files ?? []).filter(file => !file.recommendedLocation && (file.category === 'Uncategorized' || /\b(merged|set|collection)\b/i.test(file.name))), [scan]);
  const files = useMemo(() => (scan?.files ?? []).filter(file => {
    const matchesFilter = filter === 'All Mods' || (filter === 'Needs Moving' ? file.categoryMismatch : file.category === filter);
    return matchesFilter && file.name.toLowerCase().includes(search.toLowerCase());
  }), [scan, filter, search]);
  const selectedFiles = useMemo(() => (scan?.files ?? []).filter(file => selectedIds.has(file.id)), [scan, selectedIds]);
  const visibleFiles = useMemo(() => files.slice(0, visibleLimit), [files, visibleLimit]);
  const allVisibleSelected = visibleFiles.length > 0 && visibleFiles.every(file => selectedIds.has(file.id));

  useEffect(() => { setSelectedIds(new Set()); }, [scan?.scannedAt]);
  useEffect(() => { setVisibleLimit(visibleBatchSize); }, [filter, search, scan?.scannedAt]);

  async function rescanAndRefreshActivePack(movedCount: number) {
    await runScan();
    if (!settings?.activePackId || movedCount === 0) return;
    const activePack = packs.find(pack => pack.id === settings.activePackId);
    if (!activePack) return;
    await updatePack(activePack.id).catch(() => undefined);
  }

  function toggleFile(id: string) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setSelectedIds(current => {
      const next = new Set(current);
      if (allVisibleSelected) visibleFiles.forEach(file => next.delete(file.id));
      else visibleFiles.forEach(file => next.add(file.id));
      return next;
    });
  }

  function defaultLocation(file: ModFile) {
    if (file.recommendedLocation) return file.recommendedLocation;
    const currentFolder = file.relativePath.replace(/[\\/][^\\/]+$/, '');
    if (organizedLocations.includes(currentFolder as typeof organizedLocations[number])) return currentFolder;
    return file.category === 'CAS' ? 'CAS\\Clothes\\Tops' : file.category === 'Build/Buy' ? 'BuildBuy\\Decorations' : file.category;
  }

  async function moveSelected() {
    if (!settings || !selectedFiles.length) return;
    setMoving(true);
    setBulkError('');
    try {
      const result = await api.moveMods(selectedFiles.map(file => file.path), settings.modsFolder, bulkCategory);
      if (result.moved.length) await addActivity({ type: 'organize', title: 'Mods categorized', detail: `${result.moved.length} files -> ${categoryLabel(bulkCategory)}` });
      if (result.errors.length) {
        setBulkError(`${result.moved.length} moved. ${result.errors.length} could not be moved: ${result.errors[0].message}`);
      } else {
        setBulkOpen(false);
      }
      setSelectedIds(new Set());
      await rescanAndRefreshActivePack(result.moved.length);
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'The selected mods could not be moved');
    } finally {
      setMoving(false);
    }
  }

  async function fixDetectedLocations() {
    if (!settings || !needsMoving.length) return;
    setMoving(true);
    setFixError('');
    try {
      const result = await api.fixModLocations(needsMoving.map(file => ({ filePath: file.path, relativeCategory: file.recommendedLocation! })), settings.modsFolder);
      if (result.moved.length) await addActivity({ type: 'organize', title: 'Mod locations fixed', detail: `${result.moved.length} files moved to their detected folders` });
      if (result.errors.length) setFixError(`${result.moved.length} moved. ${result.errors.length} could not be moved: ${result.errors[0].message}`);
      else setFixOpen(false);
      await rescanAndRefreshActivePack(result.moved.length);
    } catch (error) {
      setFixError(error instanceof Error ? error.message : 'Detected locations could not be fixed');
    } finally {
      setMoving(false);
    }
  }

  async function categorizeAllConfident() {
    if (!settings || !confidentCategorize.length) return;
    setMoving(true);
    setFixError('');
    try {
      const result = await api.fixModLocations(confidentCategorize.map(file => ({ filePath: file.path, relativeCategory: file.recommendedLocation! })), settings.modsFolder);
      if (result.moved.length) await addActivity({ type: 'organize', title: 'Auto-categorized mods', detail: `${result.moved.length} confident files moved` });
      if (result.errors.length) setFixError(`${result.moved.length} moved. ${result.errors.length} could not be moved: ${result.errors[0].message}`);
      await rescanAndRefreshActivePack(result.moved.length);
    } catch (error) {
      setFixError(error instanceof Error ? error.message : 'Categorize all could not be completed');
    } finally {
      setMoving(false);
    }
  }

  async function assignReviewItems() {
    if (!settings || !needsUserChoice.length) return;
    setMoving(true);
    setFixError('');
    try {
      const result = await api.moveMods(needsUserChoice.map(file => file.path), settings.modsFolder, reviewCategory);
      if (result.moved.length) await addActivity({ type: 'organize', title: 'Assigned uncategorized mods', detail: `${result.moved.length} files -> ${categoryLabel(reviewCategory)}` });
      if (result.errors.length) setFixError(`${result.moved.length} moved. ${result.errors.length} could not be moved: ${result.errors[0].message}`);
      else setCategorizeAllOpen(false);
      await rescanAndRefreshActivePack(result.moved.length);
    } catch (error) {
      setFixError(error instanceof Error ? error.message : 'The review items could not be moved');
    } finally {
      setMoving(false);
    }
  }

  return <>
    <PageHeader eyebrow="YOUR COLLECTION" title="My Mods" description={`${scan?.files.length ?? 0} files - ${formatBytes(scan?.totalSize ?? 0)} in your active folder`} actions={<><button className="button subtle small" onClick={() => window.dispatchEvent(new CustomEvent('plumbuddy:navigate', { detail: 'settings' }))}><FolderCog size={16} /> Change folder</button><button className="button subtle small" disabled={!scan} onClick={() => { setFixError(''); setCategorizeAllOpen(true); }}><Wrench size={16} /> Categorize all</button><button className="button primary small" onClick={runScan}>Scan folder</button></>} />
    <div className="toolbar-card"><div className="search-field"><Search size={17} /><input aria-label="Search mods" placeholder="Search your mods..." value={search} onChange={event => setSearch(event.target.value)} /></div><button className="filter-button" data-planned="true"><SlidersHorizontal size={17} /> Filters <ChevronDown size={15} /></button><span className="view-toggle"><button className="active" aria-label="List view"><List size={17} /></button><button aria-label="Grid view" data-planned="true"><LayoutGrid size={17} /></button></span></div>
    {needsMoving.length > 0 && <div className="location-fix-banner"><AlertTriangle size={18} /><div><strong>{needsMoving.length} categorized mods are in the wrong folder</strong><span>Plumbuddy can move them into the folder that matches their detected category.</span></div><button className="button ghost small" onClick={() => setFilter('Needs Moving')}>Review</button><button className="button primary small" onClick={() => { setFixError(''); setFixOpen(true); }}><Wrench size={15} /> Fix locations</button></div>}
    <div className="filter-tabs">{filters.map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}{item === 'Uncategorized' && scan?.uncategorized ? <em>{scan.uncategorized}</em> : item === 'Needs Moving' && needsMoving.length ? <em>{needsMoving.length}</em> : null}</button>)}</div>
    {selectedIds.size > 0 && <div className="bulk-action-bar"><strong>{selectedIds.size} selected</strong><span>{allVisibleSelected ? 'All visible mods selected' : `${files.filter(file => selectedIds.has(file.id)).length} on this view`}</span><button className="button ghost small" onClick={() => setSelectedIds(new Set())}>Clear</button><button className="button primary small" onClick={() => { setBulkError(''); setBulkOpen(true); }}><FolderCog size={15} /> Categorize selected</button></div>}
    {!scan ? <EmptyState icon={FileBox} title="Ready for your first scan" text="Scan your Mods folder to build a searchable inventory and spot duplicates." action={<button className="button primary" onClick={runScan}>Scan my mods</button>} /> :
      <div className="mods-table with-selection"><div className="table-head"><span><input className="selection-checkbox" type="checkbox" aria-label="Select all visible mods" checked={allVisibleSelected} onChange={toggleVisible} /></span><span>MOD</span><span>CATEGORY</span><span>SIZE</span><span>MODIFIED</span><span>STATUS</span><span /></div>
        {visibleFiles.map(file => <div className={`mod-row ${selectedIds.has(file.id) ? 'selected' : ''} ${file.categoryMismatch ? 'needs-location' : ''}`} key={file.id}><span><input className="selection-checkbox" type="checkbox" aria-label={`Select ${file.name}`} checked={selectedIds.has(file.id)} onChange={() => toggleFile(file.id)} /></span><span className="mod-name"><i><FileBox size={18} /></i><span><strong>{file.name.replace(/\.(package|ts4script|cfg)$/i, '')}</strong><small>{file.relativePath}</small></span></span><span><b className={`category-tag ${file.category.toLowerCase().replace(/[^a-z]/g, '')}`}>{file.category}</b></span><span>{formatBytes(file.size)}</span><span>{timeAgo(file.modifiedAt)}</span><span>{file.categoryMismatch ? <b className="status warning"><AlertTriangle size={13} /> Wrong folder</b> : file.duplicate ? <b className="status warning">Duplicate</b> : file.depthIssue ? <b className="status warning">Too deep</b> : <b className="status good"><CheckCircle2 size={13} /> Ready</b>}</span><span className="row-actions"><button title="Open folder" onClick={() => void api.openFolder(file.path.replace(/[\\/][^\\/]+$/, ''))}><FolderOpen size={17} /></button><button title="Categorize mod" aria-label={`Categorize ${file.name}`} onClick={() => { setCategory(defaultLocation(file)); setMoveError(''); setSelectedMod(file); }}><MoreHorizontal size={18} /></button></span></div>)}
        {visibleFiles.length < files.length && <div className="load-more-row"><span>{visibleFiles.length} of {files.length} shown</span><button className="button subtle small" onClick={() => setVisibleLimit(limit => limit + visibleBatchSize)}>Load more mods</button></div>}
      </div>}
    {fixOpen && settings && <Modal title={`Fix ${needsMoving.length} mod locations`} subtitle="These files will be moved to the folder Plumbuddy detected from their filenames." onClose={() => !moving && setFixOpen(false)}><div className="issue-review-list location-list">{needsMoving.slice(0, 8).map(file => <section key={file.id}><strong>{file.name}</strong><code>{file.relativePath} {'->'} {categoryLabel(file.recommendedLocation!)}</code></section>)}{needsMoving.length > 8 && <p>{needsMoving.length - 8} more files will be moved too.</p>}</div>{fixError && <p className="form-error">{fixError}</p>}<div className="modal-note"><Wrench size={17} /><span>Detection is based on filenames. The Sims 4 must be closed, and existing files are preserved with numbered filenames.</span></div><div className="modal-actions"><button className="button ghost" disabled={moving} onClick={() => setFixOpen(false)}>Cancel</button><button className="button primary" disabled={moving} onClick={() => void fixDetectedLocations()}><Wrench size={16} /> {moving ? 'Moving...' : 'Move to detected folders'}</button></div></Modal>}
    {categorizeAllOpen && settings && <Modal title="Categorize all mods" subtitle="Plumbuddy will move confident matches first. Anything unclear can be assigned or skipped." onClose={() => !moving && setCategorizeAllOpen(false)}><div className="comparison-summary"><span><strong>{confidentCategorize.length}</strong><small>Confident</small></span><span><strong>{needsUserChoice.length}</strong><small>Needs you</small></span><span><strong>{scan?.files.length ?? 0}</strong><small>Total</small></span><span><strong>{needsMoving.length}</strong><small>Wrong folder</small></span></div><div className="issue-review-list location-list">{confidentCategorize.slice(0, 5).map(file => <section key={file.id}><strong>{file.name}</strong><code>{file.relativePath} {'->'} {categoryLabel(file.recommendedLocation!)}</code></section>)}{needsUserChoice.slice(0, 5).map(file => <section key={file.id}><strong>Needs choice: {file.name}</strong><code>{file.relativePath}</code></section>)}</div>{needsUserChoice.length > 0 && <><label className="field-label" htmlFor="review-category">Assign unclear SET/MERGED/uncategorized files to</label><select id="review-category" className="location-select" value={reviewCategory} onChange={event => setReviewCategory(event.target.value)}>{organizedLocations.map(item => <option key={item} value={item}>{categoryLabel(item)}</option>)}</select></>}{fixError && <p className="form-error">{fixError}</p>}<div className="modal-note"><Wrench size={17} /><span>Room words win first, so Kitchen Set goes to Kitchen and Bedroom Merged goes to Bedroom. Plain SET/MERGED files are treated as unclear unless you assign them here.</span></div><div className="modal-actions"><button className="button ghost" disabled={moving} onClick={() => setCategorizeAllOpen(false)}>Skip unclear</button>{needsUserChoice.length > 0 && <button className="button subtle" disabled={moving} onClick={() => void assignReviewItems()}>Assign unclear</button>}<button className="button primary" disabled={moving || confidentCategorize.length === 0} onClick={() => void categorizeAllConfident()}><Wrench size={16} /> {moving ? 'Moving...' : `Move ${confidentCategorize.length} confident`}</button></div></Modal>}
    {bulkOpen && settings && <Modal title={`Categorize ${selectedFiles.length} selected mods`} subtitle="All selected files will be moved to the same organized folder." onClose={() => !moving && setBulkOpen(false)}><label className="field-label" htmlFor="bulk-category">Move selected mods to</label><select id="bulk-category" className="location-select" value={bulkCategory} onChange={event => setBulkCategory(event.target.value)}>{organizedLocations.map(item => <option key={item} value={item}>{categoryLabel(item)}</option>)}</select>{bulkError && <p className="form-error">{bulkError}</p>}<div className="modal-note"><FolderCog size={17} /><span>The Sims 4 must be closed. Existing files are preserved by creating numbered filenames.</span></div><div className="modal-actions"><button className="button ghost" disabled={moving} onClick={() => setBulkOpen(false)}>Cancel</button><button className="button primary" disabled={moving} onClick={() => void moveSelected()}><FolderCog size={16} /> {moving ? 'Moving...' : `Move ${selectedFiles.length} mods`}</button></div></Modal>}
    {selectedMod && settings && <Modal title="Categorize this mod" subtitle="Move this file into an organized folder without overwriting anything." onClose={() => setSelectedMod(null)}><div className="selected-mod-summary"><FileBox size={20} /><div><strong>{selectedMod.name}</strong><small>Currently: {selectedMod.relativePath}</small>{selectedMod.recommendedLocation && <small>Detected: {categoryLabel(selectedMod.recommendedLocation)}</small>}</div></div><label className="field-label" htmlFor="mod-category">Move to</label><select id="mod-category" className="location-select" value={category} onChange={event => setCategory(event.target.value)}>{organizedLocations.map(item => <option key={item} value={item}>{categoryLabel(item)}</option>)}</select>{moveError && <p className="form-error">{moveError}</p>}<div className="modal-note"><FolderCog size={17} /><span>The Sims 4 must be closed. If the filename already exists, Plumbuddy creates a numbered copy instead.</span></div><div className="modal-actions"><button className="button ghost" onClick={() => setSelectedMod(null)}>Cancel</button><button className="button primary" onClick={async () => { try { await api.moveMod(selectedMod.path, settings.modsFolder, category); await addActivity({ type: 'organize', title: 'Mod categorized', detail: `${selectedMod.name} -> ${categoryLabel(category)}` }); setSelectedMod(null); await rescanAndRefreshActivePack(1); } catch (error) { setMoveError(error instanceof Error ? error.message : 'The mod could not be moved'); } }}><FolderCog size={16} /> Move mod</button></div></Modal>}
  </>;
}
