# Spreading props that carry `children` onto an element makes the SERVER skip one hydration id

> **Status at 2.0.0-rc.7 (2026-09-08): REPRODUCES — an rc.7 regression, clean at rc.6 with the same
> rc.7 compiler.** Pure `solid-js` + `@solidjs/web`, `renderToStream` on the server + `hydrate` on
> the client. No TanStack, no router, no solid-query, no `<For>`, no `<Show>`. The server at rc.7
> consumes one extra hydration id for every `<a {...props} />` whose props include `children`; the
> client numbers contiguously, so every element after the first such anchor hydrates onto the wrong
> node or a detached one. Filed as
> [solidjs/solid#3313](https://github.com/solidjs/solid/issues/3313).

A wrapper component that spreads its props onto an `<a>` — a `StepLink` —

```tsx
function StepLink(props) {
	return <a {...props} href={props.href} onClick={…} />;
}
```

used three times in a row, each with an element child (`<span>`, `<span>`, `<svg>`), followed by a
`<pre>` bound to a signal. That is the whole ingredient list.

## Run it

```sh
pnpm install --ignore-workspace # playwright is a declared devDependency — nothing is inherited
npx playwright install chromium # once, for the browser binary
node server.mjs                 # http://localhost:45810 (PORT overrides)
node check.mjs                  # probes every ?variant=…, writes served.html for the SUBJECT
```

`check.mjs` fetches each variant's raw SSR HTML (printing the server-side `_hk` for every
`<a>`/`<span>`/`<svg>`/`<pre>` in order), loads it in headless Chromium, reloads once (Vite pushes a
dep-discovery reload into the first page that connects, which would double-count), collects every
console line matching `/ydration/`, dispatches a click on the two anchors that have an `href`, and
reads the counter. `click live` means both delegated `onClick` handlers fired (`count: 2`). The
clicks are dispatched rather than `page.click()`ed because on the broken variants the server's
anchors end up EMPTY — their children were claimed by the wrong client node — and Playwright refuses
to click an invisible element.

Variants (`?variant=`; `subject` is the default):

| variant                    | StepLink body                                                             |
| -------------------------- | ------------------------------------------------------------------------- |
| `subject`                  | `<a {...props} href={props.href} onClick={h} />` — the original shape     |
| `spread-only`              | `<a {...props} />` (caller passes `href` and `onClick`)                   |
| `spread-href`              | `<a {...props} href={props.href} />` (caller passes `onClick`)            |
| `spread-onclick`           | `<a {...props} onClick={h} />`                                            |
| `spread-explicit-children` | `<a {...props} href={props.href} onClick={h}>{props.children}</a>`        |
| `control`                  | `<a id=… href=… class=… onClick={h}>{props.children}</a>` — no spread     |
| `childless`                | `subject`'s body, but the three anchors are used with NO children         |
| `split-children`           | `<a {...omit(props, 'children')} href=… onClick={h}>{props.children}</a>` |

## The evidence

Compiler held at `@solidjs/compiler` / `@solidjs/babel-plugin` 2.0.0-rc.7 in both runs; only
`solid-js` / `@solidjs/web` (and, for rc.6, an `@solidjs/signals` 2.0.0-rc.6 override — signals rc.7
removed exports the rc.6 web build imports) change between the two columns.

| variant                    | rc.6 warnings | rc.6 click live | rc.7 warnings | rc.7 click live |
| -------------------------- | ------------- | --------------- | ------------- | --------------- |
| `subject`                  | 0             | yes             | **7**         | **no**          |
| `spread-only`              | 0             | yes             | **7**         | **no**          |
| `spread-href`              | 0             | yes             | **7**         | **no**          |
| `spread-onclick`           | 0             | yes             | **7**         | **no**          |
| `spread-explicit-children` | 0             | yes             | **7**         | **no**          |
| `control` (no spread)      | 0             | yes             | 0             | yes             |
| `childless`                | 0             | yes             | 0             | yes             |
| `split-children`           | 0             | yes             | 0             | yes             |

The minimal trigger is `spread-only`: `<a {...props} />` with `children` among the spread props.
Nothing after the spread matters (`href`, `onClick`, neither, both — all identical), and rendering
the children explicitly as well (`spread-explicit-children`) does not help. Removing the children
(`childless`) or removing `children` from the spread SOURCE (`split-children`, via
`omit(props, 'children')`) makes it clean — which is also the workaround for an app that has to stay on rc.7.

