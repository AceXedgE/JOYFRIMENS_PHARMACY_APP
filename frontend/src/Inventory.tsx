import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, messageOf, type Location, type Session, type Shop } from './api';
import './inventory.css';
import { DeliveryForm } from './DeliveryForm';
import { SupplierReceipt } from './SupplierReceipt';

interface Unit { id: string; product_id: string; label: string; base_quantity: number; name: string; strength: string; dosage_form: string; base_unit: string }
interface Options { locations: Location[]; destinations: Location[]; units: Unit[]; canAdjust: boolean }
interface Stock { batch_id: string; product_id: string; name: string; strength: string; dosage_form: string; base_unit: string; batch_number: string; expiry: string; quantity: number; reserved: number; version: number }
interface Movement { id: string; source_id: string; destination_id: string; source_name: string; destination_name: string; name: string; strength: string; base_unit: string; batch_number: string; expiry: string; quantity: number; received: number; lost: number; dispatched_by_name: string; dispatched_at: string; reason: string }
interface Ledger { document_id: string | null; receipt_id: string | null; approved_at: string | null; approved_by_name: string | null; id: string; name: string; batch_number: string; delta: number; kind: string; reason: string; actor_name: string; created_at: string; supplier: string | null; reference: string | null; expected_quantity: number | null; received_quantity: number | null; details: Record<string, number> }
interface Data { stocks: Stock[]; transfers: Movement[]; ledger: Ledger[] }
interface Pending { path: string; body: Record<string, unknown>; label: string }
const dateTime = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Etc/GMT' });
const number = (form: FormData, key: string) => Number(form.get(key));
const value = (form: FormData, key: string) => String(form.get(key) ?? '');
type Submit = (path: string, body: Record<string, unknown>, label: string) => Promise<void>;

