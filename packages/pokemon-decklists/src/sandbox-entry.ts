import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import type { Archetype, ArchetypePokemon, DeckCard, Decklist, MatchResult, TournamentResult } from "./domain.js";
import { parsePokemonDecklist, serializePokemonDecklist } from "./parser.js";
import { getArchetypePokemon, listPokemonOptions, type PokemonOption } from "./pokeapi.js";
import { DEFAULT_SPRITE_BASE_URL } from "./sprites.js";
import { getCard, isBasicEnergy, resolveBasicPrinting, searchCardCatalog, searchCards } from "./tcgdex.js";
import { matchStats, roundResult } from "./results.js";

const VERSION = "0.6.0";
const tournamentCategories = [
	{ label: "Liga", value: "league" }, { label: "League Challenge", value: "challenge" }, { label: "League Cup", value: "cup" },
	{ label: "Regional", value: "regional" }, { label: "Internacional", value: "international" }, { label: "Online", value: "online" },
	{ label: "Casual", value: "casual" }, { label: "Otro", value: "other" },
];

export default definePlugin({
	id: "pokemon-decklists",
	version: VERSION,
	capabilities: ["network:request"],
	admin: {
		settingsSchema: {
			cardLanguage: { type: "select", label: "Idioma del catálogo", options: [{ value: "en", label: "English" }, { value: "es", label: "Español" }], default: "en" },
			spriteBaseUrl: { type: "string", label: "URL base de sprites", default: DEFAULT_SPRITE_BASE_URL },
		},
	},
	routes: {
		admin: {
			handler: async (routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const interaction = asInteraction(routeCtx.input);
				if (interaction.type === "form_submit") return handleForm(interaction, ctx);
				if (interaction.type === "block_action") return handleAction(interaction, ctx);
				if (interaction.page === "/archetypes") return renderArchetypes(ctx);
				if (interaction.page === "/results") return renderResults(ctx);
				if (interaction.page === "/cards") return renderCardSearch(ctx);
				return renderAdmin(ctx);
			},
		},
		"deck-options": {
			handler: async (_routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const result = await ctx.storage.decks!.query({ orderBy: { createdAt: "desc" }, limit: 100 });
				return { items: result.items.map((item) => { const deck = item.data as Decklist; return { id: deck.id, name: `${deck.name} · ${deck.archetypeName}` }; }) };
			},
		},
		"archetype-options": {
			handler: async (_routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const result = await ctx.storage.archetypes!.query({ orderBy: { name: "asc" }, limit: 200 });
				return { items: result.items.map((item) => { const archetype = item.data as Archetype; return { id: archetype.id, name: archetype.name }; }) };
			},
		},
		"card-options": {
			handler: async (_routeCtx: StandardRouteContext, ctx: PluginContext) => ({ items: (await ctx.kv.get<Array<{ id: string; name: string }>>("recent-card-options")) ?? [] }),
		},
		archetypes: {
			public: true,
			handler: async (_routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const result = await ctx.storage.archetypes!.query({ orderBy: { updatedAt: "desc" }, limit: 100 });
				return { items: result.items.map((item: { data: unknown }) => item.data) };
			},
		},
		decks: {
			public: true,
			handler: async (routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const url = new URL(routeCtx.request.url);
				const id = url.searchParams.get("id");
				if (id) return await ctx.storage.decks!.get(id);
				const result = await ctx.storage.decks!.query({ orderBy: { createdAt: "desc" }, limit: 100 });
				const archetypeId = url.searchParams.get("archetypeId");
				const items = result.items.map((item) => item.data as Decklist).filter((deck) => !archetypeId || deck.archetypeId === archetypeId);
				return { items, cursor: result.cursor, hasMore: result.hasMore };
			},
		},
		tournaments: {
			public: true,
			handler: async (_routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const result = await ctx.storage.tournaments!.query({ orderBy: { playedAt: "desc" }, limit: 200 });
				return { items: result.items.map((item) => item.data as TournamentResult).filter((tournament) => tournament.visibility === "public") };
			},
		},
		"cards/display": {
			public: true,
			handler: async (routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const url = new URL(routeCtx.request.url);
				const language = (await ctx.kv.get<string>("settings:cardLanguage")) ?? "en";
				const cardId = url.searchParams.get("id")?.trim();
				if (cardId) {
					const selected = await getCard((request, init) => ctx.http!.fetch(String(request), init), language, cardId);
					if (!selected) return { status: "unresolved" };
					const { pricing: _pricing, variants_detailed: _variantsDetailed, ...displayCard } = selected as typeof selected & { pricing?: unknown; variants_detailed?: unknown };
					return { status: "exact", selected: displayCard };
				}
				const name = url.searchParams.get("name")?.trim();
				if (!name) throw new Response("Nombre requerido", { status: 400 });
				return resolveBasicPrinting((request, init) => ctx.http!.fetch(String(request), init), language, name, url.searchParams.get("number") ?? undefined, url.searchParams.get("set") ?? undefined, url.searchParams.get("format") ?? "standard");
			},
		},
		"decks/text": {
			public: true,
			handler: async (routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const id = new URL(routeCtx.request.url).searchParams.get("id");
				if (!id) throw new Response("Deck ID requerido", { status: 400 });
				const deck = await ctx.storage.decks!.get(id) as Decklist | null;
				if (!deck) throw new Response("Decklist no encontrada", { status: 404 });
				return { id, text: serializePokemonDecklist(deck.cards) };
			},
		},
		matches: {
			public: true,
			handler: async (routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const deckId = new URL(routeCtx.request.url).searchParams.get("deckId");
				const result = await ctx.storage.matches!.query({ orderBy: { playedAt: "desc" }, limit: 200 });
				const items = result.items.map((item) => item.data as MatchResult).filter((match) => match.visibility === "public" && (!deckId || match.deckId === deckId));
				return { items, stats: matchStats(items) };
			},
		},
		"cards/search": {
			handler: async (routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const name = new URL(routeCtx.request.url).searchParams.get("name")?.trim();
				if (!name) return { items: [] };
				const language = (await ctx.kv.get<string>("settings:cardLanguage")) ?? "en";
				return { items: await searchCards((url, init) => ctx.http!.fetch(String(url), init), language, name) };
			},
		},
		"cards/resolve-basic": {
			handler: async (routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const url = new URL(routeCtx.request.url);
				const name = url.searchParams.get("name")?.trim();
				if (!name) throw new Response("Nombre requerido", { status: 400 });
				const language = (await ctx.kv.get<string>("settings:cardLanguage")) ?? "en";
				return resolveBasicPrinting((request, init) => ctx.http!.fetch(String(request), init), language, name, url.searchParams.get("number") ?? undefined, url.searchParams.get("set") ?? undefined, url.searchParams.get("format") ?? "standard");
			},
		},
	},
} as any);