### Which side skips: the server

The server-rendered `_hk` sequence for the SUBJECT, in document order. The client's expectation is
the same at both versions and matches the rc.6 server exactly:

```text
rc.6 server:  nav=000 a=001 span=002 a=003 span=004 a=005 svg=006 pre=007
rc.7 server:  nav=000 a=001 span=003 a=004 span=006 a=007 svg=009 pre=00a
client wants: nav=000 a=001 span=002 a=003 span=004 a=005 svg=006 pre=007
```

At rc.7 the server skips `002`, `005` and `008` — one id per spread-built anchor with children,
spent between the `<a>` and its child. The rc.7 SSR markup for the SUBJECT is in
[served.html](served.html):

```html
<a _hk="001" aria-disabled="true" tabindex="-1" class="step current" style="…"
	><span _hk="003" class="label a">Overview</span></a
>
<a _hk="004" id="two" class="step" href="#two"><span _hk="006" class="label b">Details</span></a>
<a _hk="007" id="prev" role="button" … href="#prev"><svg _hk="009" class="h-5 w-5" …>…</svg></a>
<pre _hk="00a" id="after">count: <!--$-->0<!--/--></pre>
```

The client, numbering contiguously, logs:

```text
Hydration key miss for "002": no server-rendered element carries this key (template: <span class="label a">Overview). A detached element was created instead …
Hydration tag mismatch for key "003": expected <a> but found [span]
Hydration tag mismatch for key "004": expected <span> but found [a]
Hydration key miss for "005": … (template: <a>) …
Hydration tag mismatch for key "006": expected <svg> but found [span]
Hydration tag mismatch for key "007": expected <pre> but found [a]
Hydration completed with 2 unclaimed server-rendered node(s): <svg _hk="009" …>, <pre _hk="00a" …>
```

and then crashes:
`[REACTIVITY_HALTED] … TypeError: Cannot read properties of null (reading 'nextSibling')`. So the
consequence is worse than a dead anchor — the whole client reactive system halts, and `count` never
advances even if some handler were live.

For `spread-explicit-children` the same skip shows up one level down: rc.6 gives the explicit child
a nested id `0020` (as `control` does), rc.7 gives `0030` — the getter in the spread was still
evaluated once, spending `002`, before the explicit children were rendered under `003`.

### Where it comes from

Diffing `@solidjs/web/dist/server.js` between rc.6 and rc.7, `ssrElement` changed from

```js
const prop = keys[i];
if (ChildProperties.has(prop)) { … children = escape(props[prop]) …; continue; }
const value = props[prop];
```

to

```js
const prop = keys[i];
const value = props[prop];          // ← now read BEFORE the ChildProperties early-continue
if (tag === "textarea" && (prop === "value" || prop === "defaultValue")) { … continue; }
if (ChildProperties.has(prop)) { … children = escape(props[prop]) …; continue; }
```

The hoist was made to add the `<textarea value>` handling, but it means `props.children` is now read
twice per spread. The compiler emits `children` as a getter (`get children() { return <span…/> }`),
and each evaluation builds the element — which calls `ssrHydrationKey()`. The first evaluation's
result is discarded; its hydration id is not. That is the skipped `002`.

## To re-run the rc.6 control

Set `solid-js` and `@solidjs/web` to `2.0.0-rc.6` in [package.json](package.json), add
`"@solidjs/signals": "2.0.0-rc.6"` to `pnpm.overrides` (leave the compiler and babel-plugin
overrides at rc.7 so only the runtime moves), `pnpm install --ignore-workspace`, restart
`server.mjs`, and repeat. `@solidjs/vite-plugin` 3.0.0-next.40 accepted the rc.6 peers without
complaint.

## Where it was found

In a TanStack Solid Start app whose step navigation uses exactly this wrapper: upgrading the
runtime from rc.6 to rc.7 (compiler rc.7 on runtime rc.6 was clean) produced `Hydration key miss`
warnings on those anchors with the server's `_hk` jumping by one, and clicks on them doing a full
document navigation instead of a router navigation. Reduced here to the spread alone.