export function Inventory({ session, shop, onExpired }: { session: Session; shop: Shop | undefined; onExpired: () => void }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [locationId, setLocationId] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState<'receive' | Stock | null>(null);
  const storageKey = `inventory-pending:${session.user.id}`;
  const [pending, setPending] = useState<Pending | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as Pending | null; } catch { return null; }
  });
  const fail = (e: unknown) => { if (e instanceof ApiError && e.status === 401) onExpired(); else setError(messageOf(e)); };
  useEffect(() => {
    const controller = new AbortController();
    api<Options>('/inventory/options', { signal: controller.signal }).then(result => {
      setOptions(result); setLocationId(result.locations.find(l => l.shop_id === shop?.id && l.kind === 'shelf')?.id ?? result.locations.find(l => l.shop_id === shop?.id)?.id ?? result.locations.find(l => l.shop_id === null)?.id ?? '');
    }).catch(e => { if (!controller.signal.aborted) fail(e); });
    return () => controller.abort();
  }, [shop?.id]); // The panel is also keyed by shop; unsaved forms cannot move between shops.
  useEffect(() => {
    setData(null); if (!locationId) return;
    const controller = new AbortController();
    api<Data>(`/inventory/locations/${locationId}`, { signal: controller.signal }).then(setData).catch(e => { if (!controller.signal.aborted) fail(e); });
    return () => controller.abort();
  }, [locationId, refresh]);
  const location = options?.locations.find(l => l.id === locationId);
  const locations = options?.locations.filter(l => l.shop_id === shop?.id || l.shop_id === null) ?? [];
  async function send(operation: Pending) {
    setBusy(true); setError(''); setSuccess('');
    try {
      await api(operation.path, { method: 'POST', csrf: session.csrfToken, body: operation.body });
      sessionStorage.removeItem(storageKey); setPending(null); setForm(null); setSuccess(`${operation.label} recorded.`); setRefresh(n => n + 1);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        sessionStorage.removeItem(storageKey); setPending(null);
        if (e.status === 409 && !e.message.includes('Tick')) { setForm(null); setRefresh(n => n + 1); }
      }
      fail(e);
    } finally { setBusy(false); }
  }
  const submit: Submit = async (path, body, label) => {
    if (busy || pending) return;
    const operation = { path, body: { ...body, requestKey: crypto.randomUUID() }, label: `${label} · ${location?.name ?? ''}` };
    try { sessionStorage.setItem(storageKey, JSON.stringify(operation)); } catch { setError('Enable browser session storage before recording stock, so an interrupted request can be retried safely.'); return; }
    setPending(operation); await send(operation);
  };
  return <section className="inventory"><div className="heading"><div><p className="eyebrow">{shop?.name ?? 'Shared main storage'}</p><h1>Stock & transfers</h1><p>Receive deliveries, move stock, and confirm what arrived.</p></div></div>
    <p className="notice">Online connection required. Quantities are recorded in base units. Transfers do not create sales or cash movements.</p>
    {error && <p role="alert" className="error-message">{error}</p>}{success && <p role="status" className="notice">{success}</p>}
    {pending && <div className="panel" role="status"><strong>{pending.label}</strong><p>{busy ? 'Recording stock…' : 'The result has not been confirmed. Retry this same request before starting another movement.'}</p><button className="primary-button" disabled={busy} onClick={() => void send(pending)}>Retry pending request</button></div>}
    <div className="stock-toolbar"><label>Stock location<select value={locationId} disabled={busy || !!pending} onChange={e => { setLocationId(e.target.value); setForm(null); setError(''); setSuccess(''); }}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><button className="text-button" disabled={busy} onClick={() => setRefresh(n => n + 1)}>Refresh stock</button></div>
    {options && location && <><button className="primary-button" disabled={busy || !!pending} onClick={() => setForm('receive')}>Receive supplier delivery</button>
      {form === 'receive' && <DeliveryForm key={locationId} options={options} locationId={locationId} disabled={busy || !!pending} submit={submit} close={() => setForm(null)} />}
      {form && form !== 'receive' && <StockActions key={`${locationId}:${form.batch_id}:${form.version}`} stock={form} location={location} options={options} disabled={busy || !!pending} submit={submit} close={() => setForm(null)} />}
    </>}
    {!data ? <p role="status">{locationId ? 'Loading stock…' : 'Choose an accessible stock location.'}</p> : <>
      <h2>At {location?.name}</h2><p>Availability in Drug prices is a separate catalogue setting. Expired batches cannot be dispatched.</p>
      <div className="stock-cards">{data.stocks.length === 0 && <p>No stock has been received at this location.</p>}{data.stocks.map(stock => <article className="panel" key={stock.batch_id}><h3>{stock.name} · {stock.strength}</h3><p>{stock.dosage_form} · Batch {stock.batch_number}</p><p>Expiry {stock.expiry} {stock.expiry <= new Date().toISOString().slice(0, 10) && <strong className="error-message">Expired — hold for review</strong>}</p><strong>{stock.quantity} {stock.base_unit}(s)</strong><p>{stock.quantity - stock.reserved} unreserved · {stock.reserved} reserved</p><button className="text-button" disabled={busy || !!pending} onClick={() => setForm(stock)}>Transfer or count</button></article>)}</div>
      <h2>Transfers</h2><p>Outstanding quantities remain in transit until received or explicitly resolved by an admin.</p>
      <div className="stock-cards">{!data.transfers.length && <p>No transfers recorded.</p>}{data.transfers.map(transfer => <TransferCard key={`${transfer.id}:${transfer.received}:${transfer.lost}:${refresh}`} transfer={transfer} destinationMain={options?.destinations.find(l => l.id === transfer.destination_id)?.kind === 'shared'} locationId={locationId} canAdjust={options?.canAdjust ?? false} disabled={busy || !!pending} submit={submit} />)}</div>
      <h2>Supplier receipts</h2><div className="stock-cards">{[...new Set(data.ledger.flatMap(line => line.document_id ? [line.document_id] : []))].map(id => <SupplierReceipt reference={data.ledger.find(line => line.document_id === id)?.reference ?? id} key={id + ':' + refresh} id={id} canApprove={options?.canAdjust ?? false} disabled={busy || !!pending} submit={submit} />)}</div><h2>Recent stock history</h2><p>Latest 100 entries at this location. Times shown in GMT.</p><div className="stock-cards">{data.ledger.map(line => <article className="panel" key={line.id}><strong>{line.kind} · {line.delta > 0 ? '+' : ''}{line.delta}</strong><p>{line.name} · Batch {line.batch_number}</p><p>{line.reason}</p>{line.supplier && <p>{line.supplier} · Ref {line.reference}<br />Supplier quantity: {line.expected_quantity}; received: {line.received_quantity} base units.</p>}{line.kind === 'count' && <p>Expected {line.details.before}; counted {line.details.counted}; variance {line.details.variance}.</p>}{line.kind === 'receive' && line.details.discrepancy > 0 && <p className="error-message">{line.details.discrepancy} still unaccounted for at this receipt.</p>}<ReceiptApproval line={line} canApprove={options?.canAdjust ?? false} disabled={busy || !!pending} submit={submit} /><small>{line.actor_name} · {dateTime(line.created_at)} GMT</small></article>)}</div>
    </>}
  </section>;
}

