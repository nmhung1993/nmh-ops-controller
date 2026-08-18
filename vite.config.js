const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
const path = require('node:path');

module.exports = defineConfig({
  root: 'frontend',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'public'),
    emptyOutDir: true,
    sourcemap: false
  }
});