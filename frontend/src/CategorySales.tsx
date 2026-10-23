import { useState } from 'react';
import { money } from './catalogue-model';
export interface CategorySaleLine {id:string;category_name:string;description:string;quantity:number;unit_label:string;price_minor:number;total_minor:number;carried_late:boolean}
export function CategorySales({lines}:{lines:CategorySaleLine[]}){
  const [separate,setSeparate]=useState(true);
  const groups=new Map<string,CategorySaleLine[]>();
  if(separate)groups.set('General',[]);
  for(const line of lines){const name=separate?line.category_name:'All medicines';groups.set(name,[...(groups.get(name)??[]),line]);}
  return <div className="category-sales"><label className="counter-check"><input type="checkbox" checked={separate} onChange={e=>setSeparate(e.target.checked)}/>Separate category totals</label>
    {[...groups].map(([name,items])=><article className="category-total" key={name}><p><strong>{name==='General'?'Ordinary medicines':name}</strong> <strong>{money(items.reduce((sum,l)=>sum+l.total_minor,0))}</strong></p><details><summary>Show medicines</summary>{!items.length?<p>No sales in this group.</p>:items.map(l=><div className={l.carried_late?'late-sales':''} key={l.id}><strong>{l.description}</strong><p>{l.quantity} {l.unit_label}(s) at {money(l.price_minor)} / Sold for {money(l.total_minor)}</p>{l.carried_late&&<small>Sold after the previous day's cutoff</small>}</div>)}</details></article>)}
  </div>;
}
