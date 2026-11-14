import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {createBackupHandlers} from '../../../server/backups-handlers';
export const dynamic='force-dynamic';
export const GET=(req:Request)=>createBackupHandlers({DB:env.DB!,AUTH_PROVIDER:env.AUTH_PROVIDER,BOOTSTRAP_ADMIN_EMAIL:env.BOOTSTRAP_ADMIN_EMAIL},getChatGPTUser).GET(req);