interface StandardRouteContext { input: unknown; request: { url: string; method: string; headers: Record<string, string> } }
interface Interaction { type?: string; page?: string; action_id?: string; value?: string; values: Record<string, unknown> }

function asInteraction(input: unknown): Interaction {
	const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
	return { type: String(value.type ?? ""), page: String(value.page ?? ""), action_id: String(value.action_id ?? ""), value: value.value ? String(value.value) : undefined, values: (value.values as Record<string, unknown>) ?? {} };
}

async function handleForm(interaction: Interaction, ctx: PluginContext) {
	if (interaction.action_id === "save_archetype") return saveArchetype(interaction.values, ctx);
	if (interaction.action_id === "import_deck" || interaction.action_id === "update_deck") return saveDeck(interaction.action_id, interaction.values, ctx);
	if (interaction.action_id === "save_tournament") return saveTournament(interaction.values, ctx);
	if (interaction.action_id === "save_round") return saveRound(interaction.values, ctx);
	if (interaction.action_id === "search_cards") return renderCardSearch(ctx, optional(interaction.values.query));
	return renderAdmin(ctx);
}

async function handleAction(interaction: Interaction, ctx: PluginContext) {
	const id = interaction.value ?? String(interaction.values.id ?? "");
	if (interaction.action_id === "edit_deck") return renderDeckEditor(ctx, id);
	if (interaction.action_id === "duplicate_deck") {
		const deck = await ctx.storage.decks!.get(id) as Decklist | null;
		if (!deck) return renderAdmin(ctx, { error: "No se encontró el decklist" });
		const now = new Date().toISOString();
		const copy = { ...deck, id: crypto.randomUUID(), name: `${deck.name} (copia)`, createdAt: now, updatedAt: now };
		await ctx.storage.decks!.put(copy.id, copy);
		return renderAdmin(ctx, { message: "Decklist duplicado" });
	}
	if (interaction.action_id === "delete_deck") {
		await ctx.storage.decks!.delete(id);
		return renderAdmin(ctx, { message: "Decklist eliminado" });
	}
	if (interaction.action_id === "normalize_deck") {
		const deck = await ctx.storage.decks!.get(id) as Decklist | null;
		if (!deck) return renderAdmin(ctx, { error: "No se encontró el decklist" });
		const normalized = await normalizeDeck(deck, ctx);
		await ctx.storage.decks!.put(id, normalized.deck);
		return renderAdmin(ctx, { message: `${normalized.resolved} cartas visuales normalizadas; ${normalized.unresolved} pendientes` });
	}
	if (interaction.action_id === "delete_result") {
		await ctx.storage.matches!.delete(id);
		return renderResults(ctx, { message: "Resultado eliminado" });
	}
	if (interaction.action_id === "add_round") return renderRoundEditor(ctx, id);
	if (interaction.action_id === "edit_tournament") return renderTournamentEditor(ctx, id);
	if (interaction.action_id === "edit_round") {
		const round = await ctx.storage.matches!.get(id) as MatchResult | null;
		return round?.tournamentId ? renderRoundEditor(ctx, round.tournamentId, round) : renderResults(ctx, { error: "No se encontró la ronda" });
	}
	if (interaction.action_id === "delete_tournament") {
		const rounds = await listRounds(ctx);
		await Promise.all(rounds.filter((round) => round.tournamentId === id).map((round) => ctx.storage.matches!.delete(round.id)));
		await ctx.storage.tournaments!.delete(id);
		return renderResults(ctx, { message: "Torneo y sus rondas eliminados" });
	}
	return renderAdmin(ctx);
}

