import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {createLedgerHandlers} from '../../../server/ledger-handlers';
export const dynamic='force-dynamic';
export const GET=()=>createLedgerHandlers({DB:env.DB!,AUTH_PROVIDER:env.AUTH_PROVIDER,BOOTSTRAP_ADMIN_EMAIL:env.BOOTSTRAP_ADMIN_EMAIL},getChatGPTUser).GET();
export const POST=(req:Request)=>createLedgerHandlers({DB:env.DB!,AUTH_PROVIDER:env.AUTH_PROVIDER,BOOTSTRAP_ADMIN_EMAIL:env.BOOTSTRAP_ADMIN_EMAIL},getChatGPTUser).POST(req);
