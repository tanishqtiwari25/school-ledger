import type {UserValidateEvent} from '@netlify/functions';
import {getDatabase} from '@netlify/database';
import {accessRole} from '../../app/access-role';
import {seed} from '../../app/ledger';
export default {
 async userValidate(event:UserValidateEvent){
  try{
   const email=event.user.email?.trim().toLowerCase();
   if(!email)return event.deny();
   const row=await getDatabase().pool.query('SELECT data FROM ledger WHERE id=$1',['school']);
   const state=row.rows.length?JSON.parse(row.rows[0].data):seed();
   if(!accessRole(state,email,'netlify-identity',process.env.BOOTSTRAP_ADMIN_EMAIL))return event.deny();
  }catch{return event.deny();}
 }
};