async function saveArchetype(values: Record<string, unknown>, ctx: PluginContext) {
	const name = String(values.name ?? "").trim();
	const pokemon = await resolveArchetypePokemon(values, ctx);
	if (!name || !pokemon.length) return renderArchetypes(ctx, { error: "Indica un nombre y al menos un Pokémon válido" });
	const id = slugify(name);
	const existing = await ctx.storage.archetypes!.get(id) as Archetype | null;
	const now = new Date().toISOString();
	await ctx.storage.archetypes!.put(id, { id, name, game: "pokemon", pokemon, createdAt: existing?.createdAt ?? now, updatedAt: now });
	return renderArchetypes(ctx, { message: `Arquetipo ${name} guardado` });
}

async function saveDeck(action: string, values: Record<string, unknown>, ctx: PluginContext) {
	const parsed = parsePokemonDecklist(String(values.deckText ?? ""));
	if (!parsed.cards.length || parsed.errors.length) return renderAdmin(ctx, { error: parsed.errors[0]?.message ?? "La lista está vacía" });
	const archetype = await ctx.storage.archetypes!.get(String(values.archetypeId ?? "")) as Archetype | null;
	if (!archetype) return renderAdmin(ctx, { error: "Selecciona un arquetipo existente" });
	const existing = action === "update_deck" ? await ctx.storage.decks!.get(String(values.id ?? "")) as Decklist | null : null;
	const now = new Date().toISOString();
	const id = existing?.id ?? crypto.randomUUID();
	const deck: Decklist = { id, name: String(values.name ?? archetype.name).trim() || "Decklist", archetypeId: archetype.id, archetypeName: archetype.name, archetypePokemon: archetype.pokemon, format: asFormat(values.format), language: existing?.language ?? "en", source: existing?.source ?? "ptcgl", cards: reuseResolvedCards(parsed.cards, existing?.cards), totalCards: parsed.totalCards, createdAt: existing?.createdAt ?? now, updatedAt: now };
	const normalized = await normalizeDeck(deck, ctx);
	await ctx.storage.decks!.put(id, normalized.deck);
	return renderAdmin(ctx, { message: `${existing ? "Decklist actualizado" : "Lista guardada"} con ${deck.totalCards} cartas · ${normalized.resolved} imágenes listas${normalized.unresolved ? ` · ${normalized.unresolved} pendientes` : ""}` });
}

async function saveTournament(values: Record<string, unknown>, ctx: PluginContext) {
	const deckId = String(values.deckId ?? "");
	const deck = await ctx.storage.decks!.get(deckId) as Decklist | null;
	if (!deck) return renderResults(ctx, { error: "Selecciona un decklist" });
	const name = String(values.eventName ?? "").trim();
	const playedAt = String(values.playedAt ?? "").trim();
	if (!name || !playedAt) return renderResults(ctx, { error: "Indica el nombre y la fecha del torneo" });
	const existingId = optional(values.id);
	const existing = existingId ? await ctx.storage.tournaments!.get(existingId) as TournamentResult | null : null;
	const id = existing?.id ?? crypto.randomUUID();
	const now = new Date().toISOString();
	const tournament: TournamentResult = { id, deckId, deckRevisionId: deck.updatedAt, name, playedAt, endedAt: optional(values.endedAt), category: asTournamentCategory(values.category), format: asFormat(values.format), placement: optional(values.placement), notes: optional(values.notes), visibility: values.visibility === "private" ? "private" : "public", createdAt: existing?.createdAt ?? now, updatedAt: now };
	await ctx.storage.tournaments!.put(id, tournament);
	if (existing) {
		const rounds = await listRounds(ctx);
		await Promise.all(rounds.filter((round) => round.tournamentId === id).map((round) => ctx.storage.matches!.put(round.id, { ...round, deckId, deckRevisionId: deck.updatedAt, playedAt, eventName: name, visibility: tournament.visibility })));
		return renderResults(ctx, { message: "Torneo actualizado" });
	}
	return renderRoundEditor(ctx, id, undefined, { message: "Torneo creado; ahora registra la primera ronda" });
}

