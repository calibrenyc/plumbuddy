import { useMemo, useState } from 'react';
import { Archive, ArrowRight, CheckCircle2, Download, FileArchive, FolderOpen, ShieldCheck, Wand2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { categoryLabel, organizedLocations } from '../lib/categories';
import { formatBytes } from '../lib/format';
import type { BulkInstallChoice, BulkZipPlan } from '../types';

export function BulkPage() {
  const { settings, runScan, addActivity } = useApp();
  const [url, setUrl] = useState('');
  const [plan, setPlan] = useState<BulkZipPlan | null>(null);
  const [choices, setChoices] = useState<Record<string, BulkInstallChoice>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const entries = plan?.entries ?? [];
  const autoCount = entries.filter(entry => !entry.needsReview && entry.recommendedLocation).length;
  const reviewCount = entries.filter(entry => entry.needsReview).length;
  const installChoices = useMemo(() => entries.map(entry => choices[entry.id] ?? { id: entry.id, selectedLocation: entry.selectedLocation }), [choices, entries]);

  if (!settings) return null;

  async function prepare() {
    if (!settings || !url.trim()) return;
    setBusy('Preparing ZIP...');
    setError('');
    setDone('');
    try {
      const nextPlan = await api.prepareBulkZip(url.trim(), settings.downloadsFolder);
      setPlan(nextPlan);
      setChoices(Object.fromEntries(nextPlan.entries.map(entry => [entry.id, { id: entry.id, selectedLocation: entry.selectedLocation }])));
      await addActivity({ type: 'download', title: 'Bulk ZIP prepared', detail: `${nextPlan.entries.length} installable files found in ${nextPlan.archiveName}` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Bulk ZIP could not be prepared');
    } finally {
      setBusy('');
    }
  }

  async function chooseZip() {
    if (!settings) return;
    setBusy('Preparing ZIP...');
    setError('');
    setDone('');
    try {
      const filePaths = await api.chooseZipFiles('Choose one or more ZIPs to bulk install', settings.downloadsFolder);
      if (!filePaths.length) return;
      const nextPlan = filePaths.length === 1 ? await api.prepareBulkZipFile(filePaths[0]) : await api.prepareBulkZipFiles(filePaths);
      setPlan(nextPlan);
      setChoices(Object.fromEntries(nextPlan.entries.map(entry => [entry.id, { id: entry.id, selectedLocation: entry.selectedLocation }])));
      await addActivity({ type: 'download', title: 'Bulk ZIP prepared', detail: `${nextPlan.entries.length} installable files found in ${nextPlan.archiveName}` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Bulk ZIP could not be prepared');
    } finally {
      setBusy('');
    }
  }

  async function install() {
    if (!settings || !plan) return;
    setBusy('Installing ZIP...');
    setError('');
    setDone('');
    try {
      const result = await api.installBulkZip(plan.id, installChoices, settings.modsFolder);
      setDone(`${result.installedFiles} files installed. ZIP deleted.`);
      setPlan(null);
      setChoices({});
      setUrl('');
      await addActivity({ type: 'download', title: 'Bulk ZIP installed', detail: `${result.installedFiles} files installed · ${result.skippedFiles} skipped` });
      await runScan();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Bulk ZIP could not be installed');
    } finally {
      setBusy('');
    }
  }

  function updateChoice(id: string, update: Partial<BulkInstallChoice>) {
    setChoices(current => ({ ...current, [id]: { ...(current[id] ?? { id, selectedLocation: 'Uncategorized' }), ...update } }));
  }

  return <>
    <PageHeader eyebrow="BULK INSTALL" title="Bulk" description="Paste a ZIP link, review every mod inside, and let Plumbuddy auto-place the confident matches." />

    <section className="download-hero bulk-hero">
      <div className="download-copy">
        <span className="eyebrow">ZIP REVIEW</span>
        <h2>Install a whole archive, neatly.</h2>
        <p>Plumbuddy reads the ZIP first. Files with strong keywords are pre-sorted, and unclear SET/MERGED files wait for your choice.</p>
        <div className="url-form">
          <FileArchive size={18} />
          <input value={url} onChange={event => setUrl(event.target.value)} placeholder="Paste a ZIP mod collection link..." />
          <button disabled={!url.trim() || Boolean(busy)} onClick={() => void prepare()}>{busy === 'Preparing ZIP...' ? 'Reading...' : 'Review ZIP'} <ArrowRight size={16} /></button>
        </div>
        <button className="button subtle bulk-file-button" disabled={Boolean(busy)} onClick={() => void chooseZip()}><FolderOpen size={15} /> Choose ZIP file(s) instead</button>
        <div className="safety-note"><ShieldCheck size={14} /> Supported Sims files only. Unsafe archive paths are blocked and successful ZIPs are deleted.</div>
      </div>
      <div className="download-visual" aria-hidden="true"><div className="download-ring r1" /><div className="download-ring r2" /><div className="download-badge"><Archive size={38} /><i><Wand2 size={15} /></i></div></div>
    </section>

    {error && <p className="form-error">{error}</p>}
    {done && <div className="inline-banner"><CheckCircle2 size={19} /><div><strong>Bulk install complete</strong><span>{done}</span></div></div>}

    {plan && <section className="section-block">
      <div className="section-heading"><div><h2>{plan.archiveName}</h2><p>{entries.length} installable files · {autoCount} auto-sorted · {reviewCount} need review · {plan.skippedFiles} unsupported skipped</p></div><button className="button primary" disabled={Boolean(busy)} onClick={() => void install()}><Download size={16} /> {busy === 'Installing ZIP...' ? 'Installing...' : 'Install reviewed files'}</button></div>
      <div className="bulk-list">
        {entries.map(entry => {
          const choice = choices[entry.id] ?? { id: entry.id, selectedLocation: entry.selectedLocation };
          return <article key={entry.id} className={entry.needsReview ? 'review' : ''}>
            <div><strong>{entry.name}</strong><small>{entry.archivePath} · {formatBytes(entry.size)}</small>{entry.recommendedLocation && <em>Detected: {categoryLabel(entry.recommendedLocation)}</em>}</div>
            <select className="location-select" value={choice.selectedLocation} disabled={choice.skip} onChange={event => updateChoice(entry.id, { selectedLocation: event.target.value })}>{organizedLocations.map(location => <option key={location} value={location}>{categoryLabel(location)}</option>)}</select>
            <label className="skip-toggle"><input type="checkbox" checked={Boolean(choice.skip)} onChange={event => updateChoice(entry.id, { skip: event.target.checked })} /> Skip</label>
          </article>;
        })}
      </div>
    </section>}

    {busy && <Modal title={busy} subtitle="Large archives can take a bit. Plumbuddy is still working safely." onClose={() => undefined}>
      <div className="install-log"><div className="plumbob-progress" style={{ ['--progress' as string]: '45%' }}><span /><strong>...</strong></div><div className="install-log-lines"><strong>Please wait</strong><span className="active">{busy === 'Preparing ZIP...' ? 'Downloading and reading archive entries...' : 'Extracting selected files and deleting the ZIP after success...'}</span></div></div>
    </Modal>}
  </>;
}
