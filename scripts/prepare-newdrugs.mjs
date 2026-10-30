import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Explicit review of the owner's shorthand. Source line numbers refer to nonblank
// medicine lines, before the rules at the end of docs/newdrugs.md.
const groups={
 1:['Feroglobin',[['Default',120],['Feroglobin plus',180]]],
 2:['Polyfer',[['Default',30],['Polyfer small',10]]],
 3:['Cirotamin',[['Cirotamin syrp',35],['Cirotamin caps',30]]],
 4:['Abyvita caps',[['box',10],['strip',5]]],
 5:['Abytone caps',[['box',15],['strip',5]]],
 6:['Zincofer',[['Zincofer syrp',30],['Zincofer caps',30]]],
 8:['COA mixture',[['Default',150],['COA mixture plus',200]]],
 10:['Tres-orix',[['Tres-orix small',50],['Tres-orix large',90]]],
 12:['Super apiti',[['Super apiti syrp',30],['Super apiti caps',5]]],
 14:['Luex',[['Luex adult (dry)',40],['Luex adult (night)',40],['Luex kids (chest)',40],['Luex kids (dry)',40]]],
 16:['Amoksiklav suspension',[['Amoksiklav suspension 457',80],['Amoksiklav suspension 228.5',60]]],
 18:['Amokxinate suspension 228.5',[['Default',60]]],
 36:['Haemoglobin syrp',[['Haemoglobin syrp green',15],['Haemoglobin syrp yellow',20]]],
 37:['Dynewell',[['Dynewell syrp',15],['Dynewell tab (2 units)',5]]],
 39:['Malar 2',[['Malar 2 tab',30],['Malar 2 suspension',30]]],
 43:['Asnac',[['Asnac 75',20],['Asnac 100',20]]],
 47:['Pilex',[['Pilex ointment',100],['Pilex tab',150]]],
 48:['Mercy ointment',[['Mercy ointment large',50],['Mercy ointment small',30],['Mercy ointment tube',15]]],
 50:['Ketazol',[['Ketazol shampoo',60],['Ketazol cream',30]]],
 53:['Savlon',[['Savlon small',35],['Savlon medium',50],['Savlon large',110]]],
 54:['Camel',[['Camel small',20],['Camel medium',35],['Camel large',50]]],
 64:['redsun (oral gel)',[['pack',5],['box',20]]],
 69:['CPM 4mg',[['2 units',5]]],
 70:['prednisolone 5mg',[['2 units',5]]],
 73:['snuf',[['snuf green',7],['snuf yellow',7],['snuf shamor',10],['snuf hajia',15]]],
 75:['O-formin',[['strip',5],['box',50]]],
 77:['Metformin Denk 500',[['strip',20],['box',200]]],
 82:['phopain',[['2 units',5]]],
 83:['flucor',[['flucor day',50],['flucor night',50]]],
 84:['tothema',[['tothema full',150],['tothema half',75]]],
 86:['kiss',[['kiss condom',10],['kiss lubricant',45]]],
 87:['fiesta',[['fiesta condom',10],['fiesta lubricant',45]]],
 88:['levon 2',[['levon 2 lubricant',40],['levon 2 contraceptive',20]]],
 90:['secure',[['box',30],['strip',10]]],
 93:['condom box',[['condom box big',150],['condom box small',120]]],
 110:['dragon',[['dragon spray',65],['dragon tablet',60]]],
};
// Owner confirmed these spelling/name equivalents should be left unchanged.
const explicitSkips={
 11:{names:['APITIZOOM'],reason:'Owner confirmed Aptizooom is the existing APITIZOOM; leave it unchanged.'},
 14:{names:['LEUX COUGH SYRUPS'],reason:'Owner confirmed Luex is the existing LEUX COUGH SYRUPS; leave it unchanged. All four listed prices were confirmed as GHS 40, but existing entries must not be updated.'},
 17:{names:[],reason:'Owner explicitly deferred Oxynic, klovinal and amovulin.'},
 58:{names:['MENOTA'],reason:'Existing MENOTA; do not change its name, unit or price.'},
 59:{names:["FISHERMAN'S FRIEND"],reason:'Existing FISHERMAN’S FRIEND; preserve its packet and price.'},
 60:{names:['DIOFEN 50'],reason:'Existing DIOFEN 50; leave its price and other names unchanged.'},
 79:{names:['CIPROFLOXACIN TABLET CIPROLEX'],reason:'Owner confirmed ciprolex is this existing tablet entry; eye drops remain a different new entry.'},
 83:{names:['FLUCOR DAY','FLUCOR NIGHT'],reason:'Both versions already exist as separate medicines; leave both unchanged.'},
};
export const normalizeName=s=>s.toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9]/g,'');
export async function prepareNewDrugs(){
 const source=await readFile('docs/newdrugs.md','utf8');
 const lines=source.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const boundary=lines.findIndex(s=>s.startsWith('- everything'));
 if(boundary!==113)throw new Error('Source structure changed; review the line mapping before importing.');
 const entries=lines.slice(0,boundary).map((line,index)=>{
  const sourceLine=index+1,aliases=[...line.matchAll(/_([^_]+)_/g)].map(m=>m[1].trim());
  let name,options;
  if(groups[sourceLine]) [name,options]=groups[sourceLine];
  else {
   const clean=line.replace(/_[^_]+_/g,'').trim(),price=clean.match(/ghc\s*(\d+(?:\.\d{1,2})?)/i);
   name=(price?clean.slice(0,price.index):clean).trim().replace(/[-–,\s]+$/,'');
   options=[[/\bblister\b/i.test(name)?'strip':/\bpack\b/i.test(name)?'pack':'Default',price?Number(price[1]):0]];
  }
  return {sourceLine,source:line,name,genericName:aliases.join(', '),baseUnit:options[0][0]==='Default'?'unit':options[0][0],
   units:options.map(([label,price],position)=>({label,priceMinor:Math.round(price*100),baseQuantity:1,variation:position>0,displayOrder:position})),
   skip:explicitSkips[sourceLine]??null};
 });
 return {source:'docs/newdrugs.md',sourceSha256:createHash('sha256').update(source).digest('hex'),mode:'add-only-existing-unchanged',entries};
}
if(process.argv.includes('--write')){
 const manifest=await prepareNewDrugs();await writeFile('docs/newdrugs-import.json',JSON.stringify(manifest,null,2)+'\n');
 console.log({sourceLines:manifest.entries.length,explicitlySkipped:manifest.entries.filter(e=>e.skip).length,newCandidates:manifest.entries.filter(e=>!e.skip).length});
}
