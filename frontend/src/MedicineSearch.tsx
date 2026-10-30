import {Sheet} from './Sheet';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, messageOf } from './api';
import { money, parseMoney, type CatalogueResult, type CatalogueUnit, type Product } from './catalogue-model';

function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 12);
  if (!words.length) return <>{text}</>;
  const pattern = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return <>{text.split(pattern).map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : part)}</>;
}

export function MedicineSearch({ shopId, shopName, ticketOpen, disabled, revision, availableUnits, onChoose, onExpired, csrf, onChanged }: {
  csrf: string; onChanged: () => void; shopId: string; shopName:string; ticketOpen: boolean; disabled: boolean; revision: number; availableUnits: Set<string>;
  onChoose: (product: Product, unit: CatalogueUnit) => boolean; onExpired: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [editingPrice,setEditingPrice]=useState<CatalogueUnit|null>(null),[priceInput,setPriceInput]=useState('');
  async function savePrice(){if(!editingPrice)return;setSaving(true);setError('');try{await api(`/shops/${shopId}/catalogue/units/${editingPrice.id}/price`,{method:'PUT',csrf,body:{priceMinor:parseMoney(priceInput,true),expectedVersion:editingPrice.priceVersion}});setEditingPrice(null);setRetry(n=>n+1);onChanged();}catch(e){setError(messageOf(e));}finally{setSaving(false);}}

  const [unavailable,setUnavailable]=useState(false),[exporting,setExporting]=useState(false);
  const [saving, setSaving] = useState(false);
  async function toggle(unit: CatalogueUnit) { setSaving(true); setError(''); try { await api(`/shops/${shopId}/catalogue/units/${unit.id}/availability`, { method: 'PUT', csrf, body: { available: !unit.available, expectedVersion: unit.listingVersion, reason: unit.available ? 'Shelf medicine marked unavailable by staff' : 'Shelf medicine replenished; remove unavailable mark' } }); setRetry(n => n + 1); onChanged(); } catch (e) { setError(messageOf(e)); } finally { setSaving(false); } }
  const [query, setQuery] = useState(''), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<CatalogueResult | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setResult(null); setError('');
    if (!query.trim()&&!unavailable) return () => controller.abort();
    const timer = window.setTimeout(() => {
      api<CatalogueResult>(`/shops/${shopId}/catalogue?${new URLSearchParams({ q: query.trim(), page: String(page),unavailable:String(unavailable) })}`, { signal: controller.signal })
        .then(setResult).catch(e => { if (!controller.signal.aborted) { if (e instanceof ApiError && e.status === 401) onExpired(); else setError('Prices could not be loaded. Check your connection and retry.'); } });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [shopId, query, page, retry, revision,unavailable]);
  async function downloadList(){setExporting(true);setError('');try{
    const products:Product[]=[];let page=1,data:CatalogueResult;
    do{data=await api<CatalogueResult>(`/shops/${shopId}/catalogue?unavailable=true&download=true&page=${page}`);products.push(...data.products);page++;}while(products.length<data.total&&data.products.length);
    const cell=(value:unknown)=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
    const rows=[['Shop','Medicine','Other names','Selling unit','Price (GHS)','Available in storerooms','List created (GMT)','Source'],...products.flatMap(p=>p.units.filter(u=>u.available===false).map(u=>[shopName,[p.name,p.strength,p.dosageForm].filter(Boolean).join(' '),p.genericName,u.label,(u.priceMinor/100).toFixed(2),u.storerooms?.join('; ')??'',new Date().toISOString(),data.offline?'Saved device catalogue':'Online catalogue']))];
    const blob=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='unavailable-medicines-'+shopName.replace(/[^a-z0-9]+/gi,'-')+'-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){if(e instanceof ApiError&&e.status===401)onExpired();else setError(messageOf(e));}finally{setExporting(false);}}
  return <section className="medicine-search" aria-label="Medicine prices">
    {!ticketOpen&&<div className="medicine-filter"><button className="secondary-button" aria-pressed={unavailable} onClick={()=>{setUnavailable(v=>!v);setPage(1);setQuery('');}}>Unavailable medicines</button>{unavailable&&<button className="text-button" disabled={exporting} onClick={()=>void downloadList()}>{exporting?'Creating file...':'Download list'}</button>}</div>}
    <label className="counter-search">Search medicines<input ref={input} type="search" value={query} maxLength={120} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Name, strength or barcode" autoComplete="off" /></label>
    <p className="search-hint">{ticketOpen ? 'Choose the medicine and pack to add to your ticket.' : 'Check a price here. Open a ticket when someone is buying.'}</p>
    {!query.trim()&&!unavailable ? null : error ? <p className="error-message" role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>Retry</button></p> : !result ? <p role="status">Finding medicines…</p> : <>
      {result.offline&&<p className="notice">Saved device list. Reconnect to check the latest availability.</p>}<div className="result-meta"><span>{result.total} {result.total === 1 ? 'medicine' : 'medicines'}</span><span>Prices in GHS</span></div>
      {!result.total && <div className="counter-empty"><h2>No medicines found</h2><p>{query ? 'Try another spelling or the generic name.' : 'Ask your administrator to add medicines for this shop.'}</p></div>}
      <div className="medicine-results">{result.products.map(product => <article className="medicine-card" key={product.id}>
        {product.match === 'suggestion' && <p className="spelling-note">Spelling suggestion · check the medicine</p>}
        <header><h2><Highlight text={product.name} query={query} /></h2>{[product.strength,product.dosageForm,product.genericName.toLowerCase() !== product.name.toLowerCase() ? product.genericName : ''].filter(Boolean).length > 0 && <p><Highlight text={[product.strength,product.dosageForm,product.genericName.toLowerCase() !== product.name.toLowerCase() ? product.genericName : ''].filter(Boolean).join(' ? ')} query={query} /></p>}</header>
        <div className="medicine-units">{product.units.map(unit => <div key={unit.id}><div className="medicine-price">
          <div><span className="pack-name">{unit.label}</span>{!unit.variation && unit.baseQuantity > 1 && <small>{unit.baseQuantity} {product.baseUnit}(s)</small>}{!unit.available && <small>Unavailable on shelf</small>}</div>
          <strong className="price-number">{money(unit.priceMinor)}{unit.priceMinor===0&&<small>Price needed</small>}</strong>
          {ticketOpen && <button className="add-medicine" disabled={disabled || saving || unit.priceMinor===0 || !availableUnits.has(unit.id)} onClick={() => { if (onChoose(product, unit)) { setQuery(''); setPage(1); setResult(null); input.current?.focus(); } }} aria-label={`Add ${product.name} ${unit.label} to ticket`}>{unit.priceMinor===0?'Price needed':!availableUnits.has(unit.id) ? 'Unavailable' : '+ Add'}</button>}
        </div><div className="shelf-availability">{!ticketOpen&&result.canChangePrices&&<button className="text-button" disabled={saving||!!result.offline} onClick={()=>{setEditingPrice(unit);setPriceInput((unit.priceMinor/100).toFixed(2));setError('');}}>Edit price</button>}{!unit.available && <p>{unit.storerooms?.length ? 'In storeroom: '+unit.storerooms.join(', ')+'. Shelf remains marked unavailable.' : 'No available stock recorded in the pharmacy storeroom or the main storerooms.'}</p>}{!ticketOpen && <button className="text-button" disabled={disabled || saving} onClick={() => void toggle(unit)}>{unit.available ? 'Mark '+unit.label+' unavailable' : 'Remove '+unit.label+' unavailable mark'}</button>}</div></div>)}</div>
      </article>)}</div>
      {result.total > result.pageSize && <nav className="counter-pagination" aria-label="Medicine pages"><button disabled={page === 1} onClick={() => setPage(n => n - 1)}>Previous</button><span>{page} / {Math.ceil(result.total / result.pageSize)}</span><button disabled={page * result.pageSize >= result.total} onClick={() => setPage(n => n + 1)}>Next</button></nav>}
    </>}
    {editingPrice&&<Sheet title="Edit price" onClose={()=>{if(!saving)setEditingPrice(null);}}><form onSubmit={e=>{e.preventDefault();void savePrice();}}><p>Shared price for {editingPrice.label} at both shops.</p>{error&&<p className="error-message" role="alert">{error}</p>}<label>Price (GHS)<input autoFocus inputMode="decimal" required value={priceInput} onChange={e=>setPriceInput(e.target.value)}/></label><button className="primary-button" disabled={saving}>Save price</button></form></Sheet>}
  </section>;
}
