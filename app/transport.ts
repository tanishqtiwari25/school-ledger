import {feeSchedule,paise,sessionMonths,type Person,type State,type TransportPlan} from './ledger';

/** A month is snapshotted at its assigned rate; elapsed or funded months cannot be rewritten. */
export function transportPlan(raw:unknown,old:Person|undefined,person:Person,state:State,currentMonth:string):TransportPlan|undefined {
 if(raw===undefined)return old?.transport;
 let data:any;try{data=typeof raw==='string'?JSON.parse(raw):raw}catch{throw Error('Invalid transport fee plan.');}
 if(!data||typeof data.enabled!=='boolean'||!Array.isArray(data.charges)||data.charges.length>12)throw Error('Choose a valid transport plan.');
 if(old?.transport?.charges.length&&old.session!==person.session)throw Error('Transport history belongs to this session. Create a separate student-session record for a new session.');
 const allowed=sessionMonths(person.session),seen=new Set<string>();
 const charges=data.charges.map((c:any)=>{if(!allowed.includes(c.period)||seen.has(c.period))throw Error('Choose each transport month once within the academic session.');seen.add(c.period);const amount=paise(c.amount);if(amount<=0)throw Error('Selected transport months need a fee greater than zero.');return {period:c.period,amount}}).sort((a:any,b:any)=>a.period.localeCompare(b.period));
 if(data.enabled&&!charges.length)throw Error('Select at least one transport fee month.');
 const locked=new Set(old?feeSchedule(state,old,'transport').filter(c=>c.paid>0).map(c=>c.period):[]);
 if(old?.transport){for(const period of allowed){if(period<currentMonth||locked.has(period)){const before=old.transport.charges.find(c=>c.period===period)?.amount||0,after=charges.find((c:any)=>c.period===period)?.amount||0;if(before!==after)throw Error('Elapsed or paid transport months are locked. Change future unpaid months only.');}}}
 return {enabled:data.enabled,charges};
}
