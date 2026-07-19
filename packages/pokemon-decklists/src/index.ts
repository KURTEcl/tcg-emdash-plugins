import type { PluginDescriptor } from "emdash";

const VERSION = "0.5.0";

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
			tournaments: { indexes: ["deckId", "playedAt", "visibility", "createdAt"] },
		},
		adminPages: [
			{ path: "/decks", label: "Decklists Pokémon", icon: "list" },
			{ path: "/archetypes", label: "Arquetipos Pokémon", icon: "list" },
			{ path: "/results", label: "Resultados Pokémon", icon: "chart" },
		],
		portableTextBlocks: [{
			type: "pokemonDecklist",
			label: "Decklist Pokémon",
			icon: "list",
			description: "Inserta una lista con cartas, texto para copiar y resultados propios.",
			category: "TCG",
			fields: [
				{ type: "select", action_id: "deckId", label: "Decklist", options: [], optionsRoute: "deck-options" },
				{ type: "select", action_id: "displayMode", label: "Vista", options: [{ label: "Imágenes y texto", value: "both" }, { label: "Solo imágenes", value: "images" }, { label: "Solo texto", value: "text" }], initial_value: "both" },
				{ type: "toggle", action_id: "showResults", label: "Mostrar resultados públicos", description: "Incluye estadísticas y partidas recientes de esta lista.", initial_value: true },
			],
		}],
	};
}

export type * from "./domain.js";
export { parsePokemonDecklist, serializePokemonDecklist } from "./parser.js";
export { chooseBasicPrinting, functionalFingerprint } from "./normalizer.js";
export { buildPokemonSpriteUrl, DEFAULT_SPRITE_BASE_URL } from "./sprites.js";