async function saveRound(values: Record<string, unknown>, ctx: PluginContext) {
	const tournamentId = String(values.tournamentId ?? "");
	const tournament = await ctx.storage.tournaments!.get(tournamentId) as TournamentResult | null;
	if (!tournament) return renderResults(ctx, { error: "No se encontró el torneo" });
	const round = Math.max(1, Number(values.round ?? 1));
	const existingId = optional(values.id);
	const rounds = await listRounds(ctx);
	if (rounds.some((item) => item.tournamentId === tournamentId && item.round === round && item.id !== existingId)) return renderRoundEditor(ctx, tournamentId, undefined, { error: `La ronda ${round} ya existe` });
	const specialOutcome = asSpecialOutcome(values.specialOutcome);
	const opponentPokemon = specialOutcome ? [] : await resolveOpponentPokemon(values, ctx);
	if (!specialOutcome && !opponentPokemon.length) return renderRoundEditor(ctx, tournamentId, undefined, { error: "Selecciona al menos un Pokémon del arquetipo rival" });
	const games = specialOutcome ? [] : [1, 2, 3].flatMap((game) => {
		const result = asGameResult(values[`game${game}Result`]);
		if (!result) return [];
		const order = String(values[`game${game}Order`] ?? "unknown");
		return [{ result, wentFirst: order === "first" ? true : order === "second" ? false : undefined }];
	});
	if (!specialOutcome && !games.length) return renderRoundEditor(ctx, tournamentId, undefined, { error: "Registra el resultado de al menos una partida" });
	const result = roundResult(games, specialOutcome);
	const id = existingId ?? crypto.randomUUID();
	const opponentArchetype = opponentPokemon.map((pokemon) => pokemon.name).join(" / ") || labelSpecialOutcome(specialOutcome);
	const match: MatchResult = { id, tournamentId, deckId: tournament.deckId, deckRevisionId: tournament.deckRevisionId, playedAt: tournament.playedAt, eventName: tournament.name, round, opponentArchetype, opponentPokemon, result, games, gamesWon: games.filter((game) => game.result === "win").length, gamesLost: games.filter((game) => game.result === "loss").length, gamesDrawn: games.filter((game) => game.result === "draw").length, specialOutcome, notes: optional(values.notes), visibility: tournament.visibility };
	await ctx.storage.matches!.put(id, match);
	return renderResults(ctx, { message: `Ronda ${round} guardada` });
}

async function renderAdmin(ctx: any, notice: Notice = {}) {
	const [result, archetypeResult] = await Promise.all([ctx.storage.decks.query({ orderBy: { createdAt: "desc" }, limit: 50 }), ctx.storage.archetypes.query({ orderBy: { updatedAt: "desc" }, limit: 100 })]);
	const archetypes = archetypeResult.items.map((item: { data: Archetype }) => item.data);
	const blocks: any[] = [{ type: "header", text: "Decklists Pokémon" }, { type: "section", text: "Importa listas desde Pokémon TCG Live o Limitless. Puedes editarlas desde el celular, duplicarlas y normalizar sus imágenes hacia impresiones básicas." }];
	addNotice(blocks, notice);
	if (!archetypes.length) blocks.push({ type: "banner", title: "Primero crea un arquetipo", description: "Abre Arquetipos Pokémon y selecciona uno o dos Pokémon.", variant: "alert" });
	else blocks.push(deckForm(archetypes, undefined, "import_deck"));
	for (const item of result.items as Array<{ data: Decklist }>) blocks.push(...deckCard(item.data));
	return response(blocks, notice);
}

async function renderDeckEditor(ctx: any, id: string) {
	const [deck, archetypeResult] = await Promise.all([ctx.storage.decks.get(id), ctx.storage.archetypes.query({ orderBy: { updatedAt: "desc" }, limit: 100 })]);
	if (!deck) return renderAdmin(ctx, { error: "No se encontró el decklist" });
	const archetypes = archetypeResult.items.map((item: { data: Archetype }) => item.data);
	return { blocks: [{ type: "header", text: `Editar: ${deck.name}` }, { type: "section", text: "Al guardar se conservan las imágenes existentes y se normalizan automáticamente las cartas nuevas. Sólo las energías básicas ignoran su edición; energías especiales y ACE SPEC mantienen su carta exacta." }, deckForm(archetypes, deck, "update_deck") ] };
}

function deckForm(archetypes: Archetype[], deck?: Decklist, action = "import_deck") {
	return { type: "form", block_id: deck ? `deck-edit-${deck.id}` : "deck-import", fields: [
		...(deck ? [{ type: "text_input", action_id: "id", label: "ID del decklist (no modificar)", initial_value: deck.id }] : []),
		{ type: "text_input", action_id: "name", label: "Nombre de esta lista", initial_value: deck?.name },
		{ type: "select", action_id: "archetypeId", label: "Arquetipo", options: archetypes.map((item) => ({ label: item.name, value: item.id })), initial_value: deck?.archetypeId },
		{ type: "select", action_id: "format", label: "Formato", options: [{ label: "Standard", value: "standard" }, { label: "Expanded", value: "expanded" }, { label: "GLC", value: "glc" }, { label: "Personalizado", value: "custom" }], initial_value: deck?.format ?? "standard" },
		{ type: "text_input", action_id: "deckText", label: "Lista exportada", multiline: true, initial_value: deck ? serializePokemonDecklist(deck.cards, true) : undefined },
	], submit: { label: deck ? "Guardar cambios" : "Importar lista", action_id: action } };
}

