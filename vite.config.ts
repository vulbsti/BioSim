import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
const path=(relative:string)=>fileURLToPath(new URL(relative,import.meta.url));
export default defineConfig({root:path('./web'),publicDir:path('./public'),plugins:[react()],resolve:{alias:{'@':path('./')}},server:{watch:{usePolling:true},proxy:{'/api':'http://localhost:3020'}},build:{outDir:path('./dist'),emptyOutDir:true,rollupOptions:{input:{main:path('./web/index.html'),intake:path('./web/intake/index.html')}}}});
