import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Database } from './database.ts';

const migrations = ['001_accounts.sql', '002_catalogue.sql', '003_inventory.sql', '004_supplier_documents.sql', '005_sales.sql', '006_cash_control.sql', '007_shelf_sales.sql', '008_daily_cash.sql', '009_sale_price_exceptions.sql', '010_sales_cutoff.sql', '011_count_permissions.sql', '012_count_sales_date.sql', '013_exception_days_cash_in.sql', '014_simple_medicine_identity.sql', '015_final_cash_submission.sql', '016_offline_records.sql', '017_medicine_notifications.sql', '018_supplier_portal.sql', '019_unpriced_catalogue.sql', '020_catalogue_management.sql', '021_medicine_variations.sql', '022_medicine_options.sql'];
export const SCHEMA_VERSION = migrations.length;

// These exact historical mixed-line-ending files normalize to the Git LF files.
// Keep stored history intact; an alias is valid only for its verified SQL digest.
const legacyLineEndings: Record<number, [string, string]> = {
  7: ['ab95a4a1f68fcc1da79c30403528a858352b84166fbf4a32cf9a9647db826a34', '90dd6a5065363d9dad0361c400efc48d043ca579e18a9255e568d4e2e3a1f842'],
  8: ['4697be9b2273007e5f0f7ff49dea93ad7e2b80ddccde18eea49dee76e39426f5', '78bbabd9e0b7d1402c67768012cbf90cf867572bcbed3d4c019e23326e3fe3b6'],
  9: ['6d585cf70441a80aee8738297720bba31983efbbeb3965e892ec795cf861d2c0', 'b2da86f00dfad7788216af007ba428b76d8870f88af80aa99616170438d20a0a'],
};
const digest = (sql: string) => createHash('sha256').update(sql).digest('hex');
export const migrationChecksum = (sql: string) => digest(sql.replace(/\r\n/g, '\n'));
export function migrationChecksumMatches(version: number, stored: string, sql: string) {
  const canonical = migrationChecksum(sql);
  const legacy = legacyLineEndings[version];
  return stored === canonical || stored === digest(sql) ||
    Boolean(legacy && stored === legacy[0] && canonical === legacy[1]);
}

export async function migrate(db: Database) {
  await db.transaction(async tx => {
    await tx.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await tx.exec('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    const applied = (await tx.query<{ version: number; checksum: string }>('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;
    if (applied.some((entry, index) => entry.version !== index + 1 || entry.version > SCHEMA_VERSION)) throw new Error('Unknown or incomplete migration history.');
    for (const [index, filename] of migrations.entries()) {
      const version = index + 1;
      const sql = await readFile(new URL(`../migrations/${filename}`, import.meta.url), 'utf8');
      const checksum = migrationChecksum(sql);
      const prior = applied.find(entry => entry.version === version);
      if (prior) {
        if (!migrationChecksumMatches(version, prior.checksum, sql)) throw new Error(`Applied migration ${filename} was modified. Add a new migration instead.`);
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
