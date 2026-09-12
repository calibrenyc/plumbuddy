import { useEffect, useState } from 'react';
import { Archive, Check, ChevronLeft, ChevronRight, Folder, FolderHeart, HardDrive, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import type { AppSettings } from '../types';
import { Brand } from './Brand';

const stepData = [
  { eyebrow: 'LET’S GET STARTED', title: 'Find your Sims mods', text: 'We’ll connect to the folder The Sims 4 uses. Nothing will be moved or changed yet.', icon: FolderHeart, field: 'modsFolder' as const, label: 'Sims 4 Mods folder' },
  { eyebrow: 'STEP TWO', title: 'A home for your mod packs', text: 'Keep pack manifests separate from your live Mods folder so swapping setups stays clean and safe.', icon: Folder, field: 'packStorage' as const, label: 'Mod pack storage' },
  { eyebrow: 'ONE LAST THING', title: 'Protect your collection', text: 'Choose where Plumbuddy should keep ZIP backups. Another drive is the safest choice.', icon: Archive, field: 'backupStorage' as const, label: 'Backup storage' },
];

export function Onboarding() {
  const { settings, updateSettings } = useApp();
  const [step, setStep] = useState(0);
  const [paths, setPaths] = useState<Partial<AppSettings>>({});
  const current = stepData[step];
  useEffect(() => { if (settings) setPaths(settings); }, [settings]);
  if (!settings) return <div className="app-loading"><span className="brand-mark"><span /></span></div>;

  async function browse() {
    const selected = await api.chooseFolder(`Choose ${current.label}`, paths[current.field] as string);
    if (selected) setPaths(value => ({ ...value, [current.field]: selected }));
  }
  async function next() {
    if (step < 2) setStep(value => value + 1);
    else await updateSettings({ ...paths, displayName: (paths.displayName || 'Player').trim() || 'Player', onboardingComplete: true });
  }
  const Icon = current.icon;
  return <main className="onboarding">
    <header className="onboarding-header"><Brand /><span>Your files stay on your computer <Check size={14} /></span></header>
    <section className="onboarding-visual">
      <div className="visual-glow" />
      <div className="folder-scene">
        <div className="scene-card scene-a"><HardDrive size={22} /><span>3.7 GB</span></div>
        <div className="folder-art"><span className="folder-tab" /><span className="mini-plumbob" /><div className="file-line l1" /><div className="file-line l2" /><div className="file-line l3" /></div>
        <div className="scene-card scene-b"><Search size={19} /><span>124 mods found</span></div>
      </div>
      <div className="visual-copy"><span>{String(step + 1).padStart(2, '0')} / 03</span><h2>{step === 0 ? 'Your mods, finally organized.' : step === 1 ? 'Every setup gets its own space.' : 'Peace of mind, built in.'}</h2></div>
    </section>
    <section className="onboarding-form">
      <div className="form-inner">
        <div className="step-icon"><Icon size={22} /></div>
        <span className="eyebrow">{current.eyebrow}</span>
        <h1>{current.title}</h1><p className="lead">{current.text}</p>
        {step === 0 && <><label className="path-label" htmlFor="setup-display-name">What should we call you?</label><input id="setup-display-name" className="text-input onboarding-name-input" value={paths.displayName ?? ''} onChange={event => setPaths(value => ({ ...value, displayName: event.target.value }))} placeholder="Your name" /></>}
        <label className="path-label">{current.label}</label>
        <button className="path-picker" onClick={browse}><span><Folder size={19} /><span>{paths[current.field]}</span></span><b>Browse</b></button>
        <div className="recommendation"><Check size={15} /><span><strong>Recommended location</strong>{step === 2 ? ' Backups are never stored inside your Mods folder.' : ' You can change this later in Settings.'}</span></div>
        <div className="onboarding-actions">
          {step > 0 && <button className="button ghost" onClick={() => setStep(value => value - 1)}><ChevronLeft size={17} /> Back</button>}
          <button className="button primary wide" onClick={next}>{step === 2 ? 'Finish setup' : 'Use this folder'} <ChevronRight size={17} /></button>
        </div>
        <div className="step-dots" aria-label={`Step ${step + 1} of 3`}>{stepData.map((_, index) => <span key={index} className={index === step ? 'active' : index < step ? 'done' : ''} />)}</div>
      </div>
    </section>
  </main>;
}
