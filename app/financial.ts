import {balance,paid,paise,componentPayable,componentPaid,componentDue, type State,type Tx} from './ledger';

export function refundable(s:State,t:Tx){return t.reverses?0:Math.max(0,t.amount+s.tx.filter(x=>x.reverses===t.id).reduce((a,x)=>a+x.amount,0))}
export type PaymentInput = Record<string, any>;

/** Used by both the server and offline preflight; the server remains authoritative. */
export function paymentContext(s:State,p:PaymentInput):string {
  const original=p.kind==='reversal'?s.tx.find(t=>t.id===p.original):undefined;
  const account=original?.account||p.account,to=original?.to||p.to;
  const person=original?.person||p.person,period=original?.period||p.period;
  const student=s.students.find(x=>x.id===person);
  return JSON.stringify({...(student?.transport?{componentPayments:{tuition:componentPaid(s,person,'tuition'),transport:componentPaid(s,person,'transport')}}:{}),currency:s.currency,
    account:s.accounts.find(a=>a.id===account),balance:balance(s,account),
    destination:to?s.accounts.find(a=>a.id===to):null,destinationBalance:to?balance(s,to):null,
    student:s.students.find(x=>x.id===person)||null,staff:s.staff.find(x=>x.id===person)||null,
    feePaid:person?paid(s,person):0,salaryPaid:person?paid(s,person,'salary',period):0,
    salary:s.salaries.find(x=>x.person===person&&x.period===period)||null,
    original:original?{id:original.id,amount:original.amount,kind:original.kind}:null,
    reversals:original?s.tx.filter(t=>t.reverses===original.id).map(t=>t.id):[],
  });
}

export function makePayment(s:State,input:PaymentInput,id:string,receipt:string):Tx {
  let p={...input},amount=paise(p.amount);
  if(amount<=0)throw Error('Amount must be greater than zero.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||Number.isNaN(new Date(p.date).getTime())||new Date(p.date).toISOString().slice(0,10)!==p.date)throw Error('Choose a valid payment date.');
  if(!['fee','salary','income','expense','transfer','reversal'].includes(p.kind))throw Error('Invalid transaction type.');
  let kind=p.kind,reverses='';let allocation:Tx['feeAllocation'];
  if(kind==='reversal'){
    const original=s.tx.find(t=>t.id===p.original);
    if(!original||original.reverses||refundable(s,original)<=0)throw Error('This transaction has already been reversed or cannot be reversed.');
    if(!p.notes?.trim())throw Error('A reversal reason is required.');
    if(amount>refundable(s,original))throw Error('Refund exceeds the remaining refundable amount.');
    if(original.kind==='transfer'&&amount!==original.amount)throw Error('Transfers must be reversed in full.');
    kind=original.kind;amount=-amount;reverses=original.id;
    p={...original,date:p.date,notes:p.notes};
  }
  if(!s.accounts.some(a=>a.id===p.account))throw Error('Choose a valid payment account.');
  if(kind==='fee'){
    const student=s.students.find(x=>x.id===p.person);
    if(!student)throw Error('Choose a student.');
    if(reverses){
      const original=p.feeAllocation||{tuition:p.amount,transport:0};
      const previous=s.tx.filter(t=>t.reverses===reverses);
      const remaining={tuition:original.tuition+previous.reduce((a,t)=>a+(t.feeAllocation?.tuition??t.amount),0),transport:original.transport+previous.reduce((a,t)=>a+(t.feeAllocation?.transport??0),0)};
      const transport=input.transportAmount===undefined?Math.min(-amount,remaining.transport):paise(input.transportAmount||'0');
      const tuition=-amount-transport;
      if(tuition<0||tuition>remaining.tuition||transport>remaining.transport)throw Error('Refund portions exceed the remaining tuition or transport payment.');
      allocation={tuition:-tuition,transport:-transport};
    }
    else{
      const tuition=paise(p.tuitionAmount??p.amount),transport=paise(p.transportAmount??'0');
      if(tuition+transport!==amount)throw Error('Tuition and transport portions must add up to the total payment.');
      if(transport>0&&!student.transport?.charges.length)throw Error('No transport fee is assigned to this student.');
      if(transport>componentDue(s,student,'transport')&&!student.transport?.enabled)throw Error('Transport advances require an active transport plan.');
      if(p.advance!==true&&(tuition>componentDue(s,student,'tuition')||transport>componentDue(s,student,'transport')))throw Error('A fee portion exceeds its remaining due. Allocate to the correct fee or explicitly record excess as student advance.');
      allocation={tuition,transport};
    }

  }
  if(kind==='salary'&&!reverses){
    const rec=s.salaries.find(x=>x.person===p.person&&x.period===p.period);
    if(!rec)throw Error('Create this month’s salary record first while online.');
    if(paid(s,p.person,'salary',p.period)+amount>rec.amount+rec.adjustment)throw Error('Payment exceeds salary remaining due.');
  }
  if(kind==='transfer'&&(!s.accounts.some(a=>a.id===p.to)||p.to===p.account))throw Error('Choose a different destination account.');
  if(kind==='transfer'&&reverses&&balance(s,p.to)<-amount)throw Error('Insufficient destination balance to reverse this transfer.');
  const debit=['expense','salary','transfer'].includes(kind)?amount:-amount;
  if(debit>balance(s,p.account))throw Error('Insufficient account balance.');
  return {id,kind,person:p.person||'',period:p.period||'',date:p.date,amount,account:p.account,to:p.to||'',category:kind==='fee'?(allocation?.transport?allocation.tuition?'Tuition + transport':'Transport fee':'Tuition fee'):p.category||kind,method:p.method||'Bank transfer',reference:p.reference||'',notes:p.notes||'',receipt,...(allocation?{feeAllocation:allocation}:{}),...(reverses?{reverses}:{})};
}
