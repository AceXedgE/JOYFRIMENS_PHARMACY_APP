import { randomUUID } from 'node:crypto';
import type { Database } from '../src/database.ts';

// Seed the historical schema directly: current API writes require current migrations.
export async function legacyCatalogue(db: Database, name: string, strength: string, units: { label: string; quantity: number; price: number; barcode?: string }[]) {
  const product = randomUUID();
  const actor = (await db.query<{id:string}>('SELECT id FROM users WHERE role=\'admin\' LIMIT 1')).rows[0].id;
  await db.query(`INSERT INTO products(id,name,generic_name,strength,dosage_form,base_unit,created_by) VALUES($1,$2,$2,$3,'Tablet','tablet',$4)`, [product,name,strength,actor]);
  for (const unit of units) {
    const id=randomUUID();
    await db.query('INSERT INTO selling_units(id,product_id,label,base_quantity,barcode) VALUES($1,$2,$3,$4,$5)',[id,product,unit.label,unit.quantity,unit.barcode??null]);
    await db.query('INSERT INTO unit_prices(unit_id,price_minor,version) VALUES($1,$2,1)',[id,unit.price]);
    await db.query('INSERT INTO shop_listings(shop_id,unit_id,available,version) SELECT id,$1,true,1 FROM shops',[id]);
    await db.query(`INSERT INTO price_history(unit_id,version,price_minor,initiating_shop_id,changed_by,reason) SELECT $1,1,$2,id,$3,'Historical catalogue fixture' FROM shops ORDER BY code LIMIT 1`,[id,unit.price,actor]);
  }
}
