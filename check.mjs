// Post-hydration probe for every variant.
//   pnpm install                      # playwright is a declared devDependency
//   node server.mjs &                 # http://localhost:45810 (PORT overrides)
//   node check.mjs                    # probes every ?variant=…
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.env.PORT || 45810;
const variants = [
	['SUBJECT   spread + href + onClick, children via spread', 'subject'],
	['(1)       spread only, nothing after', 'spread-only'],
	['(2)       spread + explicit href after', 'spread-href'],
	['(3)       spread + onClick after', 'spread-onclick'],
	['(4)       spread + href + onClick, explicit {props.children}', 'spread-explicit-children'],
	['(5)       CONTROL: no spread', 'control'],
	['(6)       subject shape, NO children', 'childless'],
	["(7)       spread of omit(props, 'children'), explicit {props.children}", 'split-children'],
];

// The server-rendered `_hk` for every <a>/<span>/<svg> in document order, from the raw SSR HTML.
function hkSequence(html) {
	const out = [];
	for (const m of html.matchAll(/<(a|span|svg|pre|nav)\b[^>]*?_hk=("?)([^\s">]+)\2/g))
		out.push(`${m[1]}=${m[3]}`);
	return out;
}

const browser = await chromium.launch();
const rows = [];
for (const [label, variant] of variants) {
	const url = `http://localhost:${port}/?variant=${variant}`;
	const html = await (await fetch(url)).text();
	if (variant === 'subject') writeFileSync(new URL('./served.html', import.meta.url), html);
	const page = await browser.newPage();
	const messages = [];
	page.on('console', (m) => {
		if (m.type() !== 'log') messages.push(`[${m.type()}] ${m.text()}`);
	});
	page.on('pageerror', (e) => messages.push(`[pageerror] ${String(e)}`));
	await page.goto(url, { waitUntil: 'load' });
	await page.waitForTimeout(600);
	// Vite can push a reload into the first page that connects (dep discovery), which re-runs
	// hydration and double-counts. Reload once and count only what the clean second load logs.
	messages.length = 0;
	await page.reload({ waitUntil: 'load' });
	await page.waitForTimeout(600);
	// Dispatch rather than page.click(): when hydration misfires the server's anchors can end up
	// EMPTY (their children claimed by the wrong client node), and Playwright refuses to click an
	// invisible element. A dispatched click still bubbles to the delegated handler if one is live.
	const clicked = await page.evaluate(() => {
		const out = [];
		for (const id of ['two', 'prev']) {
			const el = document.getElementById(id);
			out.push(
				el
					? `${id}:<${el.tagName.toLowerCase()} _hk=${el.getAttribute('_hk')}>` +
							el.innerHTML.slice(0, 40)
					: `${id}:missing`,
			);
			el?.click();
		}
		return out;
	});
	await page.waitForTimeout(300);
	const after = await page.evaluate(() => document.getElementById('after')?.textContent);
	const hydration = messages.filter((m) => /ydration/.test(m));
	const other = messages.filter((m) => !/ydration/.test(m) && !/\[vite\]/.test(m));
	const live = after === 'count: 2';
	console.log(`--- ${label}  (?variant=${variant})`);
	console.log(`  server _hk: ${hkSequence(html).join(' ')}`);
	console.log(`  clicked: ${clicked.join('  ')}`);
	console.log(`  after clicks: ${JSON.stringify(after)}  click live: ${live}`);
	console.log(
		`  hydration messages: ${hydration.length}` +
			(other.length ? `  OTHER console/page errors: ${other.length}` : ''),
	);
	for (const m of other.slice(0, 2)) console.log(`    !! ${m.slice(0, 200)}`);
	for (const m of hydration.slice(0, 4)) console.log(`    ${m.slice(0, 200)}`);
	if (process.env.VERBOSE)
		for (const m of hydration.slice(4)) console.log(`    ${m.slice(0, 200)}`);
	rows.push({ variant, warnings: hydration.length, live });
	await page.close();
}
await browser.close();
console.log('\nsummary:');
for (const r of rows)
	console.log(`  ${r.variant.padEnd(26)} warnings=${r.warnings}  click live=${r.live}`);
// At runtime rc.7 (compiler rc.7): every spread-with-children variant reports 7 hydration messages,
// REACTIVITY_HALTED, and dead anchors; control / childless / split-children are clean and live.
// At runtime rc.6 (same compiler): all eight variants are clean and live.
