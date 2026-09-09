import http from 'node:http';
import { createServer as createViteServer } from 'vite';

const vite = await createViteServer({
	configFile: './vite.config.mjs',
	server: { middlewareMode: true },
	appType: 'custom',
});

const server = http.createServer((req, res) => {
	vite.middlewares(req, res, async () => {
		try {
			const { render } = await vite.ssrLoadModule('/src/entry-server.tsx');
			const variant = new URL(req.url, 'http://x').searchParams.get('variant') || 'subject';
			const html = await render(variant);
			res.setHeader('content-type', 'text/html');
			res.end(html);
		} catch (e) {
			vite.ssrFixStacktrace(e);
			console.error(e);
			res.statusCode = 500;
			res.end(String(e && e.stack));
		}
	});
});
const port = Number(process.env.PORT) || 45810;
server.listen(port, () => console.log(`repro on http://localhost:${port}`));