function deckCard(deck: Decklist) {
	return [{ type: "section", text: `**${deck.name}**\n${deck.archetypeName} · ${deck.format} · ${deck.totalCards} cartas` }, { type: "actions", elements: [
		{ type: "button", action_id: "edit_deck", label: "Editar", value: deck.id },
		{ type: "button", action_id: "normalize_deck", label: "Normalizar imágenes", value: deck.id },
		{ type: "button", action_id: "duplicate_deck", label: "Duplicar", value: deck.id },
		{ type: "button", action_id: "delete_deck", label: "Eliminar", style: "danger", value: deck.id, confirm: { title: "Eliminar decklist", text: "Esta acción no elimina el artículo que lo use.", confirm: "Eliminar", deny: "Cancelar" } },
	] }];
}

async function renderArchetypes(ctx: any, notice: Notice = {}) {
	const [result, pokemonOptions] = await Promise.all([ctx.storage.archetypes.query({ orderBy: { updatedAt: "desc" }, limit: 100 }), getCachedPokemonOptions(ctx)]);
	const blocks: any[] = [{ type: "header", text: "Arquetipos Pokémon" }, { type: "section", text: "Busca Pokémon por nombre; incluye especies, formas regionales y Mega Evoluciones. Puedes usar uno o dos Pokémon por arquetipo." }];
	addNotice(blocks, notice);
	blocks.push({ type: "form", block_id: "archetype-form", fields: [
		{ type: "text_input", action_id: "name", label: "Nombre del arquetipo", placeholder: "N's Zoroark / Munkidori" },
		{ type: "combobox", action_id: "primaryPokemon", label: "Pokémon principal", placeholder: "Buscar Zoroark, Charizard, Mega…", options: pokemonOptions },
		{ type: "combobox", action_id: "secondaryPokemon", label: "Segundo Pokémon (opcional)", placeholder: "Buscar otro Pokémon…", options: pokemonOptions },
	], submit: { label: "Guardar arquetipo", action_id: "save_archetype" } });
	for (const item of result.items as Array<{ data: Archetype }>) blocks.push({ type: "section", text: `**${item.data.name}**\n${item.data.pokemon.map((pokemon) => pokemon.name).join(" / ")}` });
	return response(blocks, notice);
}

async function renderCardSearch(ctx: any, query?: string, notice: Notice = {}) {
	const blocks: any[] = [{ type: "header", text: "Buscar cartas Pokémon" }, { type: "section", text: "Busca por nombre. Los resultados quedarán disponibles en el selector del bloque **Carta Pokémon** dentro del editor de publicaciones." }];
	addNotice(blocks, notice);
	blocks.push({ type: "form", block_id: "card-search", fields: [{ type: "text_input", action_id: "query", label: "Nombre de la carta", placeholder: "Zoroark, Rare Candy, Energy…", initial_value: query }], submit: { label: "Buscar en TCGDex", action_id: "search_cards" } });
	if (!query) return response(blocks, notice);
	try {
		const language = (await ctx.kv.get("settings:cardLanguage") as string | null) ?? "en";
		const cards = await searchCardCatalog((url, init) => ctx.http!.fetch(String(url), init), language, query);
		await ctx.kv.set("recent-card-options", cards.map((card) => ({ id: card.id, name: `${card.name} · ${card.id}` })));
		if (!cards.length) blocks.push({ type: "banner", title: "Sin resultados", description: "Prueba con una parte más corta del nombre.", variant: "alert" });
		for (const card of cards.slice(0, 20)) {
			if (card.image) blocks.push({ type: "image", url: `${card.image}/low.webp`, alt: card.name });
			blocks.push({ type: "section", text: `**${card.name}**\nID TCGDex: \`${card.id}\` · número ${card.localId}` });
		}
	} catch { blocks.push({ type: "banner", title: "No se pudo consultar TCGDex", variant: "error" }); }
	return response(blocks, notice);
}

