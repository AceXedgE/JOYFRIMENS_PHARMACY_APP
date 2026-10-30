import { useState, type FormEvent } from 'react';
import { api, ApiError, messageOf, type Session, type Shop } from './api';
import { parseMoney, type Product } from './catalogue-model';
import { Sheet } from './Sheet';

export function MedicineEditor({ product, mode, session, shop, onClose, onSaved, onExpired }: { product: Product; mode: 'edit' | 'removal'; session: Session; shop: Shop; onClose: () => void; onSaved: () => void; onExpired: () => void }) {
  const [name, setName] = useState(product.name), [other, setOther] = useState(product.genericName), [base, setBase] = useState(product.baseUnit);
  const [units, setUnits] = useState(product.units.map(u => ({ id: u.id, label: u.label, baseQuantity: u.baseQuantity, barcode: u.barcode ?? '', variation:u.variation??false,isNew: false, price: (u.priceMinor/100).toFixed(2),priceVersion:u.priceVersion })));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const title = mode === 'edit' ? 'Edit medicine' : product.archived ? 'Restore medicine' : 'Delete medicine';
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(`/shops/${shop.id}/catalogue/products/${product.id}${mode === 'removal' ? '/removal' : ''}`, { method: 'PUT', csrf: session.csrfToken, body: mode === 'removal' ? { expectedVersion: product.revision, removed: !product.archived } : { expectedVersion: product.revision, name, genericName: other, baseUnit: base, units: units.map(({id,label,baseQuantity,barcode,variation,isNew,price,priceVersion}) => ({priceMinor:parseMoney(price,true),...(isNew ? {} : {id,priceVersion}),label,baseQuantity:variation?1:baseQuantity,barcode,variation})) } });
      window.dispatchEvent(new Event('medicine-updates')); onSaved();
    } catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); else setError(messageOf(err)); }
    finally { setBusy(false); }
  }
  return <Sheet title={title} onClose={onClose} locked={busy}><form className="unit-editor" onSubmit={save}>
    <p className="scope-notice">Applies to both pharmacies.</p>
    {mode === 'edit' ? <>
      <label>Medicine name<input required maxLength={160} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Other names (optional)<input maxLength={160} value={other} onChange={e => setOther(e.target.value)} /></label>
      {units.some(u=>!u.variation&&u.baseQuantity>1) && <label>Stock unit for packs<input required maxLength={40} value={base} onChange={e => { const next = e.target.value; setBase(next); }} /></label>}
      {units.map((unit, index) => <fieldset key={unit.id}><legend>{index===0?'Main option (shown first)':`Option ${index+1}`}</legend>
        {index>0 && unit.baseQuantity===1 && <button type="button" className="text-button" disabled={busy} onClick={() => setUnits(values => [unit,...values.filter(u=>u.id!==unit.id)])}>Show first</button>}
        <label>Option name<input required maxLength={40} value={unit.label} onChange={e => setUnits(values => values.map(u => u.id === unit.id ? { ...u, label: e.target.value } : u))} /></label>
        {index > 0 && <label className="check-label"><input type="checkbox" checked={unit.variation} onChange={e => setUnits(values => values.map(u => u.id === unit.id ? {...u,variation:e.target.checked,baseQuantity:1} : u))} />Variation</label>}
        {unit.variation ? <p className="form-hint">Separate stock. No base-unit conversion.</p> : index>0 ? <label>Number of main stock units<input type="number" required min={1} max={100000} value={unit.baseQuantity} onChange={e => setUnits(values => values.map(u => u.id === unit.id ? { ...u, baseQuantity: Number(e.target.value) } : u))} /></label> : null}
        <label>Barcode (optional)<input maxLength={80} value={unit.barcode} onChange={e => setUnits(values => values.map(u => u.id === unit.id ? { ...u, barcode: e.target.value } : u))} /></label>
        <><label>Price (GHS)<input required inputMode="decimal" value={unit.price} onChange={e => setUnits(values => values.map(u => u.id === unit.id ? {...u,price:e.target.value} : u))} /></label><button type="button" className="text-button" onClick={() => { if(unit.isNew||window.confirm(`Delete ${unit.label}? It will be removed when you save. Past records will remain.`))setUnits(values => values.filter(u => u.id !== unit.id)); }} disabled={busy||units.length===1}>{unit.isNew?'Remove new option':'Delete option'}</button></>
      </fieldset>)}
      <button type="button" className="secondary-button" disabled={busy || units.length >= 10} onClick={() => setUnits(values => [...values,{id:crypto.randomUUID(),label:'',baseQuantity:1,barcode:'',isNew:true,variation:true,price:'',priceVersion:0}])}>Add option</button>
      <p className="form-hint">Each option has its own price, shared by both pharmacies.</p>
      <p className="form-hint">Unit names can be corrected. Variation settings and pack quantities cannot change after sales or stock records use them.</p>
    </> : <p>{product.archived ? 'Restore' : 'Delete'} <strong>{product.name}</strong>{product.archived ? ' to active use?' : ' from both pharmacies? It will disappear from active use. Past sales and stock records will remain.'}</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="catalogue-actions"><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : mode === 'edit' ? 'Save medicine' : title}</button><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button></div>
  </form></Sheet>;
}
