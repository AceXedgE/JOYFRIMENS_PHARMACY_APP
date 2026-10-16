import { useState, type FormEvent } from 'react';
import { api, ApiError, messageOf, type Session, type Shop } from './api';
import { parseMoney } from './catalogue-model';

export function ProductForm({ session, shop, onSaved, onCancel, onExpired }: { session: Session; shop: Shop; onSaved: () => void; onCancel: () => void; onExpired: () => void }) {
  const [base, setBase] = useState('tablet');
  const [units, setUnits] = useState([{ label: '', quantity: '1', price: '', barcode: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (index: number, field: keyof typeof units[number], value: string) => setUnits(current => current.map((unit, i) => i === index ? { ...unit, [field]: value } : unit));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const normalizedUnits = units.map((unit, index) => {
        if (!/^\d+$/.test(unit.quantity)) throw new Error('Pack quantities must be positive whole numbers.');
        return { label: index === 0 ? base.trim() : unit.label.trim(), baseQuantity: Number(unit.quantity), priceMinor: parseMoney(unit.price), barcode: unit.barcode.trim() };
      });
      await api(`/shops/${shop.id}/catalogue`, { method: 'POST', csrf: session.csrfToken, body: {
        name: String(data.get('name')).trim(), genericName: String(data.get('genericName')).trim(), strength: String(data.get('strength')).trim(),
        dosageForm: String(data.get('dosageForm')).trim(), baseUnit: base.trim(), units: normalizedUnits, reason: String(data.get('reason')).trim(),
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
    <p className="form-hint">Check the strength, form, and pack conversions carefully. These details stay fixed to protect future stock and receipt records.</p>
    {error && <p role="alert" className="error-message">{error}</p>}
    <fieldset disabled={busy} className="product-fields"><legend>Drug identity</legend>
      <label>Drug / brand name<input name="name" required maxLength={160} autoComplete="off" /></label>
      <label>Generic name<input name="genericName" required maxLength={160} autoComplete="off" /></label>
      <label>Strength<input name="strength" required maxLength={80} placeholder="e.g. 500 mg" /></label>
      <label>Dosage form<input name="dosageForm" required maxLength={80} placeholder="e.g. tablet, oral suspension" /></label>
      <label>Base stock unit<input value={base} onChange={event => setBase(event.target.value)} required maxLength={40} placeholder="e.g. tablet or bottle" /></label>
    </fieldset>
    <div className="section-heading"><h3>Selling units & shared prices</h3></div>
    {units.map((unit, index) => <fieldset disabled={busy} key={index} className="unit-fields"><legend>{index === 0 ? 'Base unit' : `Pack ${index}`}</legend>
      <label>Selling unit<input value={index === 0 ? base : unit.label} readOnly={index === 0} onChange={event => update(index, 'label', event.target.value)} required maxLength={40} placeholder="e.g. box" /></label>
      <label>Number of {base || 'base units'} per unit<input type="number" inputMode="numeric" min={1} max={100000} step={1} value={unit.quantity} readOnly={index === 0} onChange={event => update(index, 'quantity', event.target.value)} required /></label>
      <label>Price (GHS)<input inputMode="decimal" value={unit.price} onChange={event => update(index, 'price', event.target.value)} required placeholder="0.00" /></label>
      <label>Barcode (optional)<input value={unit.barcode} onChange={event => update(index, 'barcode', event.target.value)} maxLength={80} /></label>
      {index > 0 && <button type="button" className="text-button" onClick={() => setUnits(current => current.filter((_, i) => i !== index))}>Remove pack</button>}
    </fieldset>)}
    <button type="button" className="secondary-button" disabled={busy || units.length >= 10} onClick={() => setUnits(current => [...current, { label: '', quantity: '', price: '', barcode: '' }])}>Add box, strip, or another pack</button>
    <p className="form-hint">Enter each selling-unit price explicitly. A box can cost less than its individual units bought separately. These are approved prices, not stock counts.</p>
    <label>Reason for entry<input name="reason" required minLength={3} maxLength={300} defaultValue="Initial approved catalogue entry" disabled={busy} /></label>
    <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save drug and prices'}</button>
  </form>;
}
