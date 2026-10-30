import {PGlite} from '@electric-sql/pglite';
import {pgDump} from '@electric-sql/pglite-tools/pg_dump';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readConfig} from '../backend/dist/config.js';

export async function exportDatabase(pg){
 const dump=await pgDump({pg,args:['--schema=public','--no-owner','--no-acl','--inserts','--exclude-table-data=public.sessions','--exclude-table-data=public.login_limits']});
 const sql="DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public') THEN RAISE EXCEPTION 'Restore requires an empty public schema'; END IF; END $$;\n"+(await dump.text()).replace(/^CREATE SCHEMA public;$/m,'CREATE SCHEMA IF NOT EXISTS public;')+'\nSET search_path TO public;\n';
 const tables=(await pg.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const counts={};for(const {tablename} of tables){const escaped='"'+tablename.replaceAll('"','""')+'"';counts[tablename]=['sessions','login_limits'].includes(tablename)?0:Number((await pg.query(`SELECT count(*) AS n FROM ${escaped}`)).rows[0].n);}
 return {sql,metadata:{exportedAt:new Date().toISOString(),sha256:createHash('sha256').update(sql).digest('hex'),serverVersion:(await pg.query('SHOW server_version')).rows[0].server_version,counts,excludedData:['sessions','login_limits']}};
}
if(process.argv.includes('--output')){
 if(!process.argv.includes('--server-stopped'))throw new Error('Stop the local API first, then include --server-stopped.');
 const config=readConfig();if(config.production||config.databaseUrl)throw new Error('This exporter is for the local embedded database only.');
 let running=false;try{running=(await fetch(`http://127.0.0.1:${config.port}/api/health`,{signal:AbortSignal.timeout(1500)})).ok;}catch{}
 if(running)throw new Error('The local API is still running. Stop it before exporting.');
 const filename=process.argv[process.argv.indexOf('--output')+1];if(!filename||filename.startsWith('--'))throw new Error('Provide an output filename.');
 const pg=await PGlite.create(config.dataDir);
 try{const {sql,metadata}=await exportDatabase(pg);await writeFile(resolve(filename),sql,{flag:'wx',mode:0o600});await writeFile(resolve(filename)+'.json',JSON.stringify(metadata,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({file:resolve(filename),...metadata},null,2));}finally{await pg.close();}
}
