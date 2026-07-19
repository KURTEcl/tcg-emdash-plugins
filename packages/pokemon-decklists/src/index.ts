import type { PluginDescriptor } from "emdash";

const VERSION = "0.8.1";

export function pokemonDecklistsPlugin(): PluginDescriptor {
	return {
		id: "pokemon-decklists",
		version: VERSION,
		format: "native",
		entrypoint: "@tcg-emdash/plugin-pokemon-decklists/native",
		adminEntry: "@tcg-emdash/plugin-pokemon-decklists/admin",
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
			description: "Tabla con las listas del arquetipo (excluye la lista base).",
			category: "TCG",
			fields: [
				{ type: "select", action_id: "archetypeId", label: "Arquetipo", options: [], optionsRoute: "archetype-options" },
				{ type: "toggle", action_id: "showCards", label: "Mostrar diferencias de cartas", initial_value: true },
			],
		}, {
			type: "pokemonCard",
			label: "Carta Pokémon",
			icon: "image",
			description: "Busca e inserta una carta junto al contenido.",
			category: "TCG",
			fields: [
				{ type: "text_input", action_id: "cardId", label: "Carta seleccionada", placeholder: "tcg-card-picker-single" },
				{ type: "text_input", action_id: "caption", label: "Pie de imagen (opcional)" },
				{ type: "text_input", action_id: "description", label: "Texto junto a la carta (opcional)", multiline: true },
				{ type: "select", action_id: "size", label: "Tamaño", options: [{ label: "Pequeña", value: "small" }, { label: "Mediana", value: "medium" }, { label: "Grande", value: "large" }], initial_value: "medium" },
				{ type: "select", action_id: "alignment", label: "Alineación", options: [{ label: "Izquierda", value: "left" }, { label: "Centro", value: "center" }, { label: "Derecha", value: "right" }], initial_value: "left" },
			],
		}, {
			type: "pokemonCardGallery",
			label: "Galería de cartas Pokémon",
			icon: "image",
			description: "Muestra entre una y cuatro cartas con texto de apoyo.",
			category: "TCG",
			fields: [
				{ type: "text_input", action_id: "cardIds", label: "Cartas seleccionadas", placeholder: "tcg-card-picker-multiple" },
				{ type: "text_input", action_id: "description", label: "Texto de apoyo (opcional)", multiline: true },
				{ type: "select", action_id: "columns", label: "Cartas por fila", options: [{ label: "2 cartas", value: "2" }, { label: "3 cartas", value: "3" }, { label: "4 cartas", value: "4" }], initial_value: "4" },
				{ type: "select", action_id: "textPosition", label: "Posición del texto", options: [{ label: "Debajo", value: "below" }, { label: "A la derecha", value: "right" }], initial_value: "below" },
			],
		}],
	};
}

export type * from "./domain.js";
export { parsePokemonDecklist, serializePokemonDecklist } from "./parser.js";
export { chooseBasicPrinting, functionalFingerprint } from "./normalizer.js";
export { buildPokemonSpriteUrl, DEFAULT_SPRITE_BASE_URL } from "./sprites.js";
