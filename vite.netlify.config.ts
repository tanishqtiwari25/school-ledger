import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({root:'netlify-client',publicDir:resolve('public'),plugins:[react()],build:{outDir:resolve('dist/netlify'),emptyOutDir:true}});
