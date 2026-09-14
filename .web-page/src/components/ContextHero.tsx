import React, { useEffect, useState } from 'react';
import { Folder, Search, ArrowRight, FileText, Bot, Check, Pause, Play } from 'lucide-react';
import './context-hero.css';
import './paper-demo.css';

const steps = ['Add your doc directories', 'Agent loads the skill', 'Agent runs the CLI', 'Agent reads and answers'];
export function ContextHero({ onSearch, onInstall }: { onSearch: () => void; onInstall: () => void }) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { if (media.matches) { setPaused(true); setStep(3); } };
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setStep(s => (s + 1) % steps.length), 3200);
    return () => window.clearInterval(timer);
  }, [paused]);
  return <section className="context-hero" aria-labelledby="context-title">
    <div className="app-container">
      <div className="context-intro">
        <span className="context-eyebrow">LOCAL KNOWLEDGE. SHARED CONTEXT.</span>
        <h1 id="context-title">Your knowledge is scattered.<br /><span>Your agent’s context<br className="context-mobile-break" /> doesn’t have to be.</span></h1>
        <p>Your agent uses the Local Search skill and CLI to find context across your local directories, read the right documents, and answer from your sources.</p>
        <div className="context-actions"><button onClick={onSearch}>Try live search <ArrowRight size={17} /></button><button onClick={onInstall}>Get started <ArrowRight size={17} /></button></div>
      </div>
      <div className="paper-demo" data-step={step} data-paused={paused}>
        <div className="paper-toolbar"><span className="paper-window-dots" aria-hidden="true">● ● ●</span><span>local-search / your project</span><button onClick={() => setPaused(p => !p)} aria-label={paused ? 'Play illustration' : 'Pause illustration'}>{paused ? <Play size={15} /> : <Pause size={15} />}{paused ? 'Play' : 'Pause'}</button></div>
        <div className="paper-stage">
          <div className="paper-files"><span className="paper-note">Your knowledge, right where it belongs.</span><h2>Your document folders</h2>{['Project docs', 'How things work today', 'Component details'].map((name, i) => <div className="paper-folder" key={name} style={{ animationDelay: `${i * 180}ms` }}><Folder size={27} /><div><strong>{name}</strong><small>{['payments-service/docs', 'knowledge-base/current-reality', 'knowledge-base/components'][i]}</small></div><Check size={16} /></div>)}<div className="paper-setup"><span>ONE-TIME SETUP · LOCAL SEARCH CLI</span><code>local-search repo add ./docs project-docs</code><small>Add each folder. Your files stay in place.</small></div></div>
          <div className="paper-transfer" aria-hidden="true"><ArrowRight size={30} /><span>local context</span></div>
          <div className="paper-agent"><div className="paper-agent-header"><Bot size={24} /><div><strong>Your AI Agent</strong><small>with the Local Search skill</small></div><span className="paper-status">{step === 0 ? 'Ready' : step === 3 ? 'Sourced' : 'Working'}</span></div>
            <div className={`paper-question ${step >= 1 ? 'paper-visible' : ''}`}><span>YOU ASK</span><p>How does our project work?</p></div>
            <div className={`paper-skill ${step >= 1 ? 'paper-visible' : ''}`}><Check size={15} /><span>Local Search skill loaded</span></div>
            <div className={`paper-search ${step >= 2 ? 'paper-visible' : ''}`}><div><Search size={17} /><strong>Finding the right documents…</strong></div><code>local-search search "project" --repos project-docs,platform-current-reality,platform-components</code><small>The agent runs this for you.</small></div>
            <div className={`paper-answer ${step >= 3 ? 'paper-visible' : ''}`}><span><Check size={16} /> ANSWER WITH SOURCES</span><p>Here’s how your project works, based on your documentation.</p><div><FileText size={16} /> Project overview <small>[1]</small></div><div><FileText size={16} /> Component responsibilities <small>[2]</small></div><small>The agent reads the documents before answering.</small></div>
          </div>
          <span className="paper-bottom-note">Less explaining. More moving forward.</span>
        </div>
        <div className="paper-steps">{['Add your folders once', 'Ask your AI', 'It finds the right docs', 'Get an answer with sources'].map((label, index) => <button key={label} aria-pressed={step === index} onClick={() => { setStep(index); setPaused(true); }}><span>0{index + 1}</span><strong>{label}</strong><small>{['Make your documents searchable.', 'Use your own words.', 'Across your configured folders.', 'See where the answer came from.'][index]}</small></button>)}</div>
      </div>
      <p className="context-caption">One context layer. The right sources for every project. <span>Indexed locally · Available across sessions</span></p>
    </div>
  </section>;
}
