import { AsyncLocalStorage } from 'node:async_hooks';

// Carries per-request facts that are inconvenient to thread through every
// server function call (history.ts records them on todoEvents without every
// caller needing to know or pass them along).
interface RequestContext {
	/** True when the request authenticated with an API key rather than a session cookie. */
	isAiAgent: boolean;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
	return als.run(ctx, fn);
}

export function isAiRequest(): boolean {
	return als.getStore()?.isAiAgent ?? false;
}
