import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import type { ArchetypePokemon, Decklist } from "./domain.js";
import { parsePokemonDecklist, serializePokemonDecklist } from "./parser.js";
import { resolveBasicPrinting, searchCards } from "./tcgdex.js";

const DEFAULT_CDN = "https://cdn.tcghub.cl";

// EmDash 0.28 executes standard-format routes with (routeContext, pluginContext),
// while its published definePlugin route type currently describes the native
// single-context signature. Keep this cast at the package boundary only.
export default definePlugin({
	id: "pokemon-decklists",
	version: "0.1.0",
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
				default: DEFAULT_CDN,
			},
		},
	},
	routes: {
		admin: {
			handler: async (routeCtx: StandardRouteContext, ctx: PluginContext) => {
				const interaction = routeCtx.input as { type?: string; page?: string; action_id?: string; values?: Record<string, unknown> };
				if (interaction.type === "form_submit" && interaction.action_id === "import_deck") {
					const values = interaction.values ?? {};
					const parsed = parsePokemonDecklist(String(values.deckText ?? ""));
					if (!parsed.cards.length || parsed.errors.length) return renderAdmin(ctx, { error: parsed.errors[0]?.message ?? "La lista está vacía" });

					const now = new Date().toISOString();
					const id = crypto.randomUUID();
					const archetypeName = String(values.archetypeName ?? "").trim();
					const deck: Decklist = {
						id,
						name: String(values.name ?? archetypeName ?? "Decklist").trim() || "Decklist",
						archetypeId: slugify(archetypeName),
						archetypeName,
						archetypePokemon: parseArchetypePokemon(values),
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
				return renderAdmin(ctx);
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
	const result = await ctx.storage.decks.query({ orderBy: { createdAt: "desc" }, limit: 20 });
	const blocks: any[] = [
		{ type: "header", text: "Decklists Pokémon" },
		{ type: "section", text: "Importa una lista exportada desde Pokémon TCG Live o Limitless. Las impresiones especiales se conservarán como origen y luego podrán resolverse hacia una imagen básica equivalente." },
	];
	if (notice.error) blocks.push({ type: "banner", title: "No se pudo importar", description: notice.error, variant: "error" });
	if (notice.message) blocks.push({ type: "banner", title: notice.message, variant: "default" });
	blocks.push({
		type: "form",
		block_id: "deck-import",
		fields: [
			{ type: "text_input", action_id: "name", label: "Nombre de esta lista" },
			{ type: "text_input", action_id: "archetypeName", label: "Arquetipo" },
			{ type: "text_input", action_id: "primaryPokemon", label: "Pokémon principal", placeholder: "Zoroark|571" },
			{ type: "text_input", action_id: "secondaryPokemon", label: "Segundo Pokémon (opcional)", placeholder: "Pidgeot|18" },
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

function parseArchetypePokemon(values: Record<string, unknown>): ArchetypePokemon[] {
	const pokemon: ArchetypePokemon[] = [];
	for (const [order, [value, role]] of [[values.primaryPokemon, "primary"], [values.secondaryPokemon, "secondary"]].entries()) {
			const [name, id] = String(value ?? "").split("|").map((part) => part.trim());
			if (name && Number.isInteger(Number(id)) && Number(id) > 0) {
				pokemon.push({ speciesId: Number(id), name, role: role as "primary" | "secondary", order });
			}
	}
	return pokemon;
}

function asFormat(value: unknown): Decklist["format"] {
	return ["standard", "expanded", "glc", "custom"].includes(String(value)) ? String(value) as Decklist["format"] : "standard";
}

function slugify(value: string) {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sin-arquetipo";
}
