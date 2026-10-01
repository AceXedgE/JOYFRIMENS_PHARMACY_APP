import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, messageOf, type Session, type Shop, type Staff, type Member, type AuditEvent } from './api';

function AccessFields({ shops, value, setValue, disabled = false }: { shops: Shop[]; value: Member[]; setValue: (value: Member[]) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled}><legend>Shop access and price permissions</legend>{shops.map(shop => {
    const member = value.find(item => item.shopId === shop.id);
    return <div className="access-row" key={shop.id}>
      <label><input type="checkbox" checked={!!member} onChange={event => setValue(event.target.checked ? [...value, { shopId: shop.id, canChangePrices: false }] : value.filter(item => item.shopId !== shop.id))} />{shop.name}</label>
      <label><input type="checkbox" disabled={!member || disabled} checked={member?.canChangePrices ?? false} onChange={event => setValue(value.map(item => item.shopId === shop.id ? { ...item, canChangePrices: event.target.checked } : item))} />May change prices</label>
    </div>;
  })}</fieldset>;
}

function StaffCard({ staff, shops, currentId, save, busy }: { staff: Staff; shops: Shop[]; currentId: string; save: (path: string, method: string, body: unknown) => Promise<void>; busy: boolean }) {
  const [members, setMembers] = useState(staff.memberships);
  const [shared, setShared] = useState(staff.sharedStorageAccess);
  useEffect(() => { setMembers(staff.memberships); setShared(staff.sharedStorageAccess); }, [staff]);
  return <article className="staff-card"><div className="staff-heading"><div><h3>{staff.name}</h3><p>@{staff.username} · {staff.role} · {staff.active ? 'Active' : 'Disabled'}</p></div></div>
    {staff.role === 'admin' ? <p>Access to both shops, shared storage, and price changes.</p> : <>
      <AccessFields shops={shops} value={members} setValue={setMembers} disabled={busy} />
      <label className="check-label"><input type="checkbox" checked={shared} disabled={busy} onChange={event => setShared(event.target.checked)} />Access to shared main storage</label>
      <button className="secondary-button" disabled={busy} onClick={() => void save(`/admin/users/${staff.id}/access`, 'PUT', { memberships: members, sharedStorageAccess: shared })}>Save permissions</button>
    </>}
    {staff.id !== currentId && <button className="text-button status-button" disabled={busy} onClick={() => void save(`/admin/users/${staff.id}/status`, 'PATCH', { active: !staff.active })}>{staff.active ? 'Disable account and sign out' : 'Enable account'}</button>}
  </article>;
}

export function StaffPanel({ session, shops, onExpired }: { session: Session; shops: Shop[]; onExpired: () => void }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [role, setRole] = useState('employee');
  const [shared, setShared] = useState(false);
  async function refresh(signal?: AbortSignal) {
    const [users, audit] = await Promise.all([api<{ users: Staff[] }>('/admin/users', { signal }), api<{ events: AuditEvent[] }>('/admin/audit', { signal })]);
    setStaff(users.users); setEvents(audit.events); setLoaded(true);
  }
  function fail(error: unknown) { if (error instanceof ApiError && error.status === 401) onExpired(); else setError(messageOf(error)); }
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(error => { if (!controller.signal.aborted) fail(error); });
    return () => controller.abort();
  }, []);
  async function save(path: string, method: string, body: unknown) {
    setBusy(true); setError(''); setSuccess('');
    try { await api(path, { method, body, csrf: session.csrfToken }); await refresh(); setSuccess('Changes saved and recorded in the audit history.'); }
    catch (error) { fail(error); }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setError(''); setSuccess('');
    try {
      await api('/admin/users', { method: 'POST', csrf: session.csrfToken, body: {
        username: String(data.get('username')).trim().toLowerCase(), name: String(data.get('name')).trim(), password: data.get('password'), role,
        memberships: role === 'admin' ? [] : members, sharedStorageAccess: role === 'admin' || shared,
      } });
      form.reset(); setMembers([]); setRole('employee'); setShared(false);
      await refresh(); setSuccess('Account created. Share the initial password securely; staff can change it after signing in.');
    } catch (error) { fail(error); } finally { setBusy(false); }
  }
  return <section id="staff"><div className="section-heading"><h2>Staff & permissions</h2><span>ADMINISTRATOR</span></div>
    {error && <p role="alert" className="error-message">{error}</p>}{success && <p role="status" className="success-message">{success}</p>}
    <form className="panel form-grid" onSubmit={create}><h3>Create a staff account</h3>
      <label>Full name<input name="name" required maxLength={100} autoComplete="off" disabled={busy} /></label>
      <label>Username<input name="username" required minLength={3} maxLength={64} pattern="[a-zA-Z0-9._-]+" autoComplete="off" disabled={busy} /></label>
      <label>Initial password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" disabled={busy} /><small>At least 12 characters. Never reuse your own password.</small></label>
      <label>Account role<select value={role} onChange={event => setRole(event.target.value)} disabled={busy}><option value="employee">Employee</option><option value="admin">Administrator — all shops and staff access</option></select></label>
      {role === 'employee' ? <><AccessFields shops={shops} value={members} setValue={setMembers} disabled={busy} /><label className="check-label"><input type="checkbox" checked={shared} onChange={event => setShared(event.target.checked)} disabled={busy} />Access to shared main storage</label></> : <p className="notice">Administrators can create accounts and change permissions and prices across both shops.</p>}
      <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Create account'}</button>
    </form>
    {!loaded && !error && <p role="status">Loading staff…</p>}
    <div className="staff-grid">{staff.map(user => <StaffCard key={user.id} staff={user} shops={shops} currentId={session.user.id} save={save} busy={busy} />)}</div>
    <div className="section-heading"><h2>Recent account activity</h2><button className="text-button" disabled={busy} onClick={() => void refresh().catch(fail)}>Refresh</button></div>
    <div className="audit-list">{events.map(event => <article key={event.id}><strong>{event.action.replaceAll('.', ' · ').replaceAll('_', ' ')}</strong><span>{event.actor_name ?? 'Unauthenticated attempt'}</span><time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString('en-GB', { timeZone: 'Etc/GMT', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} GMT</time><details><summary>Details</summary><pre>{JSON.stringify(event.details, null, 2)}</pre></details></article>)}</div>
  </section>;
}
