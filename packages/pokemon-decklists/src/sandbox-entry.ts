import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import type { Archetype, ArchetypePokemon, Decklist } from "./domain.js";
import { parsePokemonDecklist, serializePokemonDecklist } from "./parser.js";
import { getArchetypePokemon, listPokemonOptions, type PokemonOption } from "./pokeapi.js";
import { DEFAULT_SPRITE_BASE_URL } from "./sprites.js";
import { resolveBasicPrinting, searchCards } from "./tcgdex.js";

// EmDash 0.28 executes standard-format routes with (routeContext, pluginContext),
// while its published definePlugin route type currently describes the native
// single-context signature. Keep this cast at the package boundary only.
export default definePlugin({
	id: "pokemon-decklists",
	version: "0.3.0",
	capabilities: ["network:request"],
	admin: {
		settingsSchema: {
			cardLanguage: {
				type: "select",
				label: "Idioma del catálogo",
				options: [{ value: "en", label: "English" }, { value: "es", label: "Español" }],
				default: "en",
			},
			spriteBaseUrl: {
				type: "string",
				label: "URL base de sprites",
				default: DEFAULT_SPRITE_BASE_URL,
			},
		},
	},
	routes: {
		admin: {
			handler: async (routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const interaction = routeCtx.input as { type?: string; page?: string; action_id?: string; values?: Record<string, unknown> };
				if (interaction.type === "form_submit" && interaction.action_id === "save_archetype") {
					const values = interaction.values ?? {};
					const name = String(values.name ?? "").trim();
					const pokemon = await resolveArchetypePokemon(values, ctx);
					if (!name || !pokemon.length) return renderArchetypes(ctx, { error: "Indica un nombre y al menos un Pokémon válido" });
					const id = slugify(name);
					const existing = await ctx.storage.archetypes!.get(id) as Archetype | null;
					const now = new Date().toISOString();
					const archetype: Archetype = {
						id, name, game: "pokemon", pokemon,
						createdAt: existing?.createdAt ?? now,
						updatedAt: now,
					};
					await ctx.storage.archetypes!.put(id, archetype);
					return renderArchetypes(ctx, { message: `Arquetipo ${name} guardado` });
				}
				if (interaction.type === "form_submit" && interaction.action_id === "import_deck") {
					const values = interaction.values ?? {};
					const parsed = parsePokemonDecklist(String(values.deckText ?? ""));
					if (!parsed.cards.length || parsed.errors.length) return renderAdmin(ctx, { error: parsed.errors[0]?.message ?? "La lista está vacía" });
					const archetypeId = String(values.archetypeId ?? "");
					const archetype = await ctx.storage.archetypes!.get(archetypeId) as Archetype | null;
					if (!archetype) return renderAdmin(ctx, { error: "Selecciona un arquetipo existente" });

					const now = new Date().toISOString();
					const id = crypto.randomUUID();
					const deck: Decklist = {
						id,
						name: String(values.name ?? archetype.name).trim() || "Decklist",
						archetypeId: archetype.id,
						archetypeName: archetype.name,
						archetypePokemon: archetype.pokemon,
						format: asFormat(values.format),
						language: "en",
						source: "ptcgl",
						cards: parsed.cards,
						totalCards: parsed.totalCards,
						createdAt: now,
						updatedAt: now,
					};
					await ctx.storage.decks!.put(id, deck);
					return renderAdmin(ctx, { message: `Lista guardada con ${deck.totalCards} cartas` });
				}
				return interaction.page === "/archetypes" ? renderArchetypes(ctx) : renderAdmin(ctx);
			},
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
				const result = await ctx.storage.decks!.query({ orderBy: { createdAt: "desc" }, limit: 50 });
				return { items: result.items.map((item: { data: unknown }) => item.data), cursor: result.cursor, hasMore: result.hasMore };
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
		"cards/search": {
			handler: async (routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const url = new URL(routeCtx.request.url);
				const name = url.searchParams.get("name")?.trim();
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
				return resolveBasicPrinting(
					(url, init) => ctx.http!.fetch(String(url), init),
					language,
					name,
					url.searchParams.get("number") ?? undefined,
					url.searchParams.get("format") ?? "standard",
				);
			},
		},
	},
} as any);

interface StandardRouteContext {
	input: unknown;
	request: { url: string; method: string; headers: Record<string, string> };
}

async function renderAdmin(ctx: any, notice: { message?: string; error?: string } = {}) {
	const [result, archetypeResult] = await Promise.all([
		ctx.storage.decks.query({ orderBy: { createdAt: "desc" }, limit: 20 }),
		ctx.storage.archetypes.query({ orderBy: { updatedAt: "desc" }, limit: 100 }),
	]);
	const archetypes = archetypeResult.items.map((item: { data: Archetype }) => item.data);
	const blocks: any[] = [
		{ type: "header", text: "Decklists Pokémon" },
		{ type: "section", text: "Importa una lista exportada desde Pokémon TCG Live o Limitless. Las impresiones especiales se conservarán como origen y luego podrán resolverse hacia una imagen básica equivalente." },
	];
	if (notice.error) blocks.push({ type: "banner", title: "No se pudo importar", description: notice.error, variant: "error" });
	if (notice.message) blocks.push({ type: "banner", title: notice.message, variant: "default" });
	if (!archetypes.length) {
		blocks.push({ type: "banner", title: "Primero crea un arquetipo", description: "Abre Arquetipos Pokémon en el menú del plugin. Luego podrás seleccionarlo al importar una lista.", variant: "alert" });
	} else blocks.push({
		type: "form",
		block_id: "deck-import",
		fields: [
			{ type: "text_input", action_id: "name", label: "Nombre de esta lista" },
			{ type: "select", action_id: "archetypeId", label: "Arquetipo", options: archetypes.map((archetype: Archetype) => ({ label: archetype.name, value: archetype.id })) },
			{ type: "select", action_id: "format", label: "Formato", options: [
				{ label: "Standard", value: "standard" }, { label: "Expanded", value: "expanded" },
				{ label: "GLC", value: "glc" }, { label: "Personalizado", value: "custom" },
			], initial_value: "standard" },
			{ type: "text_input", action_id: "deckText", label: "Lista exportada", multiline: true },
		],
		submit: { label: "Importar lista", action_id: "import_deck" },
	});
	if (result.items.length) blocks.push({
		type: "table",
		columns: [
			{ key: "name", label: "Lista" }, { key: "archetypeName", label: "Arquetipo" },
			{ key: "format", label: "Formato" }, { key: "totalCards", label: "Cartas" },
		],
		rows: result.items.map((item: any) => item.data),
	});
	return { blocks, ...(notice.message ? { toast: { message: notice.message, type: "success" } } : {}) };
}

async function renderArchetypes(ctx: any, notice: { message?: string; error?: string } = {}) {
	const [result, pokemonOptions] = await Promise.all([
		ctx.storage.archetypes.query({ orderBy: { updatedAt: "desc" }, limit: 100 }),
		getCachedPokemonOptions(ctx),
	]);
	const blocks: any[] = [
		{ type: "header", text: "Arquetipos Pokémon" },
		{ type: "section", text: "Crea arquetipos reutilizables para seleccionarlos al importar decklists. Busca por nombre; las especies y formas Mega se identifican automáticamente." },
	];
	if (notice.error) blocks.push({ type: "banner", title: "No se pudo guardar", description: notice.error, variant: "error" });
	if (notice.message) blocks.push({ type: "banner", title: notice.message, variant: "default" });
	blocks.push({
		type: "form", block_id: "archetype-form",
		fields: [
			{ type: "text_input", action_id: "name", label: "Nombre del arquetipo", placeholder: "Mega Charizard X / Pidgeot ex" },
			{ type: "combobox", action_id: "primaryPokemon", label: "Pokémon principal", placeholder: "Buscar Zoroark, Charizard, Mega…", options: pokemonOptions },
			{ type: "combobox", action_id: "secondaryPokemon", label: "Segundo Pokémon (opcional)", placeholder: "Buscar otro Pokémon…", options: pokemonOptions },
		],
		submit: { label: "Guardar arquetipo", action_id: "save_archetype" },
	});
	if (result.items.length) blocks.push({
		type: "table",
		columns: [{ key: "name", label: "Arquetipo" }, { key: "pokemonNames", label: "Pokémon" }],
		rows: result.items.map((item: { data: Archetype }) => ({ ...item.data, pokemonNames: item.data.pokemon.map((pokemon) => pokemon.name).join(" / ") })),
	});
	return { blocks, ...(notice.message ? { toast: { message: notice.message, type: "success" } } : {}) };
}

async function resolveArchetypePokemon(values: Record<string, unknown>, ctx: PluginContext) {
	const selections = [[values.primaryPokemon, "primary"], [values.secondaryPokemon, "secondary"]] as const;
	const pokemon = await Promise.all(selections.map(([value, role], order) => {
		if (!value) return null;
		return getArchetypePokemon((url, init) => ctx.http!.fetch(String(url), init), String(value), role, order);
	}));
	return pokemon.filter((item): item is ArchetypePokemon => item !== null);
}

async function getCachedPokemonOptions(ctx: PluginContext): Promise<PokemonOption[]> {
	const cached = await ctx.kv.get<{ fetchedAt: string; items: PokemonOption[] }>("cache:pokeapi-options:v1");
	const maxAge = 7 * 24 * 60 * 60 * 1000;
	if (cached && Date.now() - Date.parse(cached.fetchedAt) < maxAge) return cached.items;
	const items = await listPokemonOptions((url, init) => ctx.http!.fetch(String(url), init));
	await ctx.kv.set("cache:pokeapi-options:v1", { fetchedAt: new Date().toISOString(), items });
	return items;
}

function asFormat(value: unknown): Decklist["format"] {
	return ["standard", "expanded", "glc", "custom"].includes(String(value)) ? String(value) as Decklist["format"] : "standard";
}

function slugify(value: string) {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sin-arquetipo";
}
