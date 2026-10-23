import { ActionReason } from './ActionReason';
import { gmtDateTime } from './display';
import { useState } from 'react';
import { api, messageOf } from './api';
import type { StockSubmit } from './DeliveryForm';
interface Document { header: { supplier: string; reference: string; reason: string; received_by: string; created_at: string }; lines: { id: string; line_number: number; name: string; strength: string; dosage_form: string; batch_number: string; expiry: string; label: string; base_quantity: number; base_unit: string; expected_quantity: number; received_quantity: number; reason: string; approved_at: string | null; approved_by: string | null; approval_reason: string | null; allocations: { name: string; quantity: number; location_id: string }[] }[] }
export function SupplierReceipt({ id, reference, canApprove, disabled, submit }: { id: string; reference: string; canApprove: boolean; disabled: boolean; submit: StockSubmit }) {
  const [document, setDocument] = useState<Document | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true); setError('');
    try { setDocument(await api<Document>(`/inventory/deliveries/${id}`)); }
    catch (e) { setError(`${messageOf(e)} Full receipts require access to every included stock location; ask an admin to review a receipt spanning other shops.`); }
    finally { setLoading(false); }
  }
  return <article className="panel"><h3>Supplier receipt · {reference}</h3><button type="button" className="text-button" disabled={loading} onClick={() => document ? setDocument(null) : void open()}>{document ? 'Close supplier receipt' : 'Open supplier receipt'}</button>{error && <p role="alert">{error}</p>}{document && <>
    <p>{document.header.supplier} · Ref {document.header.reference}</p><p>{document.header.reason}</p><p>{document.lines.length} drug / batch lines · Received by {document.header.received_by}<br />{gmtDateTime(document.header.created_at)} GMT</p>
    <ol className="receipt-lines">{document.lines.map(line => <li key={line.id}><strong>{line.name} · {line.strength} · {line.dosage_form}</strong><p>Batch {line.batch_number} · Expiry {line.expiry}</p><p>{line.label}: {line.base_quantity} {line.base_unit}(s) per pack<br />Supplier: {line.expected_quantity / line.base_quantity} packs ({line.expected_quantity} {line.base_unit})<br />Received: {line.received_quantity / line.base_quantity} packs ({line.received_quantity} {line.base_unit})</p>{line.expected_quantity !== line.received_quantity && <p className="error-message">{line.received_quantity < line.expected_quantity ? 'Short' : 'Extra'}: {Math.abs(line.expected_quantity - line.received_quantity)} {line.base_unit}(s)</p>}<p>{line.reason}</p>{line.allocations.map(a => <p key={a.location_id}>{a.name}: {a.quantity} {line.base_unit}(s)</p>)}{line.approved_at && <p>Reviewed and approved by {line.approved_by} · {gmtDateTime(line.approved_at)} GMT<br />{line.approval_reason}</p>}</li>)}</ol>
    {!document.lines.every(line => line.approved_at) && <><p>Awaiting admin review. Received stock is already recorded.</p>{canApprove && <form className="stock-form" onSubmit={e => { e.preventDefault(); void submit(`/inventory/deliveries/${id}/approve`, { reason: String(new FormData(e.currentTarget).get('reason')) }, 'Complete supplier receipt approval'); }}><fieldset disabled={disabled}><ActionReason label="Approval notes" action="Approve delivery record"/><button className="text-button">Approve delivery record</button></fieldset></form>}</>}
  </>}</article>;
}