function Fields({ disabled, children }: { disabled: boolean; children: ReactNode }) { return <fieldset disabled={disabled}>{children}</fieldset>; }
function Reason() { return <label>Reason / delivery notes<textarea name="reason" required minLength={3} maxLength={300} /></label>; }
function ReceiptApproval({ line, canApprove, disabled, submit }: { line: Ledger; canApprove: boolean; disabled: boolean; submit: Submit }) {
  if (!line.receipt_id || line.document_id) return null;
  if (line.approved_at) return <p>Reviewed and approved by {line.approved_by_name} · {dateTime(line.approved_at)} GMT</p>;
  return <><p>Awaiting admin review. Received stock is already included above.</p>{canApprove && <form className="stock-form" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void submit(`/inventory/receipts/${line.receipt_id}/approve`, { reason: value(form, 'reason') }, 'Delivery approval');
  }}><Fields disabled={disabled}><label>Approval notes<textarea name="reason" minLength={3} maxLength={300} required /></label><button className="text-button">Approve delivery record</button></Fields></form>}</>;
}
function StockActions({ stock, location, options, disabled, submit, close }: { stock: Stock; location: Location; options: Options; disabled: boolean; submit: Submit; close: () => void }) {
  const [mode, setMode] = useState('transfer');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await submit(mode === 'transfer' ? '/inventory/transfers' : '/inventory/counts', mode === 'transfer' ? { sourceId: location.id, destinationId: value(data, 'destination'), batchId: stock.batch_id, quantity: number(data, 'quantity'), reason: value(data, 'reason') } : { locationId: location.id, batchId: stock.batch_id, forceDuplicate: data.get('forceDuplicate') === 'on', counted: number(data, 'quantity'), expectedVersion: stock.version, reason: value(data, 'reason') }, mode === 'transfer' ? 'Dispatch' : 'Count adjustment');
  }
  return <form className="panel stock-form" onSubmit={save}><h2>{stock.name} · {stock.strength}</h2><p>Batch {stock.batch_number} · {stock.expiry}<br /><strong>From {location.name}</strong></p><Fields disabled={disabled}><label>Action<select value={mode} onChange={e => setMode(e.target.value)}><option value="transfer">Dispatch a transfer</option>{options.canAdjust && <option value="count">Post a physical count</option>}</select></label>{mode === 'transfer' ? <label>Destination<select name="destination" required><option value="">Choose destination</option>{options.destinations.filter(l => l.id !== location.id).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label> : <p>Expected stock: {stock.quantity}. The difference will be recorded as an adjustment, with your name and reason.</p>}<label>{mode === 'transfer' ? 'Dispatch quantity' : 'Physically counted quantity'} ({stock.base_unit})<input name="quantity" key={mode} type="number" inputMode="numeric" min={mode === 'transfer' ? 1 : 0} max={mode === 'transfer' ? stock.quantity - stock.reserved : 100000000} step={1} required /></label><Reason />{mode === 'count' && location.kind === 'shared' && <label className="duplicate-confirm"><input type="checkbox" name="forceDuplicate" />Allow duplicate in main storerooms</label>}<button className="primary-button">{mode === 'transfer' ? 'Dispatch stock' : 'Record count'}</button><button type="button" className="text-button" onClick={close}>Cancel</button></Fields></form>;
}
function TransferCard({ transfer: t, destinationMain, locationId, canAdjust, disabled, submit }: { transfer: Movement; destinationMain: boolean; locationId: string; canAdjust: boolean; disabled: boolean; submit: Submit }) {
  const [mode, setMode] = useState('receive');
  const [events, setEvents] = useState<Ledger[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  async function history() {
    setHistoryError('');
    try { setEvents((await api<{ events: Ledger[] }>(`/inventory/transfers/${t.id}/history`)).events); }
    catch (error) { setHistoryError(messageOf(error)); }
  }
  const remaining = t.quantity - t.received - t.lost;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await submit(`/inventory/transfers/${t.id}/${mode}`, { forceDuplicate: data.get('forceDuplicate') === 'on', quantity: number(data, 'quantity'), expectedRemaining: remaining, reason: value(data, 'reason') }, mode === 'receive' ? 'Transfer receipt' : 'Transit loss');
  }
  return <article className="panel"><h3>{t.name} · {t.strength}</h3><p>Batch {t.batch_number} · Expiry {t.expiry}</p><p><strong>{t.source_name}</strong><br />→ {t.destination_name}</p><p>Dispatched {t.quantity} · Received {t.received} · Loss {t.lost}<br /><strong>{remaining ? `${remaining} ${t.base_unit}(s) in transit` : 'Transfer closed'}</strong></p><p>{t.reason}</p><small>{t.dispatched_by_name} · {dateTime(t.dispatched_at)} GMT</small><div><button type="button" className="text-button" onClick={() => events ? setEvents(null) : void history()}>{events ? 'Hide transfer history' : 'View transfer history'}</button></div>{historyError && <p role="alert">{historyError}</p>}{events && <ol>{events.map((event, index) => <li key={index}><strong>{event.kind} · {event.delta}</strong><p>{event.reason}</p><small>{event.actor_name} · {dateTime(event.created_at)} GMT</small>{event.details.discrepancy > 0 && <p>{event.details.discrepancy} outstanding at this receipt.</p>}</li>)}</ol>}{remaining > 0 && t.destination_id === locationId && <form className="stock-form" onSubmit={save}><Fields disabled={disabled}>{canAdjust && <label>Receipt action<select value={mode} onChange={e => setMode(e.target.value)}><option value="receive">Confirm actual receipt</option><option value="loss">Resolve missing stock as loss</option></select></label>}<label>{mode === 'receive' ? 'Actually received now' : 'Confirmed lost quantity'} ({t.base_unit})<input name="quantity" type="number" inputMode="numeric" min={mode === 'receive' ? 0 : 1} max={remaining} step={1} required /></label><p>{mode === 'receive' ? 'Enter only what you counted. Any difference stays in transit for review.' : 'This permanently records a stock loss. Explain the investigation and outcome.'}</p><Reason />{mode === 'receive' && destinationMain && <label className="duplicate-confirm"><input type="checkbox" name="forceDuplicate" />Allow duplicate in main storerooms</label>}<button className="primary-button">{mode === 'receive' ? 'Confirm receipt' : 'Record transit loss'}</button></Fields></form>}</article>;
}
