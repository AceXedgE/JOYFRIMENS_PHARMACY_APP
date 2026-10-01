import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, messageOf, type Session, type Shop, type Location } from './api';
import { StaffPanel } from './StaffPanel';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [shared, setShared] = useState<Location[]>([]);
  const [loadingShop, setLoadingShop] = useState(false);
  const [shopError, setShopError] = useState('');
  const [tab, setTab] = useState('overview');
  const [retry, setRetry] = useState(0);
  const shop = shops.find(item => item.id === shopId);
  const expire = () => { setSession(null); setShops([]); setLocations([]); setShared([]); setShopId(''); setTab('overview'); };

  useEffect(() => {
    const controller = new AbortController();
    setChecking(true); setError('');
    api<Session>('/auth/me', { signal: controller.signal }).then(setSession).catch(error => {
      if (!controller.signal.aborted) { if (error instanceof ApiError && error.status === 401) expire(); else setError(messageOf(error)); }
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    setShopError(''); setShops([]); setLocations([]); setShared([]);
    api<{ shops: Shop[] }>('/shops', { signal: controller.signal }).then(result => {
      setShops(result.shops); setShopId(result.shops[0]?.id ?? '');
    }).catch(error => { if (!controller.signal.aborted) { if (error instanceof ApiError && error.status === 401) expire(); else setShopError(messageOf(error)); } });
    if (session.user.sharedStorageAccess) api<{ locations: Location[] }>('/storage/shared', { signal: controller.signal }).then(result => setShared(result.locations)).catch(error => {
      if (!controller.signal.aborted) setShopError(messageOf(error));
    });
    return () => controller.abort();
  }, [session]);

  useEffect(() => {
    if (!session || !shopId) return;
    const controller = new AbortController();
    setLocations([]); setLoadingShop(true); setShopError('');
    api<{ shop: Shop; locations: Location[] }>(`/shops/${shopId}`, { signal: controller.signal }).then(result => {
      setLocations(result.locations);
      setShops(current => current.map(item => item.id === result.shop.id ? result.shop : item));
    }).catch(error => { if (!controller.signal.aborted) { if (error instanceof ApiError && error.status === 401) expire(); else setShopError(messageOf(error)); } })
      .finally(() => { if (!controller.signal.aborted) setLoadingShop(false); });
    return () => controller.abort();
  }, [session, shopId]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setError('');
    try { const result = await api<Session>('/auth/login', { method: 'POST', body: { username: String(data.get('username')).trim().toLowerCase(), password: data.get('password') } }); form.reset(); setSession(result); }
    catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  async function logout() {
    if (!session) return; setBusy(true); setError('');
    try { await api('/auth/logout', { method: 'POST', csrf: session.csrfToken }); expire(); }
    catch (error) { if (error instanceof ApiError && error.status === 401) expire(); else setError('Sign-out could not reach the server. Please reconnect and try again.'); }
    finally { setBusy(false); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session) return;
    const data = new FormData(event.currentTarget); setBusy(true); setError('');
    try { await api('/auth/password', { method: 'POST', csrf: session.csrfToken, body: { currentPassword: data.get('current'), newPassword: data.get('next') } }); expire(); setError('Password changed. Sign in with your new password.'); }
    catch (error) { if (error instanceof ApiError && error.status === 401) expire(); else setError(messageOf(error)); } finally { setBusy(false); }
  }

  if (checking) return <main className="login-shell"><p role="status">Opening your workspace…</p></main>;
  if (!session) return <main className="login-shell"><div className="login-intro"><span className="brand-mark">J</span><p className="eyebrow">TOMJOY & JOYFRIMENS PHARMACY</p><h1>A clear record.<br />A trusted team.</h1><p>Sign in to your assigned shops and workspace.</p><small>Cash only · Ghanaian cedi · GMT</small></div><form className="login-form panel" onSubmit={login}><h2>Welcome back</h2><p>Use your individual staff account.</p>{error && <p role="alert" className="error-message">{error}</p>}<label>Username<input name="username" required autoComplete="username" minLength={3} maxLength={64} disabled={busy} /></label><label>Password<input name="password" type="password" required autoComplete="current-password" maxLength={128} disabled={busy} /></label><button className="primary-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><button type="button" className="text-button" disabled={busy} onClick={() => setRetry(value => value + 1)}>Retry connection</button><small>Need an account? Ask your administrator.</small></form></main>;

  return <div className="app"><a className="skip" href="#main">Skip to workspace</a><aside className="sidebar"><a className="brand" href="#main"><span className="brand-mark">J</span><span>joyfrimens<small>PHARMACY WORKSPACE</small></span></a><div className="side-label">YOUR WORKSPACE</div><nav aria-label="Workspace">{[['overview', 'Overview'], ...(session.user.role === 'admin' ? [['staff', 'Staff & permissions']] : []), ['account', 'My account']].map(([value, label]) => <button key={value} className={tab === value ? 'nav-active' : ''} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>{label}</button>)}</nav><div className="side-note">Signed in as {session.user.name}<p>{session.user.role === 'admin' ? 'Administrator' : 'Employee'}<br />Individual account · auditable actions</p></div></aside>
    <div className="workspace"><header className="topbar"><span>{session.user.name}</span><div className="header-actions"><label className="shop-picker">Active shop<select value={shopId} onChange={event => setShopId(event.target.value)} disabled={!shops.length}>{!shops.length && <option value="">No assigned shops</option>}{shops.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="text-button" onClick={() => void logout()} disabled={busy}>Sign out</button></div></header>
      <main id="main">{error && <p role="alert" className="error-message">{error}</p>}{shopError && <p role="alert" className="error-message">{shopError} <button className="text-button" onClick={() => setRetry(value => value + 1)}>Reload access</button></p>}
        {tab === 'staff' && session.user.role === 'admin' ? <StaffPanel session={session} shops={shops} onExpired={expire} /> : tab === 'account' ? <section><h1>My account</h1><p>{session.user.name} · @{session.user.username}</p><form className="panel form-grid" onSubmit={changePassword}><h2>Change password</h2><p>Changing your password signs you out on every device.</p><label>Current password<input name="current" type="password" required autoComplete="current-password" maxLength={128} disabled={busy} /></label><label>New password<input name="next" type="password" required minLength={12} maxLength={128} autoComplete="new-password" disabled={busy} /></label><button className="primary-button" disabled={busy}>Change password and sign out</button></form></section> : <>
          <div className="heading"><div><p className="eyebrow">YOUR PHARMACY WORKSPACE</p><h1>Every sale accounted for.</h1><p className="intro">Your shops, your team, and a clear record of access.</p></div><span className="stage">SPRINT 02 · ACCOUNTS & SHOPS</span></div>
          <section className="notice"><span className="notice-icon">i</span><div><strong>Accounts and shop access are connected.</strong><p>Drug prices, sales, cash counts, and offline selling are coming in later sprints. No business transactions can be entered yet.</p></div></section>
          {!shops.length && !shopError && <p className="notice">No shops are assigned to this account. Ask an administrator to grant access.</p>}
          <section className="summary"><article><p>Active workspace</p><h2>{shop?.name ?? 'No shop selected'}</h2><span>{loadingShop ? 'Loading access…' : shopError ? 'Access needs refreshing' : shop?.can_change_prices ? 'Price-changing permission enabled' : 'Standard staff access'}</span></article><article><p>Payment policy</p><h2>Cash only</h2><span>{shop?.currency ?? 'Currency not configured'} · {shop?.timezone === 'Etc/GMT' ? 'GMT' : shop?.timezone ?? 'Timezone not configured'}</span></article><article><p>Your account</p><h2>{session.user.role === 'admin' ? 'Administrator' : 'Employee'}</h2><span>{shops.length} accessible {shops.length === 1 ? 'shop' : 'shops'}</span></article></section>
          <section className="storage"><div><p className="eyebrow">SHOP STOCK LOCATIONS</p><h2>Separate places.<br />Clear ownership.</h2><p>Locations belong to the selected shop. Shared main storage supplies both pharmacies.</p></div><div className="network">{loadingShop ? <p role="status">Loading locations…</p> : <div className="branches">{locations.map(location => <div key={location.id}><strong>{location.kind === 'shelf' ? 'Shop shelves' : 'Shop storeroom'}</strong><span>{location.name}</span></div>)}</div>}<small>Location structure is live. Inventory quantities arrive in Sprint 4.</small></div></section>
          {shared.length > 0 && <section className="panel shared-panel"><h2>Shared main storage</h2><p>Business-owned storage serving both shops.</p><div className="branches">{shared.map(location => <div key={location.id}><strong>{location.name}</strong></div>)}</div></section>}
          <footer><span>Joyfrimens · Built around accountability</span><span>Shop access is checked by the server on every request.</span></footer>
        </>}
      </main>
    </div>
  </div>;
}
