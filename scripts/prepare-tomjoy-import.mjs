import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source=await readFile('docs/tomjoy-price-list-source.txt','utf8');
const products=new Map(),notes=[],starred=[],rows=[];
let section='',parent='';
const parents=new Set(['AMOXICILLIN','METRONIDAZOLE','METROLEX F','SEPTRIN / CO TRIMOXAZOLE','AZITHROMYCIN','CIPROFLOXACIN','FLUCLOXACIN','CLINDAMYCIN','CEFIXIME','CEFUROXIME','LEVOFLOXACIN']);
function add(name,baseUnit,units,line,raw){
 name=name.replace(/\*+/g,'').replace(/\s+/g,' ').trim();
 if(name==='M2 TONE')name='M2-TONE';
 const key=name.toLowerCase();const prior=products.get(key);
 if(prior){
  notes.push(`Row ${line}: repeated ${name}; merged with row ${prior.sourceRows[0]}. A stated price takes precedence over a blank price.`);
  for(const unit of units){const old=prior.units.find(u=>u.label===unit.label);if(!old)prior.units.push(unit);else if(old.priceMinor===0)old.priceMinor=unit.priceMinor;else if(unit.priceMinor&&old.priceMinor!==unit.priceMinor)throw new Error('Conflicting duplicate price: '+name);}
  prior.sourceRows.push(line);return;
 }
 products.set(key,{name,baseUnit,units,sourceRows:[line],sourcePrice:raw});
}
for(const [index,text] of source.split(/\r?\n/).entries()){
 const line=index+1;
 if(!text.includes('|')){if(text.trim()){section=text.trim();parent='';}continue;}
 let [name,raw='']=text.split('|').map(s=>s.trim().replace(/\s+/g,' '));
 if(!name||raw==='PRICE')continue;
 rows.push({line,name,price:raw,section});
 if(section==='ANTIBIOTICS'&&parents.has(name)&&!raw){parent=name;notes.push(`Row ${line}: ${name} is a parent heading; its variants become medicine entries.`);continue;}
 if(section==='ANTIBIOTICS'&&parent&&/^(CAPS\b|SUSP\b|SUSPENSION\b|INFUSION$|TABLET\b|\d|UK$)/i.test(name))name=parent+' '+name;
 if(name==='BRUFEN/IBUPROFEN'||name==='PARACETAMOL'){notes.push(`Row ${line}: unpriced parent ${name} omitted because its named variants follow.`);continue;}
 if(name==='DISPERSIBLE'&&section==='ANTIMALARIALS'){name='COARTEM DISPERSIBLE';notes.push(`Row ${line}: DISPERSIBLE retained under preceding COARTEM family, price missing.`);}
 if(name==='TEVA'&&section==='ANTIBIOTICS')notes.push(`Row ${line}: TEVA retained exactly as named, GH₵30; the document does not explicitly identify its medicine. Please review.`);
 if(['COLDRELIF','SALO COLD'].includes(name))name+=' '+(section==='COLD TABLETS'?'TABLETS':'SYRUP');
 name=name.replace(/FLUCLOXACIN susp(?:ension)?$/i,'FLUCLOXACIN SUSPENSION');
 if(raw.includes('***'))starred.push({name,price:raw,line});
 let price=raw.replace(/\*+/g,'').trim();
 if(price==='6Oghc'){price='60ghc';notes.push(`Row ${line}: COLGATE MOUTH WASH “6Oghc” read as GH₵60 (letter O).`);}
 if(price==='1=5ghc1'){price='1=5ghc';notes.push(`Row ${line}: SALO COLD TABLETS “1=5ghc1” read as 1 unit = GH₵5; trailing 1 ignored.`);}
 if(/\d+mg$/i.test(price)){name+=' '+price;notes.push(`Row ${line}: “${raw}” is a strength, not a price; ${name} imported at zero.`);price='';}
 if(name==='CELECOXIB'){
  add('CELECOXIB strip','strip',[{label:'strip',baseQuantity:1,priceMinor:3000}],line,raw);
  add('CELECOXIB box','box',[{label:'box',baseQuantity:1,priceMinor:10000}],line,raw);continue;
 }
 let baseUnit='unit';
 if(/1\s*(?:BLISTER|STRIP)\s*=/i.test(price)){name+=' strip';baseUnit='strip';price=price.replace(/1\s*(?:BLISTER|STRIP)\s*=/i,'');}
 else if(/1\s*TAB\s*=/i.test(price)){name+=' (1 tablet)';baseUnit='tablet';price=price.replace(/1\s*TAB\s*=/i,'');}
 price=price.trim();
 let units;
 if(price.includes('=')){
  units=[...price.matchAll(/(\d+)\s*=\s*(\d+(?:\.\d{1,2})?)\s*(?:ghc)?/gi)].map(m=>({label:Number(m[1])===1?'unit':`${Number(m[1])} units`,baseQuantity:Number(m[1]),priceMinor:Math.round(Number(m[2])*100)}));
  if(!units.length)throw new Error('Unparsed price at '+line);
  if(!units.some(u=>u.baseQuantity===1))units.unshift({label:'unit',baseQuantity:1,priceMinor:0});
 }else{
  const match=/^(\d+(?:\.\d{1,2})?)\s*(?:ghc)?$/i.exec(price);
  if(price&&!match)throw new Error(`Unparsed price row ${line}: ${raw}`);
  units=[{label:baseUnit,baseQuantity:1,priceMinor:match?Math.round(Number(match[1])*100):0}];
 }
 add(name,baseUnit,units,line,raw);
}
notes.push('METHODEX SIZE/BIG remains GH₵50 and SIZE/SMALL GH₵80, exactly as supplied; verify the apparent size/price reversal.');
notes.push('Unspecified quantities are generic units, not assumed tablets, strips or bottles. Quantity deals are explicit selling options; selecting 3 single units does not automatically substitute the 3-unit deal.');
const list=[...products.values()];
const output={sourceSha256:createHash('sha256').update(source).digest('hex'),products:list,starred,notes,sourceMedicineRows:rows.length};
await writeFile('docs/tomjoy-catalogue-import.json',JSON.stringify(output,null,2)+'\n');
const csv=v=>'"'+String(v).replaceAll('"','""')+'"';
await writeFile('docs/tomjoy-catalogue-import.csv','\ufeff'+[['Medicine','Selling option','Quantity in units','Price GHS','Source rows'],...list.flatMap(p=>p.units.map(u=>[p.name,u.label,u.baseQuantity,(u.priceMinor/100).toFixed(2),p.sourceRows.join(', ')]))].map(r=>r.map(csv).join(',')).join('\r\n'));
await writeFile('docs/TOMJOY_IMPORT_REVIEW.md',`# Tomjoy price-list import\n\n${rows.length} non-empty medicine rows; ${list.length} unique medicine entries; ${list.flatMap(p=>p.units).length} selling options.\n\n${list.filter(p=>p.units.every(u=>u.priceMinor===0)).length} medicines have no stated price and remain at GH₵0.\n\n## Three-asterisk entries\n\n${starred.map(p=>`- ${p.name}: ${p.price} (source row ${p.line})`).join('\n')}\n\n## Interpretation and review notes\n\n${notes.map(n=>'- '+n).join('\n')}\n\nCategories are not imported. Each medicine is listed as available on both shops' shelves, with no shelf or storeroom quantities. Exact repeated names are merged; different named variants remain separate. See the CSV for every imported selling option.\n`);
console.log(JSON.stringify({sourceRows:rows.length,products:list.length,units:list.flatMap(p=>p.units).length,unpricedProducts:list.filter(p=>p.units.every(u=>u.priceMinor===0)).length,starred},null,2));
