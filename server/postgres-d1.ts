/** Adapter for the existing parameterized ledger queries. No user SQL is accepted. */
type QueryResult={rows:any[];rowCount:number|null};
type Client={query:(sql:string,params?:any[])=>Promise<QueryResult>;release:()=>void};
export type Pool={query:Client['query'];connect:()=>Promise<Client>};
export function postgresSQL(sql:string){
 let index=0;
 let converted=sql.replace(/\?/g,()=>'$'+(++index));
 if(/^INSERT OR IGNORE INTO ledger /i.test(converted))converted=converted.replace(/^INSERT OR IGNORE/i,'INSERT')+' ON CONFLICT (id) DO NOTHING';
 return converted;
}
class Statement{
 constructor(readonly owner:PostgresD1,readonly sql:string,readonly params:any[]=[]){ }
 bind(...params:any[]){return new Statement(this.owner,this.sql,params);}
 async execute(client:{query:Client['query']}=this.owner.pool){return client.query(postgresSQL(this.sql),this.params);}
 async run(){const result=await this.execute();return {success:true,meta:{changes:result.rowCount||0},results:result.rows};}
 async first<T=any>():Promise<T|null>{return (await this.execute()).rows[0]??null;}
 async all(){const result=await this.execute();return {success:true,results:result.rows,meta:{changes:result.rowCount||0}};}
}
export class PostgresD1{
 constructor(readonly pool:Pool){}
 prepare(sql:string){return new Statement(this,sql);}
 async batch(statements:Statement[]){
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   // A backup and its ledger update share a lock and transaction. Competing
   // payments recheck the saved version after acquiring this lock.
   await client.query("SELECT id FROM ledger WHERE id='school' FOR UPDATE");
   const results=[];
   for(const statement of statements){const result=await statement.execute(client);results.push({success:true,results:result.rows,meta:{changes:result.rowCount||0}});}
   await client.query('COMMIT');return results;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
}
