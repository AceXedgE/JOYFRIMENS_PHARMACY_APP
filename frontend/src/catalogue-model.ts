export interface CatalogueUnit {
  variation?:boolean;
  id: string; label: string; baseQuantity: number; barcode: string | null;
  priceMinor: number; priceVersion: number; available: boolean | null; listingVersion: number; storerooms?: string[];
}
export interface Product {
  revision:number;archived:boolean;
  id: string; name: string; genericName: string; strength: string; dosageForm: string; baseUnit: string;
  units: CatalogueUnit[]; match: 'exact' | 'prefix' | 'contains' | 'suggestion';
}
export interface CatalogueResult { offline?:boolean; products: Product[]; total: number; page: number; pageSize: number; canChangePrices: boolean; canManageCatalogue: boolean; }
export interface PriceHistory { version: number; old_price_minor: number | null; price_minor: number; reason: string; changed_at: string; changed_by: string; }
export const money = (minor: number) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(minor / 100);
export function parseMoney(value: string, allowZero = false): number {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Enter a GHS price with no more than two decimal places.');
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (minor < (allowZero ? 0 : 1) || minor > 100000000) throw new Error('Prices must be between GHS 0.01 and GHS 1,000,000.00.');
  return minor;
}
