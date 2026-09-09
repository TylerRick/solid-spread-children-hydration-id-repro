import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
	plugins: [solid({ ssr: true })],
	server: { port: 45810, strictPort: true },
});
