export const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const words = (value: string) => normalize(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// Bounded edit distance; numeric strengths must match literally, never approximately.
function near(a: string, b: string): boolean {
  if (a.length < 4 || /\d/.test(a + b)) return false;
  const limit = a.length < 7 ? 1 : 2;
  if (Math.abs(a.length - b.length) > limit) return false;
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...next) > limit) return false;
    row = next;
  }
  return row[b.length] <= limit;
}
export type Match = 'exact' | 'prefix' | 'contains' | 'suggestion';
function rankIdentity(product: { name: string; genericName: string; strength: string; dosageForm: string; barcodes: string[] }, query: string): { score: number; match: Match } | null {
  const q = normalize(query);
  if (!q) return { score: 0, match: 'contains' };
  const names = [product.name, product.genericName].map(normalize);
  const full = [...names, normalize(`${product.name} ${product.strength} ${product.dosageForm}`), normalize(`${product.genericName} ${product.strength} ${product.dosageForm}`)];
  if (full.includes(q) || product.barcodes.some(code => normalize(code) === q)) return { score: 0, match: 'exact' };
  if (full.some(name => name.startsWith(q))) return { score: 1, match: 'prefix' };
  if (full.some(name => name.includes(q))) return { score: 2, match: 'contains' };
  const tokens = words(q);
  if (!tokens.length) return null;
  const candidates = words(`${product.name} ${product.genericName} ${product.strength} ${product.dosageForm}`);
  const direct = (token: string, candidate: string) => /\d/.test(token) ? candidate === token : candidate.includes(token);
  if (tokens.every(token => candidates.some(candidate => direct(token, candidate)))) return { score: 2, match: 'contains' };
  if (tokens.every(token => candidates.some(candidate => direct(token, candidate) || near(token, candidate)))) return { score: 3, match: 'suggestion' };
  return null;
}

// Search each option separately so variant strengths cannot be combined into a false match.
export function rankProduct(product:{name:string;genericName:string;strength:string;dosageForm:string;barcodes:string[];units?:{label:string}[]},query:string):{score:number;match:Match}|null{
 const matches=[rankIdentity(product,query),...(product.units??[]).map(unit=>rankIdentity({...product,name:normalize(unit.label).startsWith(normalize(product.name))?unit.label:product.name+' '+unit.label},query))].filter((match):match is {score:number;match:Match}=>match!==null);
 return matches.sort((a,b)=>a.score-b.score)[0]??null;
}
