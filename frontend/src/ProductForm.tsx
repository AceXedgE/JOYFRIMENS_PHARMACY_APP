import { useState, type FormEvent } from 'react';
import { api, ApiError, messageOf, type Session, type Shop } from './api';
import { parseMoney } from './catalogue-model';

export function ProductForm({ session, shop, onSaved, onCancel, onExpired }: { session: Session; shop: Shop; onSaved: () => void; onCancel: () => void; onExpired: () => void }) {
  const [base, setBase] = useState('unit');
  const [units, setUnits] = useState([{ label: 'Default', quantity: '1', price: '', barcode: '', variation: false }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (index: number, field: keyof typeof units[number], value: string | boolean) => setUnits(current => current.map((unit, i) => i === index ? { ...unit, [field]: value } : unit));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const normalizedUnits = units.map(unit => {
        if (!unit.variation && !/^\d+$/.test(unit.quantity)) throw new Error('Pack quantities must be positive whole numbers.');
        return { label: unit.label.trim(), variation:unit.variation,baseQuantity: unit.variation?1:Number(unit.quantity), priceMinor: parseMoney(unit.price, true), barcode: unit.barcode.trim() };
      });
      await api(`/shops/${shop.id}/catalogue`, { method: 'POST', csrf: session.csrfToken, body: {
        name: String(data.get('name')).trim(), genericName: String(data.get('genericName') ?? '').trim(),
        baseUnit: base.trim(), units: normalizedUnits,
      } });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setError(error instanceof ApiError && error.status === 409 ? 'This drug or barcode already exists. Cancel and check “Include drugs not listed here” before adding it again.' : messageOf(error));
    } finally { setBusy(false); }
  }
  return <form className="panel catalogue-form" onSubmit={save} aria-label="Add drug">
    <div className="section-heading"><h2>Add a drug</h2><button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button></div>
    <p>List this drug at <strong>{shop.name}</strong>. Its approved unit prices are shared by both pharmacies.</p>
    <p className="form-hint">Include dosage or form in the name when needed, e.g. Amoxicillin 500mg or Amoksiklav suspension. A brand can go in brackets.</p>
    {error && <p role="alert" className="error-message">{error}</p>}
    <fieldset disabled={busy} className="product-fields"><legend>Drug identity</legend>
      <label>Name<input name="name" required maxLength={160} autoComplete="off" /></label>
      <label>Other names (optional)<input name="genericName" maxLength={160} autoComplete="off" /></label>
      {units.some(u=>!u.variation && Number(u.quantity)>1) && <label>Stock unit for packs<input value={base} onChange={event => setBase(event.target.value)} required maxLength={40} placeholder="e.g. tablet, bottle, tube or box" /></label>}
    </fieldset>
    <div className="section-heading"><h3>Selling units & shared prices</h3></div>
    {units.map((unit, index) => <fieldset disabled={busy} key={index} className="unit-fields"><legend>{index === 0 ? 'Main option (shown first)' : `Option ${index + 1}`}</legend>
      <label>Option name<input value={unit.label} onChange={event => update(index, 'label', event.target.value)} required maxLength={40} placeholder="e.g.syrup or box" /></label>
      {index > 0 && <>
      <label className="check-label"><input type="checkbox" checked={unit.variation} onChange={e => update(index,'variation',e.target.checked)} />Variation</label>
      {unit.variation ? <p className="form-hint">Separate stock. No base-unit conversion.</p> : <label>Number of {base || 'base units'} per unit<input type="number" inputMode="numeric" min={1} max={100000} step={1} value={unit.quantity} onChange={event => update(index, 'quantity', event.target.value)} required /></label>}</>}
      <label>{'Price (GHS)'}<input inputMode="decimal" value={unit.price} onChange={event => update(index, 'price', event.target.value)} required placeholder="0.00" /></label>
      <label>Barcode (optional)<input value={unit.barcode} onChange={event => update(index, 'barcode', event.target.value)} maxLength={80} /></label>
      {index > 0 && <button type="button" className="text-button" onClick={() => setUnits(current => current.filter((_, i) => i !== index))}>Remove option</button>}
    </fieldset>)}
    <button type="button" className="secondary-button" disabled={busy || units.length >= 10} onClick={() => setUnits(current => [...current, { label: '', quantity: '1', price: '', barcode: '', variation:true }])}>Add pack or variation</button>
    <p className="form-hint">The main option is shown first. Variations have separate stock and prices. Untick Variation only for a pack of the main option.</p>
    <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save drug and prices'}</button>
  </form>;
}
