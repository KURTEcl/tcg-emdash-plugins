export type CardCategory = "pokemon" | "trainer" | "energy";
export type CardResolutionStatus = "pending" | "exact" | "basic-equivalent" | "manual" | "unresolved";

export interface CardPrinting {
	id?: string;
	name: string;
	setCode?: string;
	collectorNumber?: string;
	imageUrl?: string;
	rarity?: string;
}

export interface DeckCard {
	quantity: number;
	category: CardCategory;
	importedPrinting: CardPrinting;
	displayPrinting: CardPrinting;
	resolutionStatus: CardResolutionStatus;
}

export interface ArchetypePokemon {
	speciesId: number;
	/** PokeAPI sprite ID. Differs from speciesId for forms such as Mega Evolutions. */
	spriteId: number;
	name: string;
	form?: string;
	role: "primary" | "secondary" | "engine" | "support";
	order: number;
}

export interface Archetype {
	id: string;
	name: string;
	game: "pokemon";
	pokemon: ArchetypePokemon[];
	createdAt: string;
	updatedAt: string;
}

export interface Decklist {
	id: string;
	name: string;
	archetypeId: string;
	archetypeName: string;
	archetypePokemon: ArchetypePokemon[];
	format: "standard" | "expanded" | "glc" | "custom";
	language: string;
	source: "ptcgl" | "limitless" | "manual";
	/** Lista de referencia del arquetipo: no sale en catálogo ni en la tabla del arquetipo. */
	isArchetypeBase?: boolean;
	cards: DeckCard[];
	totalCards: number;
	createdAt: string;
	updatedAt: string;
}

/** Listas visibles en catálogo público y tablas de arquetipo. */
export function isCatalogDecklist(deck: Pick<Decklist, "isArchetypeBase">) {
	return !deck.isArchetypeBase;
}

export interface MatchResult {
	id: string;
	tournamentId?: string;
	deckId: string;
	deckRevisionId: string;
	playedAt: string;
	opponentArchetype?: string;
	opponentPokemon?: ArchetypePokemon[];
	result: "win" | "loss" | "draw";
	games?: Array<{ result: "win" | "loss" | "draw"; wentFirst?: boolean }>;
	specialOutcome?: "bye" | "no-show" | "intentional-draw";
	gamesWon?: number;
	gamesLost?: number;
	gamesDrawn?: number;
	wentFirst?: boolean;
	eventName?: string;
	round?: number;
	notes?: string;
	visibility: "public" | "private";
}

export interface TournamentResult {
	id: string;
	deckId: string;
	deckRevisionId: string;
	name: string;
	playedAt: string;
	endedAt?: string;
	category?: "league" | "challenge" | "cup" | "regional" | "international" | "online" | "casual" | "other";
	format?: Decklist["format"];
	placement?: string;
	notes?: string;
	visibility: "public" | "private";
	createdAt: string;
	updatedAt: string;
}

export interface ParsedDeck {
	cards: DeckCard[];
	totalCards: number;
	errors: Array<{ line: number; message: string; value: string }>;
}
