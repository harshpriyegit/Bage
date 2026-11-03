import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// changeOrigin:false keeps the browser's Host (e.g. localhost:5173) so the API's same-origin check matches the Origin header.
export default defineConfig({plugins:[react()],server:{proxy:{'/api':{target:'http://localhost:3001',changeOrigin:false}}}});
