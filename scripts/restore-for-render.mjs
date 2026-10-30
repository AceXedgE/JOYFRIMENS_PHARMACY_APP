import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import pg from 'pg';

export async function restoreDatabase(db,sql,metadata){
 if(createHash('sha256').update(sql).digest('hex')!==metadata.sha256)throw new Error('Export checksum mismatch.');
 const executable=sql.replace(/^\\(?:un)?restrict\b.*$/gm,'');
 if(/^\\/m.test(executable)||/^COPY .* FROM stdin;/m.test(executable))throw new Error('Create a fresh INSERT-format export first.');
 await db.exec('BEGIN');
 try{
  if(Number((await db.query("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n)!==0)throw new Error('Destination is not empty.');
  await db.exec(executable);
  const actualTables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
  if(JSON.stringify(actualTables)!==JSON.stringify(Object.keys(metadata.counts).sort()))throw new Error('Restored table list mismatch.');
  for(const [table,expected] of Object.entries(metadata.counts)){
   const identifier='"'+table.replaceAll('"','""')+'"';
   if(Number((await db.query(`SELECT count(*) AS n FROM ${identifier}`)).rows[0].n)!==expected)throw new Error('Restored row count mismatch.');
  }
  await db.exec('COMMIT');
  return {verifiedTables:actualTables.length,counts:metadata.counts};
 }catch(error){await db.exec('ROLLBACK');throw error;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let client;
 try{
  const filename=process.argv[process.argv.indexOf('--file')+1];
  if(!process.argv.includes('--apply')||!process.argv.includes('--file')||!filename)throw new Error('Use --apply --file private-export.sql.');
  const url=new URL(process.env.RENDER_DATABASE_URL);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.render.com'))throw new Error('A Render external database URL is required.');
  url.searchParams.delete('sslmode');
  client=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000});
  await client.connect();
  const sql=await readFile(filename,'utf8'),metadata=JSON.parse(await readFile(filename+'.json','utf8'));
  const result=await restoreDatabase({query:(...args)=>client.query(...args),exec:text=>client.query(text)},sql,metadata);
  console.log(JSON.stringify({restored:true,...result},null,2));
 }catch(error){console.error('Restore failed; no partial import will be committed. Error code:',error.code??'VALIDATION_OR_CONNECTION_ERROR');process.exitCode=1;}
 finally{await client?.end();}
}
