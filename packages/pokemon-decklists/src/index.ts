import type { PluginDescriptor } from "emdash";

const VERSION = "0.1.0";

export function pokemonDecklistsPlugin(): PluginDescriptor {
	return {
		id: "pokemon-decklists",
		version: VERSION,
		format: "standard",
		entrypoint: "@tcg-emdash/plugin-pokemon-decklists/sandbox",
		options: {},
		capabilities: ["network:request"],
		allowedHosts: ["api.tcgdex.net"],
		storage: {
			decks: { indexes: ["archetypeId", "format", "createdAt"] },
			matches: { indexes: ["deckId", "playedAt", "result", "visibility"] },
		},
		adminPages: [{ path: "/decks", label: "Decklists Pokémon", icon: "list" }],
	};
}

export type * from "./domain.js";
export { parsePokemonDecklist, serializePokemonDecklist } from "./parser.js";
export { chooseBasicPrinting, functionalFingerprint } from "./normalizer.js";
