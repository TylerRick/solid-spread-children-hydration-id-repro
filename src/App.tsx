import { createContext, createSignal, omit, useContext, type JSX } from 'solid-js';

// SUBJECT: a wrapper component that SPREADS its props onto an <a> and renders its children through
// that spread — `<a {...props} href={props.href} onClick={…} />` — used three times in a row, each
// with an element child (<span>, <span>, <svg>). That is the StepLink wrapper this was found in. Under SSR + hydrate at
// 2.0.0-rc.7 the server skips one hydration id per spread-built anchor-with-children, the client
// numbers them contiguously, and every anchor after the first hydrates onto the wrong node (or a
// detached one) — so the delegated click handler is never live and clicks fall through.
//
// The `variant` query param picks one of the StepLink implementations below so the trigger can be
// isolated; `control` is the same three anchors with no spread at all. The SERVER is the side that
// skips: rc.7's `ssrElement` reads `props[prop]` into a local BEFORE the `ChildProperties` early
// `continue`, so the compiled `get children()` getter runs twice — the first result is discarded,
// but building it already spent a hydration id. `omit(props, 'children')` (variant 7) avoids it.

type LinkProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
	href: string | undefined;
};

// The parent owns the counter; StepLink reaches it through context so the handler can live inside
// the wrapper (as in the original) without adding a non-DOM prop that the spread would forward.
const Bump = createContext<() => void>(() => {});

function useHandler() {
	const bump = useContext(Bump);
	return (event: MouseEvent) => {
		event.preventDefault();
		bump();
	};
}

// (subject) spread, then explicit href, then onClick — children ride along inside the spread.
function StepLinkSubject(props: LinkProps) {
	const onClick = useHandler();
	return <a {...props} href={props.href} onClick={onClick} />;
}

// (1) spread only — nothing after it. The caller passes href AND onClick in props.
function StepLinkSpreadOnly(props: LinkProps) {
	return <a {...props} />;
}

// (2) spread + explicit href after it. The caller passes onClick in props.
function StepLinkSpreadHref(props: LinkProps) {
	return <a {...props} href={props.href} />;
}

// (3) spread + onClick after it.
function StepLinkSpreadOnClick(props: LinkProps) {
	const onClick = useHandler();
	return <a {...props} onClick={onClick} />;
}

// (4) same as subject but children rendered EXPLICITLY rather than through the spread.
function StepLinkExplicitChildren(props: LinkProps) {
	const onClick = useHandler();
	return (
		<a {...props} href={props.href} onClick={onClick}>
			{props.children}
		</a>
	);
}

// (7) children OMITTED from the spread source (`omit(props, 'children')`), rendered explicitly.
function StepLinkSplitChildren(props: LinkProps) {
	const onClick = useHandler();
	const rest = omit(props, 'children');
	return (
		<a {...rest} href={props.href} onClick={onClick}>
			{props.children}
		</a>
	);
}

// (5) CONTROL — no spread at all.
function StepLinkControl(props: LinkProps) {
	const onClick = useHandler();
	return (
		<a id={props.id} href={props.href} class={props.class} onClick={onClick}>
			{props.children}
		</a>
	);
}

const implementations: Record<string, (props: LinkProps) => JSX.Element> = {
	subject: StepLinkSubject,
	'spread-only': StepLinkSpreadOnly,
	'spread-href': StepLinkSpreadHref,
	'spread-onclick': StepLinkSpreadOnClick,
	'spread-explicit-children': StepLinkExplicitChildren,
	'split-children': StepLinkSplitChildren,
	control: StepLinkControl,
};

export default function App(props: { variant: string }) {
	const [count, setCount] = createSignal(0);
	const StepLink = implementations[props.variant] ?? StepLinkSubject;
	// Variants (1) and (2) have no handler of their own; the caller supplies it through the spread.
	const callerOnClick = (event: MouseEvent) => {
		event.preventDefault();
		setCount((c) => c + 1);
	};
	const viaSpread = props.variant === 'spread-only' || props.variant === 'spread-href';
	const extra = viaSpread ? { onClick: callerOnClick } : {};
	// `childless`: the same three spread anchors with NO children at all.
	const childless = props.variant === 'childless';
	return (
		<Bump value={() => setCount((c) => c + 1)}>
			<nav id="nav">
				<StepLink
					{...extra}
					href={undefined}
					aria-disabled="true"
					tabindex={-1}
					class="step current"
					style={{ 'z-index': 1 }}
				>
					{childless ? null : <span class="label a">Overview</span>}
				</StepLink>
				<StepLink {...extra} id="two" href="#two" class="step">
					{childless ? null : <span class="label b">Details</span>}
				</StepLink>
				<StepLink
					{...extra}
					id="prev"
					role="button"
					aria-label="Previous Step"
					href="#prev"
					class="step nav-arrow"
					title="Previous Step"
				>
					{childless ? null : (
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 19l-7-7 7-7"
							/>
						</svg>
					)}
				</StepLink>
			</nav>
			<pre id="after">count: {String(count())}</pre>
		</Bump>
	);
}
