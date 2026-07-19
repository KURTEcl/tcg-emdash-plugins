import plugin from "./sandbox-entry.js";
import { pokemonDecklistsPlugin } from "./index.js";

export function createPlugin() {
	const descriptor = pokemonDecklistsPlugin();
	const routes = Object.fromEntries(Object.entries((plugin as any).routes ?? {}).map(([name, route]: [string, any]) => [name, {
		...route,
		handler: async (ctx: any) => route.handler({ input: ctx.input, request: ctx.request }, ctx),
	}]));
	return {
		...(plugin as any),
		capabilities: descriptor.capabilities,
		allowedHosts: descriptor.allowedHosts,
		storage: descriptor.storage,
		routes,
		admin: {
			...(plugin as any).admin,
			entry: descriptor.adminEntry,
			pages: descriptor.adminPages,
			portableTextBlocks: descriptor.portableTextBlocks,
		},
	};
}
