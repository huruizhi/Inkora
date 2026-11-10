import {defineConfig} from 'vite';
export default defineConfig({build:{outDir:'../artifacts/INK-UX-142/web',emptyOutDir:true,rollupOptions:{input:'artifacts/INK-UX-142/probe.ts',output:{format:'iife',entryFileNames:'probe.js'}}}});
