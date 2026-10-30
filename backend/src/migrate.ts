import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Database } from './database.ts';

const migrations = ['001_accounts.sql', '002_catalogue.sql', '003_inventory.sql', '004_supplier_documents.sql', '005_sales.sql', '006_cash_control.sql', '007_shelf_sales.sql', '008_daily_cash.sql', '009_sale_price_exceptions.sql', '010_sales_cutoff.sql', '011_count_permissions.sql', '012_count_sales_date.sql', '013_exception_days_cash_in.sql', '014_simple_medicine_identity.sql', '015_final_cash_submission.sql', '016_offline_records.sql', '017_medicine_notifications.sql', '018_supplier_portal.sql', '019_unpriced_catalogue.sql', '020_catalogue_management.sql', '021_medicine_variations.sql', '022_medicine_options.sql'];
export const SCHEMA_VERSION = migrations.length;

export async function migrate(db: Database) {
  await db.transaction(async tx => {
    await tx.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await tx.exec('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    const applied = (await tx.query<{ version: number; checksum: string }>('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;
    if (applied.some((entry, index) => entry.version !== index + 1 || entry.version > SCHEMA_VERSION)) throw new Error('Unknown or incomplete migration history.');
    for (const [index, filename] of migrations.entries()) {
      const version = index + 1;
      const sql = await readFile(new URL(`../migrations/${filename}`, import.meta.url), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prior = applied.find(entry => entry.version === version);
      if (prior) {
        if (prior.checksum !== checksum) throw new Error('Applied migration was modified. Add a new migration instead.');
        continue;
      }
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations(version, checksum) VALUES ($1,$2)', [version, checksum]);
    }
  });
}

export async function requireSchema(db: Database) {
  const result = await db.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
  if (result.rows[0]?.version !== SCHEMA_VERSION) throw new Error('Run database migrations before starting the API.');
}
