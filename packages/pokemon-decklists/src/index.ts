import type { PluginDescriptor } from "emdash";

const VERSION = "0.3.0";

export function pokemonDecklistsPlugin(): PluginDescriptor {
	return {
		id: "pokemon-decklists",
		version: VERSION,
		format: "standard",
		entrypoint: "@tcg-emdash/plugin-pokemon-decklists/sandbox",
		options: {},
		capabilities: ["network:request"],
		allowedHosts: ["api.tcgdex.net", "pokeapi.co"],
		storage: {
			archetypes: { indexes: ["name", "updatedAt"] },
			decks: { indexes: ["archetypeId", "format", "createdAt"] },
			matches: { indexes: ["deckId", "playedAt", "result", "visibility"] },
		},
		adminPages: [
			{ path: "/decks", label: "Decklists Pokémon", icon: "list" },
			{ path: "/archetypes", label: "Arquetipos Pokémon", icon: "list" },
		],
	};
}

export type * from "./domain.js";
export { parsePokemonDecklist, serializePokemonDecklist } from "./parser.js";
export { chooseBasicPrinting, functionalFingerprint } from "./normalizer.js";
export { buildPokemonSpriteUrl, DEFAULT_SPRITE_BASE_URL } from "./sprites.js";
