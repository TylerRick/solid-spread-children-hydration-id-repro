import { generateHydrationScript, renderToStream } from '@solidjs/web';
import App from './App';

export async function render(variant: string): Promise<string> {
	const stream = renderToStream(() => <App variant={variant} />);
	const chunks: string[] = [];
	const decoder = new TextDecoder();
	await stream.pipeTo(
		new WritableStream({
			write(chunk) {
				chunks.push(typeof chunk === 'string' ? chunk : decoder.decode(chunk));
			},
		}),
	);
	const variants = [
		'subject',
		'spread-only',
		'spread-href',
		'spread-onclick',
		'spread-explicit-children',
		'control',
		'childless',
		'split-children',
	];
	const links = variants
		.map((v) => (v === variant ? `<strong>${v}</strong>` : `<a href="/?variant=${v}">${v}</a>`))
		.join(' · ');
	// Everything outside #root is static chrome for a human reader. It is NOT part of the hydrated
	// tree, so it cannot change the hydration ids the repro is about.
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>solid2 spread+children hydration id skew repro (${variant})</title>
<style>
	body { font: 15px/1.5 system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; color: #222; }
	h1 { font-size: 1.2rem; margin: 0 0 .25rem; }
	.explain { color: #555; margin: 0 0 1.25rem; }
	.explain code { background: #f2f2f2; padding: 0 .25em; border-radius: 3px; }
	.variants { font-size: .9rem; margin-bottom: 1.5rem; }
	#root { border: 1px solid #ddd; border-radius: 8px; padding: 1.25rem; background: #fafafa; }
	#nav { display: flex; align-items: center; gap: .5rem; }
	.step { display: inline-flex; align-items: center; padding: .4rem .9rem; border: 1px solid #888; border-radius: 999px; text-decoration: none; color: #222; background: #fff; }
	.step.current { background: #2a5bd7; border-color: #2a5bd7; color: #fff; cursor: default; }
	.step.nav-arrow { width: 2.25rem; height: 2.25rem; padding: 0; justify-content: center; }
	.step svg { width: 1.25rem; height: 1.25rem; }
	#after { margin: 1rem 0 0; font-size: 1rem; }
</style>
${generateHydrationScript()}
</head>
<body>
<h1>Spread props carrying <code>children</code> skip an SSR hydration id (solid 2.0.0-rc.7)</h1>
<p class="explain">
	The box below is server-rendered and then hydrated. Its three pills are one wrapper component
	rendered three times — variant <code>${variant}</code>. <strong>Open the devtools console</strong>:
	at solid rc.7 the spread variants log <code>Hydration key miss</code> / <code>Hydration tag mismatch</code>
	warnings and a <code>REACTIVITY_HALTED</code> error; the controls log nothing. Then <strong>click
	“Details” and the ‹ arrow</strong>: each click should add 1 to the counter. When the anchors have
	hydrated onto the wrong nodes, the counter stays at 0 (and the click falls through to the plain
	<code>href</code>). On the broken variants the “Details” pill also renders <em>empty</em>: its
	server-rendered child was claimed by the wrong client node and moved.
</p>
<p class="variants">Variants: ${links}</p>
<div id="root">${chunks.join('')}</div>
<script type="module" src="/src/entry-client.tsx"></script>
</body>
</html>`;
}
