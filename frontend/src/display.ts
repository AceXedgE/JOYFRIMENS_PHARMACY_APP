export function gmtDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', { timeZone: 'Etc/GMT', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function packBreakdown(quantity: number, packSize: number, packLabel: string, baseUnit: string): string {
  return `${Math.floor(quantity / packSize)} ${packLabel}(s) + ${quantity % packSize} loose ${baseUnit}(s); 1 ${packLabel} = ${packSize} ${baseUnit}(s)`;
}