async function renderResults(ctx: any, notice: Notice = {}) {
	const [decksResult, tournamentsResult, matchesResult] = await Promise.all([ctx.storage.decks.query({ orderBy: { createdAt: "desc" }, limit: 100 }), ctx.storage.tournaments.query({ orderBy: { playedAt: "desc" }, limit: 100 }), ctx.storage.matches.query({ orderBy: { playedAt: "desc" }, limit: 200 })]);
	const decks = decksResult.items.map((item: { data: Decklist }) => item.data);
	const tournaments: TournamentResult[] = tournamentsResult.items.map((item: { data: TournamentResult }) => item.data);
	const matches: MatchResult[] = matchesResult.items.map((item: { data: MatchResult }) => item.data);
	const blocks: any[] = [{ type: "header", text: "Torneos y resultados" }, { type: "section", text: "Crea un torneo con su fecha y decklist. Luego registra cada ronda, el arquetipo rival y el resultado de sus partidas, siguiendo el modelo de Training Court." }];
	addNotice(blocks, notice);
	if (!decks.length) blocks.push({ type: "banner", title: "Primero importa un decklist", variant: "alert" });
	else blocks.push(tournamentForm(decks));
	const names = new Map(decks.map((deck: Decklist) => [deck.id, deck.name]));
	for (const tournament of tournaments) {
		const rounds = matches.filter((match) => match.tournamentId === tournament.id).sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
		const stats = matchStats(rounds);
		blocks.push({ type: "section", text: `**${tournament.name}**\n${tournament.playedAt} · ${names.get(tournament.deckId) ?? "Decklist"}${tournament.placement ? ` · ${tournament.placement}` : ""} · ${stats.wins}-${stats.losses}-${stats.draws} · ${tournament.visibility}` });
		blocks.push({ type: "actions", elements: [
			{ type: "button", action_id: "add_round", label: "Agregar ronda", value: tournament.id },
			{ type: "button", action_id: "edit_tournament", label: "Editar torneo", value: tournament.id },
			{ type: "button", action_id: "delete_tournament", label: "Eliminar torneo", style: "danger", value: tournament.id, confirm: { title: "Eliminar torneo", text: "También se eliminarán todas sus rondas.", confirm: "Eliminar", deny: "Cancelar" } },
		] });
		for (const match of rounds) blocks.push({ type: "section", text: `Ronda ${match.round} · **${labelResult(match.result)}**${match.opponentArchetype ? ` · vs ${match.opponentArchetype}` : ""}${match.games?.length ? ` · ${match.games.map((game) => game.result[0].toUpperCase()).join("")}` : ""}`, accessory: { type: "button", action_id: "edit_round", label: "Editar", value: match.id } });
	}
	const legacy = matches.filter((match) => !match.tournamentId);
	if (legacy.length) {
		blocks.push({ type: "divider" }, { type: "section", text: "**Resultados anteriores**\nSe conservan para compatibilidad; los nuevos resultados se organizan por torneo y ronda." });
		for (const match of legacy) blocks.push({ type: "section", text: `**${labelResult(match.result)} · ${names.get(match.deckId) ?? "Decklist"}**\n${match.playedAt}${match.opponentArchetype ? ` · vs ${match.opponentArchetype}` : ""}${match.eventName ? ` · ${match.eventName}` : ""}`, accessory: { type: "button", action_id: "delete_result", label: "Eliminar", style: "danger", value: match.id } });
	}
	return response(blocks, notice);
}

async function renderTournamentEditor(ctx: any, id: string) {
	const [tournament, decksResult] = await Promise.all([ctx.storage.tournaments.get(id), ctx.storage.decks.query({ orderBy: { createdAt: "desc" }, limit: 100 })]);
	if (!tournament) return renderResults(ctx, { error: "No se encontró el torneo" });
	const decks: Decklist[] = decksResult.items.map((item: { data: Decklist }) => item.data);
	return { blocks: [{ type: "header", text: `Editar torneo · ${tournament.name}` }, tournamentForm(decks, tournament)] };
}

function tournamentForm(decks: Decklist[], tournament?: TournamentResult) {
	return { type: "form", block_id: tournament ? `tournament-${tournament.id}` : "tournament-form", fields: [
		...(tournament ? [{ type: "text_input", action_id: "id", label: "ID del torneo (no modificar)", initial_value: tournament.id }] : []),
		{ type: "select", action_id: "deckId", label: "Decklist", options: decks.map((deck) => ({ label: deck.name, value: deck.id })), initial_value: tournament?.deckId },
		{ type: "text_input", action_id: "eventName", label: "Nombre del torneo", placeholder: "League Challenge, Regional…", initial_value: tournament?.name },
		{ type: "date_input", action_id: "playedAt", label: "Fecha de inicio", initial_value: tournament?.playedAt ?? new Date().toISOString().slice(0, 10) },
		{ type: "date_input", action_id: "endedAt", label: "Fecha de término (opcional)", initial_value: tournament?.endedAt },
		{ type: "select", action_id: "category", label: "Categoría", options: tournamentCategories, initial_value: tournament?.category ?? "other" },
		{ type: "select", action_id: "format", label: "Formato", options: [{ label: "Standard", value: "standard" }, { label: "Expanded", value: "expanded" }, { label: "GLC", value: "glc" }, { label: "Personalizado", value: "custom" }], initial_value: tournament?.format ?? "standard" },
		{ type: "text_input", action_id: "placement", label: "Posición final (opcional)", placeholder: "Top 8, 12.º…", initial_value: tournament?.placement },
		{ type: "text_input", action_id: "notes", label: "Notas", multiline: true, initial_value: tournament?.notes },
		{ type: "select", action_id: "visibility", label: "Visibilidad", options: [{ label: "Público", value: "public" }, { label: "Privado", value: "private" }], initial_value: tournament?.visibility ?? "public" },
	], submit: { label: tournament ? "Guardar torneo" : "Crear torneo y agregar rondas", action_id: "save_tournament" } };
}

