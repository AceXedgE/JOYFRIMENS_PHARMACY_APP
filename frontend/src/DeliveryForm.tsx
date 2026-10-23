import { AdminActions, ActionReason } from './ActionReason';
import { useState, useContext, type FormEvent } from 'react';
import type { Location } from './api';

export interface DeliveryUnit { id: string; product_id: string; label: string; base_quantity: number; name: string; strength: string; dosage_form: string; base_unit: string }
export type StockSubmit = (path: string, body: Record<string, unknown>, label: string) => Promise<void>;
export interface Line { forceDuplicate?: boolean; unitId: string; batchNumber: string; expiry: string; expectedPacks: number; receivedPacks: number; reason: string; allocations: { locationId: string; quantity: number }[] }
export function DeliveryForm({ options, locationId, disabled, submit, close, initial }: { initial?: {supplier:string;reference:string;submissionId:string;lines:Line[]}; options: { units: DeliveryUnit[]; locations: Location[] }; locationId: string; disabled: boolean; submit: StockSubmit; close: () => void }) {
  const admin=useContext(AdminActions);
  const [supplier, setSupplier] = useState(initial?.supplier??'');
  const [reference, setReference] = useState(initial?.reference??'');
  const [reason, setReason] = useState(admin?'Supplier delivery recorded':'');
  const [lines, setLines] = useState<Line[]>(initial?.lines??[]);
  const [editing, setEditing] = useState<number | null>(initial?null:0);
  const [review, setReview] = useState(false);
  const [allocationMode,setAllocationMode]=useState('custom');
  const [error, setError] = useState('');
  function saveLine(line: Line) {
    const unit = options.units.find(u => u.id === line.unitId)!;
    if (lines.some((l, i) => i !== editing && options.units.find(u => u.id === l.unitId)?.product_id === unit.product_id && l.batchNumber === line.batchNumber && l.expiry === line.expiry)) {
      setError('That drug, batch and expiry are already on this receipt. Edit the existing line.'); return;
    }
    if(allocationMode!=='custom')line={...line,allocations:[{locationId:allocationMode,quantity:line.receivedPacks*unit.base_quantity}]};
    setLines(current => editing === current.length ? [...current, line] : current.map((item, i) => i === editing ? line : item));
    setEditing(null); setError('');
  }
  return <section className="panel stock-form" aria-label="Supplier receipt editor"><h2>Receive supplier delivery</h2><p>One receipt, up to 100 drug or batch lines. Stock is added only after you review and confirm the whole receipt.</p>
    {error && <p role="alert" className="error-message">{error}</p>}
    <fieldset disabled={disabled || review}><label>Supplier<input readOnly={!!initial} value={supplier} onChange={e => setSupplier(e.target.value)} maxLength={150} required /></label><label>Delivery reference<input readOnly={!!initial} value={reference} onChange={e => setReference(e.target.value)} maxLength={100} required /></label>{!admin&&<label>Receipt notes<textarea value={reason} onChange={e => setReason(e.target.value)} minLength={3} maxLength={300} required /></label>}</fieldset>
    {!review&&<label>Allocate delivery<select value={allocationMode} disabled={disabled} onChange={e=>{const id=e.target.value;setAllocationMode(id);if(id!=='custom')setLines(rows=>rows.map(line=>({...line,allocations:[{locationId:id,quantity:line.receivedPacks*(options.units.find(u=>u.id===line.unitId)?.base_quantity??1)}]})));}}><option value="custom">Custom - choose per medicine</option>{options.locations.map(l=><option key={l.id} value={l.id}>All to {l.name}</option>)}</select></label>}
    <h3>{review ? 'Review complete receipt' : 'Drug lines'} · {lines.length}</h3>
    {review && <p>Check every batch, pack conversion, actual quantity, discrepancy and destination below. Quantities from different drugs are not added together.</p>}
    <ol className="receipt-lines">{lines.map((line, index) => {
      const unit = options.units.find(u => u.id === line.unitId)!;
      const expected = line.expectedPacks * unit.base_quantity, received = line.receivedPacks * unit.base_quantity;
      return <li key={index}><strong>{unit.name} · {unit.strength} · {unit.dosage_form}</strong><p>Batch {line.batchNumber} · Expiry {line.expiry}</p><p>{unit.label}: {unit.base_quantity} {unit.base_unit}(s) per pack<br />Supplier: {line.expectedPacks} packs ({expected} {unit.base_unit})<br />Received: {line.receivedPacks} packs ({received} {unit.base_unit})</p>{received !== expected && <p className="error-message">{received < expected ? 'Short' : 'Extra'}: {Math.abs(received - expected)} {unit.base_unit}(s)</p>}<p>{line.reason}</p>{line.forceDuplicate && <p>Intentional duplication in main storerooms confirmed.</p>}{line.allocations.map(a => <p key={a.locationId}>{options.locations.find(l => l.id === a.locationId)?.name}: {a.quantity} {unit.base_unit}(s)</p>)}{!review && <div><button type="button" className="text-button" disabled={disabled || editing !== null} onClick={() => setEditing(index)}>Edit line {index + 1}</button><button type="button" className="text-button" disabled={disabled || !!initial || editing !== null} onClick={() => setLines(current => current.filter((_, i) => i !== index))}>Remove line {index + 1}</button></div>}</li>;
    })}</ol>
    {editing !== null && !review && <LineEditor key={editing} initial={lines[editing]} lineNumber={editing + 1} units={options.units} locations={options.locations} locationId={locationId} disabled={disabled} save={saveLine} cancel={() => setEditing(null)} />}
    {!review && editing === null && <><button type="button" className="text-button" disabled={disabled || !!initial || lines.length >= 100} onClick={() => setEditing(lines.length)}>Add another drug</button><button type="button" className="primary-button" disabled={disabled || !lines.length} onClick={() => {
      if (!supplier.trim() || !reference.trim() || reason.trim().length < 3) { setError('Enter the supplier, delivery reference and receipt notes before reviewing.'); return; }
      setError(''); setReview(true);
    }}>Review receipt</button></>}
    {review && <><button type="button" className="primary-button" disabled={disabled} onClick={() => void submit('/inventory/deliveries', { supplier, reference, reason, lines, ...(initial?{submissionId:initial.submissionId}:{}) }, `Supplier receipt ${reference} (${lines.length} lines)`)}>Confirm entire receipt</button><button type="button" className="text-button" disabled={disabled} onClick={() => setReview(false)}>Back to editing</button></>}
    <button type="button" className="text-button" disabled={disabled} onClick={close}>Cancel receipt</button>
  </section>;
}
function LineEditor({ initial, lineNumber, units, locations, locationId, disabled, save, cancel }: { initial?: Line; lineNumber: number; units: DeliveryUnit[]; locations: Location[]; locationId: string; disabled: boolean; save: (line: Line) => void; cancel: () => void }) {
  const [unitId, setUnitId] = useState(initial?.unitId ?? '');
  const [packs, setPacks] = useState(initial ? String(initial.receivedPacks) : '');
  const [allocations, setAllocations] = useState(initial?.allocations.map(a => ({ ...a, quantity: String(a.quantity) })) ?? [{ locationId, quantity: '' }]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const unit = units.find(u => u.id === unitId);
  const total = Number(packs) * (unit?.base_quantity ?? 0);
  function saveLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (new Set(allocations.map(a => a.locationId)).size !== allocations.length) { setError('Choose each allocation location only once.'); return; }
    if (!Number.isSafeInteger(total) || total > 100000000 || !unit || total !== allocations.reduce((sum, a) => sum + Number(a.quantity), 0)) { setError('Allocate exactly the actual received quantity within the supported limit.'); return; }
    if (String(form.get('reason')).trim().length < 3) { setError('Add meaningful line notes, explaining any discrepancy.'); return; }
    save({ forceDuplicate: form.get('forceDuplicate') === 'on', unitId, batchNumber: String(form.get('batch')).trim().replace(/\s+/g, ' '), expiry: String(form.get('expiry')), expectedPacks: Number(form.get('expected')), receivedPacks: Number(packs), reason: String(form.get('reason')), allocations: allocations.map(a => ({ locationId: a.locationId, quantity: Number(a.quantity) })) });
  }
  return <form className="stock-form" aria-label={`Drug line ${lineNumber}`} onSubmit={saveLine}><h3>Drug line {lineNumber}</h3>{error && <p role="alert">{error}</p>}<fieldset disabled={disabled}>
    <label>Find a drug<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Drug name or strength" /></label>
    <label>Drug and pack<select value={unitId} onChange={e => setUnitId(e.target.value)} required><option value="" disabled>Choose a drug</option>{units.filter(u => u.id === unitId || `${u.name} ${u.strength} ${u.dosage_form}`.toLowerCase().includes(search.toLowerCase())).map(u => <option key={u.id} value={u.id}>{u.name} · {u.strength} · {u.dosage_form} · {u.label} ({u.base_quantity} {u.base_unit})</option>)}</select></label>
    {!units.length && <p>Add drugs and their pack conversions in Drug prices first.</p>}<label>Batch number<input name="batch" required maxLength={100} defaultValue={initial?.batchNumber} /></label><label>Expiry date<input name="expiry" type="date" required defaultValue={initial?.expiry} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} /></label><label>Supplier quantity (packs)<input name="expected" type="number" inputMode="numeric" min={1} max={unit ? Math.floor(100000000 / unit.base_quantity) : 100000000} step={1} required defaultValue={initial?.expectedPacks} /></label><label>Actually received (packs)<input value={packs} onChange={e => setPacks(e.target.value)} type="number" inputMode="numeric" min={0} max={unit ? Math.floor(100000000 / unit.base_quantity) : 100000000} step={1} required /></label><p><strong>{total} {unit?.base_unit ?? 'base unit'}(s)</strong> to allocate. One {unit?.label ?? 'pack'} = {unit?.base_quantity ?? '—'} base units.</p>
    {allocations.map((a, index) => <div className="allocation" key={index}><label>Allocation {index + 1} location<select value={a.locationId} onChange={e => setAllocations(rows => rows.map((r, i) => i === index ? { ...r, locationId: e.target.value } : r))}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Allocation {index + 1} base units<input type="number" inputMode="numeric" min={0} max={100000000} step={1} required value={a.quantity} onChange={e => setAllocations(rows => rows.map((r, i) => i === index ? { ...r, quantity: e.target.value } : r))} /></label>{index > 0 && <button type="button" className="text-button" onClick={() => setAllocations(rows => rows.filter((_, i) => i !== index))}>Remove allocation {index + 1}</button>}</div>)}
    <button type="button" className="text-button" disabled={allocations.length >= locations.length} onClick={() => setAllocations(rows => [...rows, { locationId: locations.find(l => !rows.some(a => a.locationId === l.id))?.id ?? '', quantity: '' }])}>Split across another location</button><p>Allocated: {allocations.reduce((sum, a) => sum + Number(a.quantity), 0)} / {total}</p><ActionReason label="Reason / delivery notes" action="Supplier line recorded"/><label className="duplicate-confirm"><input name="forceDuplicate" type="checkbox" />Allow duplicate in main storerooms</label><p>Leave unchecked normally. Tick only when intentionally stocking this medicine in both main rooms.</p><button className="primary-button" disabled={!unit}>Save drug line</button><button type="button" className="text-button" onClick={cancel}>Cancel line</button>
  </fieldset></form>;
}
