import {balance,sessionMonths,type State} from './ledger';

/** Backup files are untrusted input. Money is always integer minor units. */
export function validateBackup(raw:unknown):State {
  const s=structuredClone(raw) as State;
  const fail=()=>{throw Error('Invalid backup. Export a complete School Ledger JSON backup and try again.');};
  const money=(v:unknown,signed=false)=>typeof v==='number'&&Number.isSafeInteger(v)&&Math.abs(v)<=1e11&&(signed||v>=0);
  const str=(v:unknown)=>typeof v==='string'&&v.length<10000;
  if(!s||!str(s.school)||!s.school.trim()||!['INR','USD','GBP'].includes(s.currency)||!/^\d{4}[–-]\d{4}$/.test(s.session))fail();
  for(const k of ['students','staff','accounts','tx','salaries','users','audit','expenseCategories','feeCategories'] as const)if(!Array.isArray(s[k])||s[k].length>100000)fail();
  const unique=(rows:{id:string}[])=>{const ids=new Set<string>();for(const r of rows){if(!str(r.id)||!r.id||ids.has(r.id))fail();ids.add(r.id);}};
  for(const list of [s.students,s.staff]){unique(list);for(const p of list){p.joined??='';if(![p.name,p.code,p.group,p.section,p.contact,p.session,p.joined].every(str)||![p.amount,p.previous,p.discount].every(v=>money(v))||p.discount>p.amount*12+p.previous)fail();if(p.transport){if(typeof p.transport.enabled!=='boolean'||!Array.isArray(p.transport.charges)||p.transport.charges.length>12)fail();const seen=new Set();for(const c of p.transport.charges){if(!sessionMonths(p.session).includes(c.period)||seen.has(c.period)||!money(c.amount)||c.amount===0)fail();seen.add(c.period);}}}}
  unique(s.accounts);for(const a of s.accounts)if(!str(a.name)||!money(a.opening))fail();
  unique(s.salaries);const salaryKeys=new Set();for(const r of s.salaries){const key=r.person+':'+r.period;if(salaryKeys.has(key)||!s.staff.some(p=>p.id===r.person)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.period)||!money(r.amount)||!money(r.adjustment,true)||r.amount+r.adjustment<0)fail();salaryKeys.add(key);}
  unique(s.tx);const receipts=new Set();for(const t of s.tx){if(!['fee','salary','income','expense','transfer'].includes(t.kind)||!money(t.amount,true)||t.amount===0||!str(t.receipt)||receipts.has(t.receipt)||!s.accounts.some(a=>a.id===t.account)||!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||Number.isNaN(Date.parse(t.date))||new Date(t.date).toISOString().slice(0,10)!==t.date)fail();receipts.add(t.receipt);if(![t.person,t.period,t.to,t.category,t.method,t.reference,t.notes].every(str))fail();if(t.kind==='fee'&&!s.students.some(p=>p.id===t.person))fail();if(t.kind==='salary'&&!s.salaries.some(r=>r.person===t.person&&r.period===t.period))fail();if(t.kind==='transfer'&&(!s.accounts.some(a=>a.id===t.to)||t.to===t.account))fail();if(t.feeAllocation&&(!money(t.feeAllocation.tuition,true)||!money(t.feeAllocation.transport,true)||t.feeAllocation.tuition+t.feeAllocation.transport!==t.amount||Math.sign(t.feeAllocation.tuition)*Math.sign(t.amount)<0||Math.sign(t.feeAllocation.transport)*Math.sign(t.amount)<0))fail();if(t.amount<0&&!t.reverses)fail();if(t.reverses){const original=s.tx.find(x=>x.id===t.reverses);if(!original||original.reverses||original.kind!==t.kind||original.account!==t.account||original.to!==t.to||original.person!==t.person||original.period!==t.period||t.amount>=0||!t.notes.trim())fail();}}
  for(const t of s.tx.filter(t=>!t.reverses)){const refunds=s.tx.filter(r=>r.reverses===t.id);if(t.amount+refunds.reduce((a,r)=>a+r.amount,0)<0)fail();if(t.kind==='fee')for(const c of ['tuition','transport'] as const)if((t.feeAllocation?.[c]??(c==='tuition'?t.amount:0))+refunds.reduce((a,r)=>a+(r.feeAllocation?.[c]??(c==='tuition'?r.amount:0)),0)<0)fail();}
  for(const a of s.accounts)if(!Number.isSafeInteger(balance(s,a.id))||balance(s,a.id)<0)fail();
  for(const r of s.salaries)if(s.tx.filter(t=>t.kind==='salary'&&t.person===r.person&&t.period===r.period).reduce((a,t)=>a+t.amount,0)>r.amount+r.adjustment)fail();
  if(!s.expenseCategories.every(str)||!s.feeCategories.every(str)||!s.users.every(u=>str(u.email)&&['Admin','Accountant'].includes(u.role))||!s.audit.every(a=>str(a.date)&&str(a.actor)&&str(a.action)))fail();
  return s;
}

export function receiptSequence(s:State){return s.tx.reduce((n,t)=>Math.max(n,/^GPS-\d+$/.test(t.receipt)?Number(t.receipt.slice(4))+1:1),s.nextReceipt||1);}
