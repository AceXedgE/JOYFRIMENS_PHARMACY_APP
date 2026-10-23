import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, messageOf, type Session, type Shop } from './api';
import { ProductForm } from './ProductForm';
import { money, parseMoney, type CatalogueResult, type CatalogueUnit, type Product } from './catalogue-model';
import './catalogue.css';

function Highlight({ value, query }: { value: string; query: string }) {
  const tokens = query.trim().split(/\s+/).filter(Boolean).slice(0, 12).sort((a, b) => b.length - a.length);
  if (!tokens.length) return <>{value}</>;
  const regex = new RegExp(`(${tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return <>{value.split(regex).map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : part)}</>;
}
type Selection = { product: Product; unit: CatalogueUnit; mode: 'price' | 'availability' };

function EditUnit({ selection, session, shop, onSaved, onClose, onReload, onExpired }: { selection: Selection; session: Session; shop: Shop; onSaved: () => void; onClose: () => void; onReload: () => void; onExpired: () => void }) {
  const { product, unit, mode } = selection;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const body = mode === 'price' ? { priceMinor: parseMoney(String(data.get('price'))), expectedVersion: unit.priceVersion }
        : { available: unit.available !== true, expectedVersion: unit.listingVersion, reason: 'Update shelf availability' };
      await api(`/shops/${shop.id}/catalogue/units/${unit.id}/${mode}`, { method: 'PUT', body, csrf: session.csrfToken });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else { setError(messageOf(error)); if (error instanceof ApiError && error.status === 409) setConflict(true); }
    } finally { setBusy(false); }
  }
  return <form className="unit-editor" onSubmit={save} aria-label={`${mode === 'price' ? 'Edit shared price' : 'Change availability'} for ${unit.label}`}>
    <h3>{mode === 'price' ? 'Edit shared price' : 'Change shop availability'}</h3>
    <p>{product.name} · {product.strength} · {unit.label}</p>
    {mode === 'price' ? <><p className="scope-notice">This changes the {unit.label} price at <strong>both Tomjoy and Joyfrimens</strong>.</p><label>New price (GHS)<input name="price" inputMode="decimal" defaultValue={(unit.priceMinor / 100).toFixed(2)} required disabled={busy || conflict} /></label></>
      : <p>Set to <strong>{unit.available === true ? 'unavailable' : 'available'}</strong> at {shop.name} only.</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="catalogue-actions"><button className="primary-button" disabled={busy || conflict}>{busy ? 'Saving…' : mode === 'price' ? 'Save shared price' : 'Save availability'}</button>
      {conflict && <button type="button" className="secondary-button" onClick={onReload}>Reload latest values</button>}
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button></div>
  </form>;
}

export function Catalogue({ session, shop, onExpired }: { session: Session; shop: Shop; onExpired: () => void }) {
  const [query, setQuery] = useState('');
  const [includeUnlisted, setIncludeUnlisted] = useState(false);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<CatalogueResult | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Selection | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setResult(null); setError(''); setEditing(null);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim(), page: String(page), includeUnlisted: String(includeUnlisted) });
      api<CatalogueResult>(`/shops/${shop.id}/catalogue?${params}`, { signal: controller.signal }).then(setResult).catch(error => {
        if (!controller.signal.aborted) { if (error instanceof ApiError && error.status === 401) onExpired(); else setError(messageOf(error)); }
      });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [shop.id, query, page, includeUnlisted, reload]);
  const refresh = () => { setEditing(null); setReload(value => value + 1); };
  return <section className="catalogue" aria-label="Drug catalogue">
    <div className="catalogue-heading"><div><p className="eyebrow">{shop.name}</p><h1>Manage medicines</h1><p>One approved price for both pharmacies. Find the exact drug and selling unit.</p></div>{session.user.role === 'admin' && !creating && <button className="primary-button" onClick={() => { setCreating(true); setEditing(null); }}>Add drug</button>}</div>
    {creating ? <ProductForm session={session} shop={shop} onExpired={onExpired} onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); setQuery(''); setPage(1); setSuccess('Drug saved with shared prices and listed at this shop.'); refresh(); }} /> : <>
      <div className="catalogue-search"><label htmlFor="drug-search">Search drugs<input id="drug-search" type="search" maxLength={120} value={query} onChange={event => { setQuery(event.target.value); setPage(1); setSuccess(''); }} placeholder="Name, other names, or barcode" autoComplete="off" /></label>
        <div className="search-options">{session.user.role === 'admin' && <label className="check-label"><input type="checkbox" checked={includeUnlisted} onChange={event => { setIncludeUnlisted(event.target.checked); setPage(1); }} />Include drugs not listed here</label>}<button className="secondary-button" onClick={refresh}>Refresh prices</button></div>
      </div>
      {success && <p role="status" className="success-message">{success}</p>}
      {error ? <p role="alert" className="error-message">{error} <button className="text-button" onClick={refresh}>Retry</button></p> : !result ? <p role="status">Finding drug prices…</p> : <>
        <div className="catalogue-meta"><span>{result.total} matching {result.total === 1 ? 'drug' : 'drugs'}</span><span>GHS · Shared prices · Shop-specific availability</span></div>
        {!result.total && <div className="panel empty-catalogue"><h2>{query ? 'No matching drugs' : 'No drugs listed yet'}</h2><p>{query ? 'Check the spelling or search by generic name. No drug is selected automatically.' : session.user.role === 'admin' ? 'Add a drug, or include unlisted drugs to make an existing catalogue item available here.' : 'An administrator needs to add drugs to this shop.'}</p></div>}
        <div className="drug-list">{result.products.map(product => <article className="drug-card" key={product.id}>
          {product.match === 'suggestion' && <p className="suggestion-label">Spelling suggestion — check the drug details</p>}
          <div className="drug-title"><h2><Highlight value={product.name} query={query} /></h2><span>{product.strength}</span></div>
          <p className="drug-generic"><Highlight value={product.genericName} query={query} /> · {product.dosageForm}</p>
          {product.units.map(unit => <div className="selling-unit" key={unit.id}>
            <div className="unit-summary"><div><strong>{unit.label}</strong><p>1 {unit.label} = {unit.baseQuantity} {product.baseUnit}{unit.baseQuantity !== 1 ? '(s)' : ''}</p>{unit.barcode && <small>Barcode: {unit.barcode}</small>}</div><div className="unit-price"><strong>{money(unit.priceMinor)}</strong><span className={unit.available === true ? 'available' : 'unavailable'}>{unit.available === null ? 'Not listed here' : unit.available ? 'Available here' : 'Unavailable here'}</span></div></div>
            <div className="unit-actions">{result.canChangePrices && unit.available !== null && <button className="secondary-button" onClick={() => { setEditing({ product, unit, mode: 'price' }); setSuccess(''); }}>Edit {unit.label} price</button>}
              {result.canManageCatalogue && <button className="secondary-button" onClick={() => { setEditing({ product, unit, mode: 'availability' }); setSuccess(''); }}>{unit.available === null ? `List ${unit.label} here` : unit.available ? `Mark ${unit.label} unavailable` : `Make ${unit.label} available`}</button>}

            </div>
            {editing?.unit.id === unit.id && <EditUnit key={`${unit.id}-${editing.mode}`} selection={editing} session={session} shop={shop} onExpired={onExpired} onClose={() => setEditing(null)} onReload={refresh} onSaved={() => { setSuccess(editing.mode === 'price' ? 'Shared price updated for both pharmacies.' : 'Availability updated for this shop only.'); refresh(); }} />}

          </div>)}
        </article>)}</div>
        {result.total > result.pageSize && <nav className="catalogue-pagination" aria-label="Catalogue pages"><button className="secondary-button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.ceil(result.total / result.pageSize)}</span><button className="secondary-button" disabled={page * result.pageSize >= result.total} onClick={() => setPage(value => value + 1)}>Next</button></nav>}
        <p className="form-hint">Availability is an admin setting, not a physical stock count. Check physical quantities under Stock & transfers.</p>
      </>}
    </>}
  </section>;
}
