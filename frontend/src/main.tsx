import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const shops = ['Shop 1', 'Shop 2'];

function App() {
  const [shop, setShop] = useState(shops[0]);
  const [connection, setConnection] = useState<'checking' | 'connected' | 'unavailable'>('checking');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    let active = true;
    setConnection('checking');
    fetch('/api/health', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Server unavailable');
        const result: unknown = await response.json();
        if (typeof result !== 'object' || result === null || !('service' in result) || result.service !== 'joyfrimens-api' || !('status' in result) || result.status !== 'ok') throw new Error('Unexpected response');
        if (active) setConnection('connected');
      })
      .catch(() => { if (active) setConnection('unavailable'); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  useEffect(() => {
    const refresh = () => setAttempt(value => value + 1);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return <div className="app">
    <a className="skip" href="#main">Skip to workspace</a>
    <aside className="sidebar">
      <a className="brand" href="#main"><span className="brand-mark">J</span><span>joyfrimens<small>PHARMACY WORKSPACE</small></span></a>
      <div className="side-label">YOUR WORKSPACE</div>
      <nav aria-label="Workspace"><a className="nav-active" href="#main">Overview <span>01</span></a><a href="#operations">Shop operations <span>02</span></a><a href="#storage">Storage network <span>03</span></a></nav>
      <div className="side-note"><span className="dot" />Built for every shift.<p>Two shops. Shared storage.<br />A clear record of every movement.</p></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span>Workspace / <strong>Overview</strong></span><label className="shop-picker">Viewing shop<select value={shop} onChange={event => setShop(event.target.value)}>{shops.map(name => <option key={name}>{name}</option>)}</select></label></header>
      <main id="main">
        <div className="heading"><div><p className="eyebrow">A CLEARER VIEW OF YOUR PHARMACY</p><h1>Every sale accounted for.</h1><p className="intro">Keep sales, cash, and stock connected across your shops.</p></div><span className="stage">SPRINT 01 · FOUNDATION</span></div>
        <section className="notice" aria-label="Development status"><span className="notice-icon">i</span><div><strong>Your workspace is taking shape.</strong><p>This is a development preview. Shop names are placeholders; sales, accounts, and stock records are not connected yet.</p></div></section>
        <section className="summary" aria-label="Workspace summary">
          <article><p>Active workspace</p><h2>{shop}</h2><span>Shelves + dedicated storeroom</span></article>
          <article><p>Payment policy</p><h2>Cash only</h2><span>Cash received, change, and drawer counts</span></article>
          <article><p>API connection</p><h2 className="connection" role="status">{connection === 'connected' ? 'Connected' : connection === 'checking' ? 'Checking…' : 'Unavailable'}</h2><button className="text-button" disabled={connection === 'checking'} onClick={() => setAttempt(value => value + 1)}>Check connection <span aria-hidden="true">↗</span></button></article>
        </section>
        <section id="operations"><div className="section-heading"><h2>A place for the daily essentials</h2><span>COMING IN NEXT SPRINTS</span></div><div className="operations">
          {[['01', 'Find a drug, know the price', 'Search the catalogue by name, strength, or pack size. Approved prices, always in view.', 'Catalogue & prices'], ['02', 'Record the whole sale', 'Build a basket for the selected shop, choose the stock source, and calculate cash change.', 'Sales workspace'], ['03', 'Close with confidence', 'Count one drawer while sales continue in another. Keep every shortage and handover visible.', 'Cash reconciliation']].map(([number, title, description, label]) => <article key={number}><span className="number">{number}</span><h3>{title}</h3><p>{description}</p><span className="coming">{label}<span aria-hidden="true">↗</span></span></article>)}
        </div></section>
        <section id="storage" className="storage"><div><p className="eyebrow">ONE CONNECTED STOCK NETWORK</p><h2>Shared supply.<br />Separate shop records.</h2><p>Main storage supplies both shops. Each shop tracks its own shelves and storeroom.</p></div><div className="network"><div className="main-store"><strong>Main storage</strong><span>Room 1 · Room 2</span></div><div className="branches">{shops.map(name => <div key={name} className={name === shop ? 'selected-node' : ''}><strong>{name}</strong><span>Shelves · Storeroom</span></div>)}</div><small>Planned stock structure · no live quantities yet</small></div></section>
        <footer><span>Joyfrimens · Built around accountability</span><span>Offline sales and 8:30 p.m. reminders are planned.</span></footer>
      </main>
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
