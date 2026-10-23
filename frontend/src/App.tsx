import {Notifications} from './Notifications';
import {Refunds} from './Refunds';
import { SyncStatus } from './SyncStatus';
import { Categories } from './Categories';
import { AdminActions } from './ActionReason';
import { ActivityReport } from './ActivityReport';
import { DailyCash } from './DailyCash';
import { MoneyOut } from './MoneyOut';
import { useEffect, useState, useRef, useCallback, type FormEvent } from 'react';
import { api, ApiError, messageOf, type Session, type Shop } from './api';
import { StaffPanel } from './StaffPanel';
import { Catalogue } from './Catalogue';
import { Inventory } from './Inventory';
import { Sales } from './Sales';

export default function App() {
  const salesGuard = useRef<(() => Promise<boolean>) | null>(null);
  const setSalesGuard = useCallback((guard: (() => Promise<boolean>) | null) => { salesGuard.current = guard; }, []);
  async function navigateTab(next: string) { if (next === tab) return; if (salesGuard.current && !await salesGuard.current()) return; setTab(next); setEditingPassword(false); }
  async function changeShop(next: string) { if (next === shopId) return; if (salesGuard.current && !await salesGuard.current()) return; setVerifiedShop(''); sessionStorage.removeItem('verified-shop'); setShopId(next); }

  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState('');
  const [verifiedShop, setVerifiedShop] = useState(()=>{try{return sessionStorage.getItem('verified-shop')??'';}catch{return '';}});
  const [shopError, setShopError] = useState('');
  const [tab, setTab] = useState('sales');
  const [editingPassword,setEditingPassword]=useState(false);
  const [retry, setRetry] = useState(0);
  const shop = shops.find(item => item.id === shopId);
  const expire = () => { setSession(null); setEditingPassword(false); setVerifiedShop(''); sessionStorage.removeItem('verified-shop'); setShops([]); setShopId(''); setTab('sales'); };

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
    setShopError(''); setShops([]);
    api<{ shops: Shop[] }>('/shops', { signal: controller.signal }).then(result => {
      setShops(result.shops); setShopId(result.shops[0]?.id ?? '');
    }).catch(error => { if (!controller.signal.aborted) { if (error instanceof ApiError && error.status === 401) expire(); else setShopError(messageOf(error)); } });
    return () => controller.abort();
  }, [session]);

  useEffect(() => {
    if (!session || !shopId) return;
    const controller = new AbortController();
    setShopError('');
    api<{ shop: Shop }>(`/shops/${shopId}`, { signal: controller.signal }).then(result => {
      setShops(current => current.map(item => item.id === result.shop.id ? result.shop : item));
    }).catch(error => { if (!controller.signal.aborted) { if (error instanceof ApiError && error.status === 401) expire(); else setShopError(messageOf(error)); } });
    return () => controller.abort();
  }, [session, shopId]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setError('');
    try { const result = await api<Session>('/auth/login', { method: 'POST', body: { username: String(data.get('username')).trim().toLowerCase(), password: data.get('password') } }); form.reset(); setSession(result); }
    catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  async function logout() {
    if (!session) return; if (salesGuard.current && !await salesGuard.current()) return; setBusy(true); setError('');
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

  if (checking) return <main className="counter-login">Signing in...</main>;
  if (!session) return <main className="counter-login"><p className="login-brand">Tomjoy &amp; Joyfrimens</p><p>Staff sign-in</p><form onSubmit={login}><h1>Sign in</h1>{error && <p role="alert" className="error-message">{error}</p>}<label>Username<input name="username" autoComplete="username" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label><button className="primary-button full-button" disabled={busy}>Sign in</button></form></main>;
  const admin = session.user.role === 'admin';
  const tabs = [['sales','Counter'],['inventory','Storerooms'],['day','Daily cash'],['cash','Money out'],['account','Account']];
  return <AdminActions.Provider value={admin}><div className="counter-app">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="counter-topbar"><button className="counter-home" onClick={() => void navigateTab('sales')} aria-label="Go to counter">Counter</button><label className="counter-shop">Active shop<select value={shopId} onChange={e => void changeShop(e.target.value)}>{shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></header>
    <div className="counter-date"><time>{new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date())} GMT</time><span>{session.user.name}</span></div>
    <nav className="primary-nav" aria-label="Main navigation">{tabs.map(([id,label])=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>void navigateTab(id)}>{label}</button>)}</nav>
    <main id="main" className="counter-main"><div className="notification-row"><Notifications session={session} onExpired={expire}/></div><SyncStatus session={session}/>
      {tab !== 'sales' && tab !== 'inventory' && <button className="text-button back-counter" onClick={() => void navigateTab('sales')}>&larr; Back to counter</button>}
      {(error || shopError) && <p role="alert" className="error-message">{error || shopError}<button onClick={() => setRetry(n => n + 1)}>Reload</button></p>}
      {tab === 'account' ? <section className="account-page"><h1>My account</h1><header className="profile-heading"><span className="profile-avatar" aria-hidden="true">{session.user.name.slice(0,1).toUpperCase()}</span><div><h2>{session.user.name}</h2><p>@{session.user.username} <span className="role-badge">{admin?'Administrator':'Employee'}</span></p></div></header><div className="account-card"><h2>Settings</h2>{!admin&&<details className="account-permissions"><summary>Permissions</summary>{admin?<p>All shops, staff management, prices, daily cash and reports.</p>:<><p>Sell medicines in assigned shops.</p>{shops.map(s=><p key={s.id}><strong>{s.name}</strong><br/>Change prices: {s.can_change_prices?'Yes':'No'}<br/>Count daily cash: {s.can_count_cash?'Yes':'Override checkbox required'}</p>)}<p>Main storeroom access: {session.user.sharedStorageAccess?'Yes':'No'}</p></>}</details>}{!editingPassword?<button className="secondary-button" onClick={()=>setEditingPassword(true)}>Change password</button>:<form className="sales-form" onSubmit={changePassword}><label>Current password<input name="current" type="password" autoComplete="current-password" required/></label><label>New password<input name="next" type="password" autoComplete="new-password" minLength={12} required/></label><button className="primary-button" disabled={busy}>Save new password</button><button type="button" className="text-button" disabled={busy} onClick={()=>setEditingPassword(false)}>Cancel</button></form>}</div><div className="account-tools">{(admin||shop?.can_change_prices)&&<button className="text-button" onClick={()=>void navigateTab('catalogue')}>Manage medicines</button>}{admin&&<><button className="text-button" onClick={()=>void navigateTab('staff')}>Staff &amp; permissions</button><button className="text-button" onClick={()=>void navigateTab('reports')}>Activity reports</button><button className="text-button" onClick={()=>void navigateTab('refunds')}>Refunds</button><button className="text-button" onClick={()=>void navigateTab('categories')}>Medicine categories</button></>}</div><button className="account-signout" disabled={busy} onClick={()=>void logout()}>Sign out</button></section>
      : tab === 'refunds' && admin && shop ? <Refunds key={shop.id} session={session} shop={shop} onExpired={expire} setNavigationGuard={setSalesGuard}/>
      : tab === 'categories' && admin && shop ? <Categories key={shop.id} session={session} shop={shop} onExpired={expire} setNavigationGuard={setSalesGuard}/>
      : tab === 'reports' && admin ? <ActivityReport onExpired={expire}/>
      : tab === 'staff' && admin ? <StaffPanel session={session} shops={shops} onExpired={expire}/>
      : tab === 'inventory' ? <Inventory key={shop?.id??'shared'} session={session} shop={shop} onExpired={expire} setNavigationGuard={setSalesGuard}/>
      : shop ? tab === 'day' ? <DailyCash key={shop.id} session={session} shop={shop} onExpired={expire} setNavigationGuard={setSalesGuard}/> : tab === 'cash' ? <MoneyOut key={shop.id} session={session} shop={shop} onExpired={expire} setNavigationGuard={setSalesGuard}/>
      : tab === 'catalogue' && (admin || shop.can_change_prices) ? <Catalogue key={shop.id} session={session} shop={shop} onExpired={expire}/>
      : <Sales verified={verifiedShop===session.csrfToken+':'+shop.id} onVerified={()=>{const value=session.csrfToken+':'+shop.id;setVerifiedShop(value);sessionStorage.setItem('verified-shop',value);}} key={`${shop.id}:${tab}`} session={session} shop={shop} onExpired={expire} setNavigationGuard={setSalesGuard}/>
      : <p>{shopError ? 'Unable to load your shop.' : shops.length ? 'Loading shop...' : 'No shop assigned. Ask your administrator for access.'}</p>}
    </main>
  </div></AdminActions.Provider>;
}