async function renderRoundEditor(ctx: any, tournamentId: string, match?: MatchResult, notice: Notice = {}) {
	const [tournament, pokemonOptions, rounds] = await Promise.all([ctx.storage.tournaments.get(tournamentId), getCachedPokemonOptions(ctx), listRounds(ctx)]);
	if (!tournament) return renderResults(ctx, { error: "No se encontró el torneo" });
	const tournamentRounds = rounds.filter((round) => round.tournamentId === tournamentId);
	const nextRound = match?.round ?? Math.max(0, ...tournamentRounds.map((round) => round.round ?? 0)) + 1;
	const blocks: any[] = [{ type: "header", text: `${match ? "Editar" : "Agregar"} ronda · ${tournament.name}` }, { type: "section", text: "Busca uno o dos Pokémon para representar el arquetipo rival. Registra hasta tres partidas; el resultado de la ronda se calcula automáticamente." }];
	addNotice(blocks, notice);
	blocks.push({ type: "form", block_id: `round-${match?.id ?? "new"}`, fields: [
		{ type: "text_input", action_id: "tournamentId", label: "ID del torneo (no modificar)", initial_value: tournamentId },
		...(match ? [{ type: "text_input", action_id: "id", label: "ID de la ronda (no modificar)", initial_value: match.id }] : []),
		{ type: "number_input", action_id: "round", label: "Número de ronda", min: 1, initial_value: nextRound },
		{ type: "combobox", action_id: "opponentPrimaryPokemon", label: "Pokémon principal del rival", placeholder: "Buscar Charizard, Dragapult, Mega…", options: pokemonOptions, initial_value: pokemonSelection(match?.opponentPokemon?.[0]) },
		{ type: "combobox", action_id: "opponentSecondaryPokemon", label: "Segundo Pokémon rival (opcional)", placeholder: "Buscar otro Pokémon…", options: pokemonOptions, initial_value: pokemonSelection(match?.opponentPokemon?.[1]) },
		{ type: "select", action_id: "specialOutcome", label: "Resultado especial", options: [{ label: "Partida normal", value: "normal" }, { label: "BYE", value: "bye" }, { label: "Rival ausente", value: "no-show" }, { label: "Empate intencional", value: "intentional-draw" }], initial_value: match?.specialOutcome ?? "normal" },
		...gameFields(match),
		{ type: "text_input", action_id: "notes", label: "Notas de la ronda", multiline: true, initial_value: match?.notes },
	], submit: { label: match ? "Guardar cambios" : "Guardar ronda", action_id: "save_round" } });
	return response(blocks, notice);
}

async function normalizeDeck(deck: Decklist, ctx: PluginContext) {
	const language = (await ctx.kv.get<string>("settings:cardLanguage")) ?? deck.language ?? "en";
	let resolved = 0; let unresolved = 0;
	const cards: DeckCard[] = [];
	for (const card of deck.cards) {
		if (!isBasicEnergy(card.importedPrinting.name) && card.displayPrinting.imageUrl && card.resolutionStatus !== "pending" && card.resolutionStatus !== "unresolved") {
			cards.push(card); resolved++; continue;
		}
		try {
			const result = await resolveBasicPrinting((url, init) => ctx.http!.fetch(String(url), init), language, card.importedPrinting.name, card.importedPrinting.collectorNumber, card.importedPrinting.setCode, deck.format);
			if (result.status === "unresolved" || !result.selected) { cards.push({ ...card, resolutionStatus: "unresolved" }); unresolved++; continue; }
			const selected = result.selected;
			cards.push({ ...card, displayPrinting: { id: selected.id, name: selected.name, setCode: card.importedPrinting.setCode, collectorNumber: String(selected.localId), imageUrl: selected.image ? `${selected.image}/high.webp` : undefined, rarity: selected.rarity }, resolutionStatus: result.status });
			resolved++;
		} catch { cards.push({ ...card, resolutionStatus: "unresolved" }); unresolved++; }
	}
	return { deck: { ...deck, cards, updatedAt: new Date().toISOString() }, resolved, unresolved };
}

function reuseResolvedCards(cards: DeckCard[], previous: DeckCard[] | undefined) {
	if (!previous?.length) return cards;
	const resolved = new Map(previous.map((card) => [printingKey(card), card]));
	return cards.map((card) => resolved.get(printingKey(card)) ?? card);
}

