export interface CatalogueUnit {
  id: string; label: string; baseQuantity: number; barcode: string | null;
  priceMinor: number; priceVersion: number; available: boolean | null; listingVersion: number;
}
export interface Product {
  id: string; name: string; genericName: string; strength: string; dosageForm: string; baseUnit: string;
  units: CatalogueUnit[]; match: 'exact' | 'prefix' | 'contains' | 'suggestion';
}
export interface CatalogueResult { products: Product[]; total: number; page: number; pageSize: number; canChangePrices: boolean; canManageCatalogue: boolean; }
export interface PriceHistory { version: number; old_price_minor: number | null; price_minor: number; reason: string; changed_at: string; changed_by: string; }
export const money = (minor: number) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(minor / 100);
export function parseMoney(value: string): number {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Enter a GHS price with no more than two decimal places.');
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (minor < 1 || minor > 100000000) throw new Error('Prices must be between GHS 0.01 and GHS 1,000,000.00.');
  return minor;
}
