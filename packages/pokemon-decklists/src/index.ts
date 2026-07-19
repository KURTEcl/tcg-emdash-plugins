import type { PluginDescriptor } from "emdash";

const VERSION = "0.6.0";

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
			{ path: "/cards", label: "Buscar cartas", icon: "search" },
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
		}, {
			type: "pokemonArchetypeDecklists",
			label: "Decklists del arquetipo",
			icon: "list",
			description: "Tabla con todas las listas creadas para un arquetipo.",
			category: "TCG",
			fields: [
				{ type: "select", action_id: "archetypeId", label: "Arquetipo", options: [], optionsRoute: "archetype-options" },
				{ type: "toggle", action_id: "showCards", label: "Mostrar diferencias de cartas", initial_value: true },
			],
		}, {
			type: "pokemonCard",
			label: "Carta Pokémon",
			icon: "image",
			description: "Inserta la imagen de una carta usando nombre, colección y número.",
			category: "TCG",
			fields: [
				{ type: "select", action_id: "cardId", label: "Carta (resultados de la última búsqueda)", options: [], optionsRoute: "card-options" },
				{ type: "text_input", action_id: "name", label: "Nombre alternativo", placeholder: "Sólo si la carta no está en los resultados recientes" },
				{ type: "text_input", action_id: "setCode", label: "Colección", placeholder: "JTG" },
				{ type: "text_input", action_id: "collectorNumber", label: "Número", placeholder: "98" },
				{ type: "text_input", action_id: "caption", label: "Pie de imagen (opcional)" },
				{ type: "select", action_id: "size", label: "Tamaño", options: [{ label: "Pequeña", value: "small" }, { label: "Mediana", value: "medium" }, { label: "Grande", value: "large" }], initial_value: "medium" },
			],
		}],
	};
}

export type * from "./domain.js";
export { parsePokemonDecklist, serializePokemonDecklist } from "./parser.js";
export { chooseBasicPrinting, functionalFingerprint } from "./normalizer.js";
export { buildPokemonSpriteUrl, DEFAULT_SPRITE_BASE_URL } from "./sprites.js";