function printingKey(card: DeckCard) {
	const printing = card.importedPrinting;
	return [printing.name.trim().toLowerCase(), printing.setCode?.trim().toUpperCase() ?? "", printing.collectorNumber?.trim().replace(/^0+/, "") ?? ""].join("|");
}

async function resolveArchetypePokemon(values: Record<string, unknown>, ctx: PluginContext) {
	const selections = [[values.primaryPokemon, "primary"], [values.secondaryPokemon, "secondary"]] as const;
	const pokemon = await Promise.all(selections.map(([value, role], order) => value ? getArchetypePokemon((url, init) => ctx.http!.fetch(String(url), init), String(value), role, order) : null));
	return pokemon.filter((item): item is ArchetypePokemon => item !== null);
}

async function resolveOpponentPokemon(values: Record<string, unknown>, ctx: PluginContext) {
	const selections = [[values.opponentPrimaryPokemon, "primary"], [values.opponentSecondaryPokemon, "secondary"]] as const;
	const pokemon = await Promise.all(selections.map(([value, role], order) => value ? getArchetypePokemon((url, init) => ctx.http!.fetch(String(url), init), String(value), role, order) : null));
	return pokemon.filter((item): item is ArchetypePokemon => item !== null);
}

async function listRounds(ctx: any): Promise<MatchResult[]> {
	const result = await ctx.storage.matches.query({ orderBy: { playedAt: "desc" }, limit: 500 });
	return result.items.map((item: { data: MatchResult }) => item.data);
}

function gameFields(match?: MatchResult) {
	const resultOptions = [{ label: "Sin registrar", value: "none" }, { label: "Victoria", value: "win" }, { label: "Derrota", value: "loss" }, { label: "Empate", value: "draw" }];
	const orderOptions = [{ label: "Sin registrar", value: "unknown" }, { label: "Comencé yo", value: "first" }, { label: "Comenzó el rival", value: "second" }];
	return [1, 2, 3].flatMap((number) => {
		const game = match?.games?.[number - 1];
		return [
			{ type: "select", action_id: `game${number}Result`, label: `Partida ${number} · resultado`, options: resultOptions, initial_value: game?.result ?? (number === 1 ? "win" : "none") },
			{ type: "select", action_id: `game${number}Order`, label: `Partida ${number} · quién comenzó`, options: orderOptions, initial_value: game?.wentFirst === true ? "first" : game?.wentFirst === false ? "second" : "unknown" },
		];
	});
}

function pokemonSelection(pokemon?: ArchetypePokemon) { return pokemon ? String(pokemon.spriteId ?? pokemon.speciesId) : undefined; }
function asGameResult(value: unknown): MatchResult["result"] | undefined { return ["win", "loss", "draw"].includes(String(value)) ? String(value) as MatchResult["result"] : undefined; }
function asSpecialOutcome(value: unknown): MatchResult["specialOutcome"] { return ["bye", "no-show", "intentional-draw"].includes(String(value)) ? String(value) as MatchResult["specialOutcome"] : undefined; }
function labelSpecialOutcome(value: MatchResult["specialOutcome"]) { return value === "bye" ? "BYE" : value === "no-show" ? "Rival ausente" : value === "intentional-draw" ? "Empate intencional" : undefined; }

async function getCachedPokemonOptions(ctx: PluginContext): Promise<PokemonOption[]> {
	const cached = await ctx.kv.get<{ fetchedAt: string; items: PokemonOption[] }>("cache:pokeapi-options:v1");
	if (cached && Date.now() - Date.parse(cached.fetchedAt) < 7 * 24 * 60 * 60 * 1000) return cached.items;
	const items = await listPokemonOptions((url, init) => ctx.http!.fetch(String(url), init));
	await ctx.kv.set("cache:pokeapi-options:v1", { fetchedAt: new Date().toISOString(), items });
	return items;
}

function addNotice(blocks: any[], notice: Notice) { if (notice.error) blocks.push({ type: "banner", title: "No se pudo completar", description: notice.error, variant: "error" }); if (notice.message) blocks.push({ type: "banner", title: notice.message, variant: "default" }); }
function response(blocks: any[], notice: Notice) { return { blocks, ...(notice.message ? { toast: { message: notice.message, type: "success" } } : {}) }; }
function asFormat(value: unknown): Decklist["format"] { return ["standard", "expanded", "glc", "custom"].includes(String(value)) ? String(value) as Decklist["format"] : "standard"; }
function asTournamentCategory(value: unknown): TournamentResult["category"] { return tournamentCategories.some((category) => category.value === String(value)) ? String(value) as TournamentResult["category"] : "other"; }
function optional(value: unknown) { const text = String(value ?? "").trim(); return text || undefined; }
function optionalNumber(value: unknown) { return value === "" || value === undefined || value === null ? undefined : Number(value); }
function labelResult(value: MatchResult["result"]) { return value === "win" ? "Victoria" : value === "loss" ? "Derrota" : "Empate"; }
function slugify(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sin-arquetipo"; }
interface Notice { message?: string; error?: string }
