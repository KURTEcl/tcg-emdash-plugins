import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Banner, Button, Input, Loader } from "@cloudflare/kumo";
import { apiFetch } from "@emdash-cms/admin";
import { BlockRenderer } from "@emdash-cms/blocks";
import type { Block, BlockInteraction } from "@emdash-cms/blocks";
import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { Copy } from "@phosphor-icons/react/Copy";
import { DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Plus } from "@phosphor-icons/react/Plus";
import { Trash } from "@phosphor-icons/react/Trash";
import type { Archetype, CardCategory, DeckCard, Decklist, MatchResult, TournamentResult } from "./domain.js";

const API = "/_emdash/api/plugins/pokemon-decklists";
type AdminData = { decks: Decklist[]; archetypes: Archetype[]; tournaments: TournamentResult[]; matches: MatchResult[] };
type Notice = { message: string; type: "success" | "error" } | null;

// EmDash admin surface tokens (Kumo): base panels, elevated fields, brand CTAs
const PANEL = "rounded-lg border border-kumo-line bg-kumo-base p-5";
const FIELD = "h-9 w-full rounded-lg border border-kumo-line bg-kumo-elevated px-3 text-sm text-kumo-default outline-none focus:ring-[1.5px] focus:ring-kumo-brand/50";
const AREA = "w-full rounded-lg border border-kumo-line bg-kumo-elevated p-3 text-sm text-kumo-default outline-none focus:ring-[1.5px] focus:ring-kumo-brand/50";
const ROW = "border-b border-kumo-line last:border-0 hover:bg-kumo-tint";
const CELL = "px-4 py-3";

type PickerCard = { id: string; name: string; number: string; imageUrl?: string };

function setReactInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function parseStoredCardIds(value: string) {
	const separated = value.split(/\r?\n|,/).map((id) => id.trim()).filter(Boolean);
	if (separated.length > 1 || !value) return separated;
	return value.match(/[a-z][a-z0-9]*(?:\.\d+)?-[a-z0-9]+?(?=[a-z]{2,}\d|$)/gi) ?? separated;
}

function installPluginAdminStyles() {
	if (typeof document === "undefined" || document.documentElement.dataset.tcgDecklistsCss === "ready") return;
	document.documentElement.dataset.tcgDecklistsCss = "ready";
	const style = document.createElement("style");
	// ponytail: admin Tailwind doesn't scan plugin class names — ship our own grid CSS
	style.textContent = `
.tcg-deck-hits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.375rem;margin-bottom:1rem}
.tcg-deck-hits__card{border:1px solid var(--color-kumo-line);border-radius:.25rem;padding:.125rem;background:transparent;color:inherit;text-align:left;cursor:pointer}
.tcg-deck-hits__card:hover{border-color:var(--color-kumo-brand)}
.tcg-deck-hits__card img,.tcg-deck-hits__card i{display:block;width:100%;aspect-ratio:245/342;border-radius:.125rem;object-fit:cover}
.tcg-deck-hits__card i{display:grid;place-items:center;background:var(--color-kumo-tint);font-style:normal;font-size:.65rem;color:var(--text-color-kumo-subtle)}
.tcg-deck-hits__card span{display:block;margin-top:.125rem;overflow:hidden;font-size:10px;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
@media(min-width:768px){.tcg-deck-hits{grid-template-columns:repeat(6,minmax(0,1fr));gap:.25rem}.tcg-deck-hits__card span{font-size:9px}}
.tcg-picker{margin-bottom:1rem}.tcg-picker__search{display:flex;gap:.5rem}.tcg-picker__search input{min-width:0;flex:1;height:2.5rem;border:1px solid var(--color-kumo-line);border-radius:.5rem;background:var(--color-kumo-elevated);padding:0 .75rem;color:inherit}.tcg-picker__search button{height:2.5rem;border-radius:.5rem;background:var(--color-kumo-brand);padding:0 1rem;color:white;font-size:.875rem;font-weight:600}.tcg-picker__status{margin:.7rem 0;color:var(--text-color-kumo-subtle);font-size:.8rem}.tcg-picker__grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.4rem}.tcg-picker__card{position:relative;border:2px solid transparent;border-radius:.55rem;padding:.15rem;background:transparent;color:inherit;text-align:left;cursor:pointer}.tcg-picker__card img{display:block;width:100%;aspect-ratio:245/342;border-radius:.38rem;object-fit:cover}.tcg-picker__card span{display:block;margin-top:.25rem;overflow:hidden;font-size:.68rem;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}.tcg-picker__card.is-selected{border-color:var(--color-kumo-brand);background:color-mix(in srgb,var(--color-kumo-brand) 12%,transparent)}.tcg-picker__card.is-selected:after{content:'✓';position:absolute;top:.4rem;right:.4rem;display:grid;width:1.5rem;height:1.5rem;place-items:center;border-radius:999px;background:var(--color-kumo-brand);color:white;font-weight:800}.tcg-picker__selected{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.75rem}.tcg-picker__selected button{display:inline-flex;align-items:center;gap:.4rem;max-width:100%;border:1px solid var(--color-kumo-line);border-radius:999px;background:var(--color-kumo-elevated);padding:.3rem .55rem;color:inherit;font-size:.75rem;cursor:pointer}.tcg-picker__selected button:hover{border-color:var(--color-kumo-brand)}.tcg-picker__selected button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tcg-picker__selected button b{color:var(--text-color-kumo-subtle);font-size:1rem;line-height:.75}@media(max-width:767px){.tcg-picker__grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;
	document.head.append(style);
}

function installCardPickerEnhancer() {
	if (typeof document === "undefined" || document.documentElement.dataset.tcgCardPicker === "ready") return;
	document.documentElement.dataset.tcgCardPicker = "ready";
	installPluginAdminStyles();

	const enhance = () => {
		for (const input of document.querySelectorAll<HTMLInputElement>('input[placeholder="tcg-card-picker-single"],input[placeholder="tcg-card-picker-multiple"]')) {
			if (input.dataset.enhanced) continue;
			input.dataset.enhanced = "true";
			const multiple = input.placeholder.endsWith("multiple");
			const selected = new Set(parseStoredCardIds(input.value));
			const wrapper = document.createElement("div"); wrapper.className = "tcg-picker";
			wrapper.innerHTML = `<label style="display:block;margin-bottom:.4rem;font-size:.875rem;font-weight:600">Buscar cartas en TCGDex</label><div class="tcg-picker__search"><input type="search" placeholder="Zoroark, Rare Candy, Energy…" aria-label="Buscar cartas en TCGDex"><button type="button">Buscar</button></div><div class="tcg-picker__status">${selected.size ? `${selected.size} carta${selected.size === 1 ? "" : "s"} seleccionada${selected.size === 1 ? "" : "s"}` : "Escribe al menos dos caracteres para buscar."}</div><div class="tcg-picker__grid"></div><div class="tcg-picker__selected"></div>`;
			const fieldContainer = input.closest("div"); if (!fieldContainer) continue; fieldContainer.before(wrapper); fieldContainer.style.display = "none";
		const search = wrapper.querySelector<HTMLInputElement>('input[type="search"]')!;
		const button = wrapper.querySelector<HTMLButtonElement>("button")!;
		const status = wrapper.querySelector<HTMLDivElement>(".tcg-picker__status")!;
		const grid = wrapper.querySelector<HTMLDivElement>(".tcg-picker__grid")!;
		const selectedLabel = wrapper.querySelector<HTMLDivElement>(".tcg-picker__selected")!;
		let currentCards: PickerCard[] = [];
		const renderSelected = () => { selectedLabel.replaceChildren(...[...selected].map((id) => { const card = currentCards.find((item) => item.id === id); const remove = document.createElement("button"); remove.type = "button"; remove.title = `Quitar ${card?.name ?? id}`; remove.setAttribute("aria-label", `Quitar ${card?.name ?? id}`); const name = document.createElement("span"); name.textContent = card ? `${card.name} · ${id}` : id; const icon = document.createElement("b"); icon.textContent = "×"; icon.setAttribute("aria-hidden", "true"); remove.append(name, icon); remove.addEventListener("click", () => { selected.delete(id); render(currentCards); sync(); }); return remove; })); };
		const sync = () => { setReactInputValue(input, [...selected].join(",")); renderSelected(); status.textContent = `${selected.size} de ${multiple ? 4 : 1} seleccionada${selected.size === 1 ? "" : "s"}.`; };
		const render = (cards: PickerCard[]) => { currentCards = cards; grid.replaceChildren(...cards.map((card) => { const item = document.createElement("button"); item.type = "button"; item.className = `tcg-picker__card${selected.has(card.id) ? " is-selected" : ""}`; item.title = `${card.name} · ${card.id}`; item.setAttribute("aria-pressed", String(selected.has(card.id))); const media = card.imageUrl ? Object.assign(document.createElement("img"), { src: card.imageUrl, alt: "" }) : Object.assign(document.createElement("i"), { textContent: card.name }); const label = document.createElement("span"); label.textContent = `${card.name} · ${card.number}`; item.append(media, label); item.addEventListener("click", () => { if (selected.has(card.id)) selected.delete(card.id); else { if (!multiple) selected.clear(); if (selected.size < 4) selected.add(card.id); } render(cards); sync(); }); return item; })); };
		const runSearch = async () => { const query = search.value.trim(); if (query.length < 2) { status.textContent = "Escribe al menos dos caracteres."; return; } button.disabled = true; status.textContent = "Buscando…"; try { const response = await apiFetch(`${API}/card-picker-search?q=${encodeURIComponent(query)}`); if (!response.ok) throw new Error(); const body = await response.json() as { data: { items: PickerCard[] } }; render(body.data.items); status.textContent = body.data.items.length ? "Selecciona una carta." : "No se encontraron cartas."; } catch { status.textContent = "No se pudo consultar TCGDex."; } finally { button.disabled = false; } };
		button.addEventListener("click", () => void runSearch()); search.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void runSearch(); } }); sync();
		}
	};
	new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true }); enhance();
}

installPluginAdminStyles();
installCardPickerEnhancer();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await apiFetch(`${API}/${path}`, init);
	if (!response.ok) throw new Error(await response.text());
	const body = await response.json() as { data: T };
	return body.data;
}

function useAdminData() {
	const [data, setData] = useState<AdminData | null>(null);
	const [error, setError] = useState("");
	const reload = useCallback(async () => {
		try { setData(await request<AdminData>("admin-data")); setError(""); }
		catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar la información"); }
	}, []);
	useEffect(() => { void reload(); }, [reload]);
	return { data, error, reload };
}

function useEditor(reload: () => Promise<void>) {
	const [blocks, setBlocks] = useState<Block[] | null>(null);
	const [notice, setNotice] = useState<Notice>(null);
	const interact = useCallback(async (interaction: BlockInteraction, closeAfter = false) => {
		try {
			const result = await request<{ blocks: Block[]; toast?: Notice }>("admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(interaction) });
			if (closeAfter && result.toast?.type !== "error") { setBlocks(null); await reload(); }
			else setBlocks(result.blocks);
			if (result.toast) setNotice(result.toast);
		} catch (cause) { setNotice({ type: "error", message: cause instanceof Error ? cause.message : "No se pudo completar la acción" }); }
	}, [reload]);
	const open = useCallback((action_id: string, value?: string) => interact({ type: "block_action", action_id, value }), [interact]);
	const action = useCallback((action_id: string, value?: string) => interact({ type: "block_action", action_id, value }, true), [interact]);
	return { blocks, notice, setBlocks, setNotice, interact, open, action };
}

function PageHeader({ title, description, action, actionLabel }: { title: string; description: string; action?: () => void; actionLabel?: string }) {
	return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 className="text-2xl font-bold text-kumo-default">{title}</h1>
			<p className="mt-1 text-sm text-kumo-subtle">{description}</p>
		</div>
		{action && <Button type="button" variant="primary" icon={Plus} onClick={action}>{actionLabel}</Button>}
	</div>;
}

function Toolbar({ search, setSearch, placeholder, children }: { search: string; setSearch: (value: string) => void; placeholder: string; children?: React.ReactNode }) {
	return <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
		<div className="relative min-w-0 flex-1">
			<MagnifyingGlass className="pointer-events-none absolute start-3 top-1/2 z-10 -translate-y-1/2 text-kumo-subtle" size={16} />
			<Input type="search" value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder={placeholder} aria-label="Buscar" className="ps-9" />
		</div>
		{children}
	</div>;
}

function Filter({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: Array<{ value: string; label: string }> }) {
	return <label>
		<span className="sr-only">{label}</span>
		<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={`${FIELD} w-auto min-w-40`}>
			{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
		</select>
	</label>;
}

function AdminTable({ columns, children, empty }: { columns: string[]; children: React.ReactNode; empty?: boolean }) {
	if (empty) {
		return <div className="rounded-lg border border-dashed border-kumo-line bg-kumo-base px-6 py-12 text-center text-sm text-kumo-subtle">
			No hay elementos que coincidan con los filtros.
		</div>;
	}
	return <div className="overflow-x-auto rounded-lg border border-kumo-line bg-kumo-base">
		<table className="w-full text-start text-sm">
			<thead className="bg-kumo-recessed">
				<tr className="border-b border-kumo-line">
					{columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-kumo-subtle">{column}</th>)}
				</tr>
			</thead>
			<tbody>{children}</tbody>
		</table>
	</div>;
}

function RowActions({ label, onEdit, onDuplicate, onDelete, extra }: { label: string; onEdit: () => void; onDuplicate?: () => void; onDelete: () => void; extra?: React.ReactNode }) {
	return <div className="flex items-center justify-end gap-1">
		{extra}
		<IconButton label={`Editar ${label}`} onClick={onEdit} icon={PencilSimple} />
		{onDuplicate && <IconButton label={`Duplicar ${label}`} onClick={onDuplicate} icon={Copy} />}
		<IconButton label={`Eliminar ${label}`} onClick={onDelete} icon={Trash} danger />
	</div>;
}

function IconButton({ label, onClick, icon, danger = false, disabled = false, busy = false }: { label: string; onClick: () => void; icon: typeof PencilSimple; danger?: boolean; disabled?: boolean; busy?: boolean }) {
	return <Button
		type="button"
		shape="square"
		size="sm"
		variant={danger ? "secondary-destructive" : "ghost"}
		aria-label={label}
		title={label}
		disabled={disabled || busy}
		loading={busy}
		icon={icon}
		onClick={onClick}
	/>;
}

function NoticeBanner({ notice }: { notice: Notice }) {
	if (!notice) return null;
	return <Banner className="mb-4" variant={notice.type === "error" ? "error" : "default"} description={notice.message} />;
}

function Loading({ error }: { error?: string }) {
	return <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-kumo-subtle">
		{error ? error : <><Loader size="base" /> Cargando…</>}
	</div>;
}

function BackLink({ onClick }: { onClick: () => void }) {
	return <Button type="button" variant="ghost" size="sm" onClick={onClick} className="mb-4 -ms-2">← Volver al listado</Button>;
}

function Editor({ blocks, notice, onAction, onBack }: { blocks: Block[]; notice: Notice; onAction: (interaction: BlockInteraction) => void; onBack: () => void }) {
	return <div>
		<BackLink onClick={onBack} />
		<NoticeBanner notice={notice} />
		<div className={PANEL}>
			<BlockRenderer blocks={blocks} onAction={onAction} />
		</div>
	</div>;
}

type EditorCard = { key: string; quantity: number; category: CardCategory; name: string; setCode?: string; collectorNumber?: string; id?: string; imageUrl?: string };

function mapTcgCategory(category?: string): CardCategory {
	const value = (category ?? "").toLowerCase();
	if (value.includes("energy") || value.includes("energ")) return "energy";
	if (value.includes("pokemon") || value.includes("pokémon")) return "pokemon";
	return "trainer";
}

function cardsFromDeck(deck?: Decklist | null): EditorCard[] {
	return (deck?.cards ?? []).map((card, index) => ({
		key: `${printingKey(card)}-${index}`,
		quantity: card.quantity,
		category: card.category,
		name: card.importedPrinting.name || card.displayPrinting.name,
		setCode: card.importedPrinting.setCode ?? card.displayPrinting.setCode,
		collectorNumber: card.importedPrinting.collectorNumber ?? card.displayPrinting.collectorNumber,
		id: card.displayPrinting.id ?? card.importedPrinting.id,
		imageUrl: card.displayPrinting.imageUrl,
	}));
}

function printingKey(card: DeckCard) {
	const printing = card.importedPrinting;
	return [printing.name.trim().toLowerCase(), printing.setCode?.trim().toUpperCase() ?? "", printing.collectorNumber?.trim().replace(/^0+/, "") ?? ""].join("|");
}

type PokemonOption = { label: string; value: string };

function DeckEditor({ deck, archetypes, onBack, onSaved, reload }: { deck?: Decklist; archetypes: Archetype[]; onBack: () => void; onSaved: (message: string) => void; reload: () => Promise<void> }) {
	const [name, setName] = useState(deck?.name ?? "");
	const [archetypeId, setArchetypeId] = useState(deck?.archetypeId ?? archetypes[0]?.id ?? "");
	const [format, setFormat] = useState<Decklist["format"]>(deck?.format ?? "standard");
	const [isArchetypeBase, setIsArchetypeBase] = useState(Boolean(deck?.isArchetypeBase));
	const [cards, setCards] = useState<EditorCard[]>(() => cardsFromDeck(deck));
	const [deckText, setDeckText] = useState("");
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<PickerCard[]>([]);
	const [status, setStatus] = useState("");
	const [saving, setSaving] = useState(false);
	const [searching, setSearching] = useState(false);
	const [notice, setNotice] = useState<Notice>(null);
	const [creatingArchetype, setCreatingArchetype] = useState(false);
	const [newArchName, setNewArchName] = useState("");
	const [primaryPokemon, setPrimaryPokemon] = useState("");
	const [secondaryPokemon, setSecondaryPokemon] = useState("");
	const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[]>([]);
	const [pokemonFilter, setPokemonFilter] = useState("");
	const [savingArchetype, setSavingArchetype] = useState(false);
	const [dragKey, setDragKey] = useState<string | null>(null);
	const [dropKey, setDropKey] = useState<string | null>(null);

	const total = cards.reduce((sum, card) => sum + card.quantity, 0);

	const moveCard = (fromKey: string, toKey: string) => {
		if (fromKey === toKey) return;
		setCards((current) => {
			const from = current.findIndex((card) => card.key === fromKey);
			const to = current.findIndex((card) => card.key === toKey);
			if (from < 0 || to < 0) return current;
			const next = [...current];
			const [item] = next.splice(from, 1);
			next.splice(to, 0, item);
			return next;
		});
	};
	const filteredPokemon = useMemo(() => {
		const needle = pokemonFilter.trim().toLowerCase();
		const pool = needle ? pokemonOptions.filter((item) => item.label.toLowerCase().includes(needle)) : pokemonOptions;
		return pool.slice(0, 80);
	}, [pokemonOptions, pokemonFilter]);

	const openCreateArchetype = async () => {
		setCreatingArchetype(true);
		setNotice(null);
		if (pokemonOptions.length) return;
		try {
			const result = await request<{ items: PokemonOption[] }>("pokemon-options");
			setPokemonOptions(result.items);
		} catch { setNotice({ type: "error", message: "No se pudo cargar la lista de Pokémon" }); }
	};

	const createArchetype = async () => {
		if (!newArchName.trim() || !primaryPokemon) {
			setNotice({ type: "error", message: "Indica nombre y Pokémon principal" });
			return;
		}
		setSavingArchetype(true); setNotice(null);
		try {
			const result = await request<{ ok: boolean; error?: string; archetype?: Archetype }>("archetypes/save", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: newArchName.trim(), primaryPokemon, secondaryPokemon: secondaryPokemon || undefined }),
			});
			if (!result.ok || !result.archetype) { setNotice({ type: "error", message: result.error || "No se pudo crear el arquetipo" }); return; }
			setArchetypeId(result.archetype.id);
			setCreatingArchetype(false);
			setNewArchName(""); setPrimaryPokemon(""); setSecondaryPokemon(""); setPokemonFilter("");
			await reload();
			setNotice({ type: "success", message: `Arquetipo ${result.archetype.name} creado` });
		} catch (cause) { setNotice({ type: "error", message: cause instanceof Error ? cause.message : "No se pudo crear el arquetipo" }); }
		finally { setSavingArchetype(false); }
	};

	const runSearch = async () => {
		const q = query.trim();
		if (q.length < 2) { setStatus("Escribe al menos dos caracteres."); return; }
		setSearching(true); setStatus("Buscando…");
		try {
			const result = await request<{ items: PickerCard[] }>(`card-picker-search?q=${encodeURIComponent(q)}`);
			setHits(result.items); setStatus(result.items.length ? "Haz clic para agregar una carta." : "Sin resultados.");
		} catch { setStatus("No se pudo consultar TCGDex."); }
		finally { setSearching(false); }
	};

	const addCard = async (hit: PickerCard) => {
		try {
			const detail = await request<{ status: string; selected?: { id: string; name: string; localId: string | number; image?: string; category?: string; set?: { id: string } } }>(`cards/display?id=${encodeURIComponent(hit.id)}`);
			const selected = detail.selected;
			const nameValue = selected?.name ?? hit.name;
			const collectorNumber = selected ? String(selected.localId) : hit.number;
			const imageUrl = selected?.image ? `${selected.image}/high.webp` : hit.imageUrl;
			const category = mapTcgCategory(selected?.category);
			setCards((current) => {
				const match = current.find((card) => card.id === hit.id || (card.name === nameValue && card.collectorNumber === collectorNumber));
				if (match) return current.map((card) => card.key === match.key ? { ...card, quantity: Math.min(60, card.quantity + 1) } : card);
				return [...current, { key: `${hit.id}-${Date.now()}`, quantity: 1, category, name: nameValue, collectorNumber, id: hit.id, imageUrl, setCode: undefined }];
			});
			setStatus(`Agregada: ${nameValue}`);
		} catch { setStatus("No se pudo agregar la carta."); }
	};

	const save = async (reanalyze = false) => {
		if (!archetypeId) { setNotice({ type: "error", message: "Selecciona un arquetipo" }); return; }
		if (!cards.length && !deckText.trim()) { setNotice({ type: "error", message: "Agrega cartas o pega una lista exportada" }); return; }
		setSaving(true); setNotice(null);
		try {
			const result = await request<{ ok: boolean; error?: string; message?: string; deck?: Decklist }>("decks/save", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					id: deck?.id,
					name: name.trim() || archetypes.find((item) => item.id === archetypeId)?.name || "Decklist",
					archetypeId,
					format,
					isArchetypeBase,
					reanalyze,
					cards: cards.map((card) => ({ quantity: card.quantity, category: card.category, name: card.name, setCode: card.setCode, collectorNumber: card.collectorNumber, id: card.id, imageUrl: card.imageUrl })),
					deckText: cards.length ? undefined : deckText,
				}),
			});
			if (!result.ok) { setNotice({ type: "error", message: result.error || "No se pudo guardar" }); return; }
			await reload();
			onSaved(result.message || "Decklist guardado");
		} catch (cause) { setNotice({ type: "error", message: cause instanceof Error ? cause.message : "No se pudo guardar" }); }
		finally { setSaving(false); }
	};

	return <div className="space-y-5">
		<BackLink onClick={onBack} />
		<div>
			<h1 className="text-2xl font-bold text-kumo-default">{deck ? `Editar: ${deck.name}` : "Nueva decklist"}</h1>
			<p className="mt-1 text-sm text-kumo-subtle">Busca y quita cartas, o pega una lista exportada. Marca “lista base” si es la referencia del arquetipo.</p>
		</div>
		<NoticeBanner notice={notice} />
		<section className={`${PANEL} grid gap-4 md:grid-cols-2`}>
			<label className="block text-sm"><span className="mb-1 block font-medium text-kumo-default">Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} /></label>
			<div className="block text-sm">
				<div className="mb-1 flex items-center justify-between gap-2">
					<span className="font-medium text-kumo-default">Arquetipo</span>
					<button type="button" onClick={() => void openCreateArchetype()} className="text-xs font-medium text-kumo-brand hover:underline">+ Crear arquetipo</button>
				</div>
				<select value={archetypeId} onChange={(e) => setArchetypeId(e.target.value)} className={FIELD}>
					{!archetypes.length && <option value="">Sin arquetipos — créalo con el botón</option>}
					{archetypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
				</select>
			</div>
			<label className="block text-sm"><span className="mb-1 block font-medium text-kumo-default">Formato</span><select value={format} onChange={(e) => setFormat(e.target.value as Decklist["format"])} className={FIELD}><option value="standard">Standard</option><option value="expanded">Expanded</option><option value="glc">GLC</option><option value="custom">Personalizado</option></select></label>
			<label className="flex items-start gap-3 rounded-lg border border-kumo-line bg-kumo-elevated p-3 text-sm"><input type="checkbox" checked={isArchetypeBase} onChange={(e) => setIsArchetypeBase(e.target.checked)} className="mt-0.5" /><span><strong className="block text-kumo-default">Lista base del arquetipo</strong><span className="text-kumo-subtle">No aparece en /decklists ni en la tabla del arquetipo. Solo una base por arquetipo.</span></span></label>
		</section>

		{creatingArchetype && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
			<button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/50" onClick={() => setCreatingArchetype(false)} />
			<div role="dialog" aria-modal="true" aria-labelledby="new-archetype-title" className="relative z-10 w-full max-w-lg space-y-3 rounded-lg border border-kumo-line bg-kumo-base p-5 shadow-lg" onKeyDown={(e) => { if (e.key === "Escape") setCreatingArchetype(false); }}>
				<div><h2 id="new-archetype-title" className="text-lg font-semibold text-kumo-default">Nuevo arquetipo</h2><p className="text-xs text-kumo-subtle">Se crea y queda seleccionado para esta decklist.</p></div>
				{notice?.type === "error" && <Banner variant="error" description={notice.message} />}
				<label className="block text-sm"><span className="mb-1 block font-medium">Nombre</span><input autoFocus value={newArchName} onChange={(e) => setNewArchName(e.target.value)} placeholder="N's Zoroark / Munkidori" className={FIELD} /></label>
				<label className="block text-sm"><span className="mb-1 block font-medium">Filtrar Pokémon</span><input value={pokemonFilter} onChange={(e) => setPokemonFilter(e.target.value)} placeholder="Zoroark, Charizard, Mega…" className={FIELD} /></label>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="block text-sm"><span className="mb-1 block font-medium">Pokémon principal</span><select value={primaryPokemon} onChange={(e) => setPrimaryPokemon(e.target.value)} className={FIELD}><option value="">Seleccionar…</option>{filteredPokemon.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}{primaryPokemon && !filteredPokemon.some((item) => item.value === primaryPokemon) && <option value={primaryPokemon}>{pokemonOptions.find((item) => item.value === primaryPokemon)?.label ?? primaryPokemon}</option>}</select></label>
					<label className="block text-sm"><span className="mb-1 block font-medium">Segundo (opcional)</span><select value={secondaryPokemon} onChange={(e) => setSecondaryPokemon(e.target.value)} className={FIELD}><option value="">Ninguno</option>{filteredPokemon.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}{secondaryPokemon && !filteredPokemon.some((item) => item.value === secondaryPokemon) && <option value={secondaryPokemon}>{pokemonOptions.find((item) => item.value === secondaryPokemon)?.label ?? secondaryPokemon}</option>}</select></label>
				</div>
				<div className="flex justify-end gap-2 pt-1">
					<Button type="button" variant="secondary" onClick={() => setCreatingArchetype(false)}>Cancelar</Button>
					<Button type="button" variant="primary" loading={savingArchetype} onClick={() => void createArchetype()}>Crear y seleccionar</Button>
				</div>
			</div>
		</div>}

		<section className={PANEL}>
			<div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold text-kumo-default">Cartas ({total})</h2><span className="text-xs text-kumo-subtle">Arrastra para reordenar · busca para agregar</span></div>
			<div className="mb-3 flex gap-2">
				<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runSearch(); } }} placeholder="Zoroark, Rare Candy…" className={`${FIELD} min-w-0 flex-1`} />
				<Button type="button" variant="primary" loading={searching} onClick={() => void runSearch()}>Buscar</Button>
			</div>
			{status && <p className="mb-3 text-xs text-kumo-subtle">{status}</p>}
			{!!hits.length && <div className="tcg-deck-hits">{hits.map((hit) => <button key={hit.id} type="button" onClick={() => void addCard(hit)} className="tcg-deck-hits__card">{hit.imageUrl ? <img src={hit.imageUrl} alt="" /> : <i>{hit.name}</i>}<span>{hit.name}</span></button>)}</div>}
			{!cards.length ? <p className="text-sm text-kumo-subtle">Todavía no hay cartas. Busca arriba o pega una lista abajo.</p> : <ul className="divide-y divide-kumo-line">{cards.map((card) => <li
				key={card.key}
				onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dropKey !== card.key) setDropKey(card.key); }}
				onDragLeave={() => { if (dropKey === card.key) setDropKey(null); }}
				onDrop={(e) => {
					e.preventDefault();
					const from = e.dataTransfer.getData("text/plain") || dragKey;
					if (from) moveCard(from, card.key);
					setDragKey(null); setDropKey(null);
				}}
				className={`flex items-center gap-2 py-2 sm:gap-3 ${dragKey === card.key ? "opacity-40" : ""} ${dropKey === card.key && dragKey !== card.key ? "bg-kumo-tint" : ""}`}
			>
				<span
					draggable
					role="button"
					tabIndex={0}
					aria-label={`Reordenar ${card.name}`}
					title="Arrastrar para reordenar"
					onDragStart={(e) => {
						e.dataTransfer.setData("text/plain", card.key);
						e.dataTransfer.effectAllowed = "move";
						setDragKey(card.key);
					}}
					onDragEnd={() => { setDragKey(null); setDropKey(null); }}
					className="inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded text-kumo-subtle active:cursor-grabbing hover:bg-kumo-tint hover:text-kumo-default"
				><DotsSixVertical size={18} /></span>
				<div className="size-10 shrink-0 overflow-hidden rounded bg-kumo-tint">{card.imageUrl ? <img src={card.imageUrl.replace("/high.webp", "/low.webp")} alt="" className="size-full object-cover" /> : null}</div>
				<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{card.name}</p><p className="text-xs text-kumo-subtle">{card.category}{card.collectorNumber ? ` · ${card.collectorNumber}` : ""}</p></div>
				<div className="flex items-center gap-1">
					<button type="button" aria-label="Menos" className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-elevated text-sm hover:bg-kumo-tint" onClick={() => setCards((current) => current.map((item) => item.key === card.key ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))}>-</button>
					<span className="w-6 text-center text-sm">{card.quantity}</span>
					<button type="button" aria-label="Más" className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-elevated text-sm hover:bg-kumo-tint" onClick={() => setCards((current) => current.map((item) => item.key === card.key ? { ...item, quantity: Math.min(60, item.quantity + 1) } : item))}>+</button>
				</div>
				<Button type="button" variant="ghost" size="sm" className="!text-kumo-danger" onClick={() => setCards((current) => current.filter((item) => item.key !== card.key))}>Quitar</Button>
			</li>)}</ul>}
		</section>

		<details className={PANEL}>
			<summary className="cursor-pointer text-sm font-medium text-kumo-default">Pegar lista exportada (opcional)</summary>
			<p className="mt-2 text-xs text-kumo-subtle">Si hay cartas en la lista de arriba, se ignorará este texto al guardar. Úsalo para importar desde PTCGL/Limitless cuando la lista esté vacía.</p>
			<textarea value={deckText} onChange={(e) => setDeckText(e.target.value)} rows={8} className={`${AREA} mt-3 font-mono text-xs`} placeholder={"Pokémon: 1\n1 Zoroark PFL 83\n…"} />
		</details>

		<div className="flex flex-wrap gap-2">
			<Button type="button" variant="primary" loading={saving} onClick={() => void save(false)}>Guardar</Button>
			{deck && <Button type="button" variant="secondary" disabled={saving} onClick={() => void save(true)}>Guardar y reanalizar imágenes</Button>}
		</div>
	</div>;
}

function DecksPage() {
	const { data, error, reload } = useAdminData();
	const editor = useEditor(reload);
	const [search, setSearch] = useState("");
	const [format, setFormat] = useState("all");
	const [editing, setEditing] = useState<string | "new" | null>(null);
	const [listNotice, setListNotice] = useState<Notice>(null);
	const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
	const decks = useMemo(() => (data?.decks ?? []).filter((deck) => `${deck.name} ${deck.archetypeName}`.toLowerCase().includes(search.toLowerCase()) && (format === "all" || deck.format === format)), [data, search, format]);
	const editingDeck = editing && editing !== "new" ? data?.decks.find((deck) => deck.id === editing) : undefined;

	const reanalyzeDeck = async (deck: Decklist) => {
		if (reanalyzingId) return;
		setReanalyzingId(deck.id);
		setListNotice({ type: "success", message: `Reanalizando “${deck.name}”…` });
		try {
			const result = await request<{ ok: boolean; error?: string; message?: string }>("decks/reanalyze", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: deck.id }),
			});
			if (!result.ok) { setListNotice({ type: "error", message: result.error || "No se pudo reanalizar" }); return; }
			await reload();
			setListNotice({ type: "success", message: result.message || "Reanálisis listo" });
		} catch (cause) {
			setListNotice({ type: "error", message: cause instanceof Error ? cause.message : "No se pudo reanalizar" });
		} finally {
			setReanalyzingId(null);
		}
	};

	if (editing !== null && data) {
		return <DeckEditor
			deck={editing === "new" ? undefined : editingDeck}
			archetypes={data.archetypes}
			reload={reload}
			onBack={() => { setEditing(null); void reload(); }}
			onSaved={(message) => { setEditing(null); setListNotice({ type: "success", message }); void reload(); }}
		/>;
	}

	if (editor.blocks) return <Editor blocks={editor.blocks} notice={editor.notice} onBack={() => { editor.setBlocks(null); void reload(); }} onAction={(interaction) => void editor.interact(interaction, interaction.type === "form_submit")} />;
	if (!data) return <Loading error={error} />;

	return <div>
		<PageHeader title="Decklists" description="Administra las listas importadas desde Pokémon TCG Live o Limitless." action={() => setEditing("new")} actionLabel="Agregar nueva" />
		<NoticeBanner notice={listNotice ?? editor.notice} />
		<Toolbar search={search} setSearch={setSearch} placeholder="Buscar decklists">
			<Filter value={format} onChange={setFormat} label="Filtrar por formato" options={[{ value: "all", label: "Todos los formatos" }, { value: "standard", label: "Standard" }, { value: "expanded", label: "Expanded" }, { value: "glc", label: "GLC" }, { value: "custom", label: "Personalizado" }]} />
		</Toolbar>
		<AdminTable columns={["Nombre", "Arquetipo", "Base", "Formato", "Cartas", "Imágenes", "Actualizado", "Acciones"]} empty={!decks.length}>
			{decks.map((deck) => <tr key={deck.id} className={ROW}>
				<td className={`${CELL} font-medium text-kumo-default`}>{deck.name}</td>
				<td className={`${CELL} text-kumo-subtle`}>{deck.archetypeName}</td>
				<td className={`${CELL} text-kumo-subtle`}>{deck.isArchetypeBase ? "Sí" : "—"}</td>
				<td className={CELL}><span className="rounded-md bg-kumo-tint px-2 py-1 text-xs text-kumo-default">{deck.format}</span></td>
				<td className={CELL}>{deck.totalCards}</td>
				<td className={`${CELL} text-kumo-subtle`}>{deck.cards.some((card) => !card.displayPrinting.imageUrl) ? "Pendientes" : "Listas"}</td>
				<td className={`${CELL} whitespace-nowrap text-kumo-subtle`}>{new Date(deck.updatedAt).toLocaleDateString()}</td>
				<td className={CELL}><RowActions
					label={deck.name}
					onEdit={() => setEditing(deck.id)}
					onDuplicate={() => void editor.action("duplicate_deck", deck.id)}
					onDelete={() => { if (confirm(`¿Eliminar ${deck.name}?`)) void editor.action("delete_deck", deck.id); }}
					extra={<IconButton
						label={reanalyzingId === deck.id ? `Reanalizando ${deck.name}…` : `Reanalizar imágenes de ${deck.name}`}
						icon={ArrowsClockwise}
						busy={reanalyzingId === deck.id}
						disabled={Boolean(reanalyzingId) && reanalyzingId !== deck.id}
						onClick={() => void reanalyzeDeck(deck)}
					/>}
				/></td>
			</tr>)}
		</AdminTable>
	</div>;
}

function ArchetypesPage() {
	const { data, error, reload } = useAdminData(); const editor = useEditor(reload); const [search, setSearch] = useState("");
	const archetypes = useMemo(() => (data?.archetypes ?? []).filter((item) => `${item.name} ${item.pokemon.map((pokemon) => pokemon.name).join(" ")}`.toLowerCase().includes(search.toLowerCase())), [data, search]);
	if (editor.blocks) return <Editor blocks={editor.blocks} notice={editor.notice} onBack={() => { editor.setBlocks(null); void reload(); }} onAction={(interaction) => void editor.interact(interaction, interaction.type === "form_submit")} />;
	if (!data) return <Loading error={error} />;
	return <div>
		<PageHeader title="Arquetipos" description="Administra arquetipos formados por uno o dos Pokémon." action={() => void editor.open("new_archetype")} actionLabel="Agregar nuevo" />
		<NoticeBanner notice={editor.notice} />
		<Toolbar search={search} setSearch={setSearch} placeholder="Buscar arquetipos" />
		<AdminTable columns={["Nombre", "Pokémon", "Decklists", "Actualizado", "Acciones"]} empty={!archetypes.length}>
			{archetypes.map((item) => <tr key={item.id} className={ROW}>
				<td className={`${CELL} font-medium text-kumo-default`}>{item.name}</td>
				<td className={`${CELL} text-kumo-subtle`}>{item.pokemon.map((pokemon) => pokemon.name).join(" / ")}</td>
				<td className={CELL}>{data.decks.filter((deck) => deck.archetypeId === item.id).length}</td>
				<td className={`${CELL} whitespace-nowrap text-kumo-subtle`}>{new Date(item.updatedAt).toLocaleDateString()}</td>
				<td className={CELL}><RowActions label={item.name} onEdit={() => void editor.open("edit_archetype", item.id)} onDelete={() => { if (confirm(`¿Eliminar ${item.name}?`)) void editor.action("delete_archetype", item.id); }} /></td>
			</tr>)}
		</AdminTable>
	</div>;
}

type RoundDraft = {
	key: string;
	id?: string;
	round: number;
	primaryPokemon: string;
	secondaryPokemon: string;
	specialOutcome: string;
	game1Result: string;
	game1Order: string;
	game2Result: string;
	game2Order: string;
	game3Result: string;
	game3Order: string;
	videoUrl: string;
	notes: string;
	open: boolean;
};

function emptyRound(round: number): RoundDraft {
	return {
		key: `new-${round}-${Date.now()}`, round, primaryPokemon: "", secondaryPokemon: "",
		specialOutcome: "normal", game1Result: "win", game1Order: "unknown",
		game2Result: "none", game2Order: "unknown", game3Result: "none", game3Order: "unknown",
		videoUrl: "", notes: "", open: true,
	};
}

function roundFromMatch(match: MatchResult): RoundDraft {
	const games = match.games ?? [];
	const order = (game?: { wentFirst?: boolean }) => game?.wentFirst === true ? "first" : game?.wentFirst === false ? "second" : "unknown";
	return {
		key: match.id, id: match.id, round: match.round ?? 1,
		primaryPokemon: match.opponentPokemon?.[0] ? String(match.opponentPokemon[0].spriteId ?? match.opponentPokemon[0].speciesId) : "",
		secondaryPokemon: match.opponentPokemon?.[1] ? String(match.opponentPokemon[1].spriteId ?? match.opponentPokemon[1].speciesId) : "",
		specialOutcome: match.specialOutcome ?? "normal",
		game1Result: games[0]?.result ?? "none", game1Order: order(games[0]),
		game2Result: games[1]?.result ?? "none", game2Order: order(games[1]),
		game3Result: games[2]?.result ?? "none", game3Order: order(games[2]),
		videoUrl: match.videoUrl ?? "", notes: match.notes ?? "", open: false,
	};
}

function TournamentEditor({
	tournament, decks, matches, onBack, onSaved, reload,
}: {
	tournament?: TournamentResult;
	decks: Decklist[];
	matches: MatchResult[];
	onBack: () => void;
	onSaved: (message: string) => void;
	reload: () => Promise<void>;
}) {
	const [deckId, setDeckId] = useState(tournament?.deckId ?? decks[0]?.id ?? "");
	const [name, setName] = useState(tournament?.name ?? "");
	const [playedAt, setPlayedAt] = useState(tournament?.playedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
	const [endedAt, setEndedAt] = useState(tournament?.endedAt?.slice(0, 10) ?? "");
	const [category, setCategory] = useState(tournament?.category ?? "other");
	const [format, setFormat] = useState(tournament?.format ?? "standard");
	const [placement, setPlacement] = useState(tournament?.placement ?? "");
	const [visibility, setVisibility] = useState(tournament?.visibility ?? "public");
	const [notes, setNotes] = useState(tournament?.notes ?? "");
	const [tournamentId, setTournamentId] = useState(tournament?.id);
	const [rounds, setRounds] = useState<RoundDraft[]>(() => {
		const existing = matches.filter((match) => match.tournamentId === tournament?.id).sort((a, b) => (a.round ?? 0) - (b.round ?? 0)).map(roundFromMatch);
		return existing.length ? existing : [emptyRound(1)];
	});
	const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[]>([]);
	const [pokemonFilter, setPokemonFilter] = useState("");
	const [notice, setNotice] = useState<Notice>(null);
	const [savingTournament, setSavingTournament] = useState(false);
	const [savingRoundKey, setSavingRoundKey] = useState<string | null>(null);

	useEffect(() => {
		void request<{ items: PokemonOption[] }>("pokemon-options").then((result) => setPokemonOptions(result.items)).catch(() => setNotice({ type: "error", message: "No se pudo cargar Pokémon" }));
	}, []);

	const filteredPokemon = useMemo(() => {
		const needle = pokemonFilter.trim().toLowerCase();
		const pool = needle ? pokemonOptions.filter((item) => item.label.toLowerCase().includes(needle)) : pokemonOptions;
		return pool.slice(0, 80);
	}, [pokemonOptions, pokemonFilter]);

	const updateRound = (key: string, patch: Partial<RoundDraft>) => {
		setRounds((current) => current.map((round) => round.key === key ? { ...round, ...patch } : round));
	};

	const addRound = () => {
		const next = Math.max(0, ...rounds.map((round) => round.round)) + 1;
		setRounds((current) => [...current.map((round) => ({ ...round, open: false })), emptyRound(next)]);
	};

	const saveTournament = async () => {
		if (!deckId || !name.trim() || !playedAt) { setNotice({ type: "error", message: "Completa decklist, nombre y fecha" }); return; }
		setSavingTournament(true); setNotice(null);
		try {
			const result = await request<{ ok: boolean; error?: string; tournament?: TournamentResult }>("tournaments/save", {
				method: "POST", headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: tournamentId, deckId, eventName: name.trim(), playedAt, endedAt: endedAt || undefined, category, format, placement: placement || undefined, notes: notes || undefined, visibility }),
			});
			if (!result.ok || !result.tournament) { setNotice({ type: "error", message: result.error || "No se pudo guardar el torneo" }); return; }
			setTournamentId(result.tournament.id);
			await reload();
			setNotice({ type: "success", message: tournamentId ? "Torneo actualizado" : "Torneo creado — agrega o guarda las rondas abajo" });
		} catch (cause) { setNotice({ type: "error", message: cause instanceof Error ? cause.message : "No se pudo guardar el torneo" }); }
		finally { setSavingTournament(false); }
	};

	const saveRound = async (draft: RoundDraft) => {
		const id = tournamentId;
		if (!id) { setNotice({ type: "error", message: "Guarda el torneo antes de las rondas" }); return; }
		setSavingRoundKey(draft.key); setNotice(null);
		try {
			const result = await request<{ ok: boolean; error?: string; match?: MatchResult }>("rounds/save", {
				method: "POST", headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					id: draft.id, tournamentId: id, round: draft.round,
					opponentPrimaryPokemon: draft.primaryPokemon || undefined,
					opponentSecondaryPokemon: draft.secondaryPokemon || undefined,
					specialOutcome: draft.specialOutcome,
					game1Result: draft.game1Result, game1Order: draft.game1Order,
					game2Result: draft.game2Result, game2Order: draft.game2Order,
					game3Result: draft.game3Result, game3Order: draft.game3Order,
					videoUrl: draft.videoUrl || undefined, notes: draft.notes || undefined,
				}),
			});
			if (!result.ok || !result.match) { setNotice({ type: "error", message: result.error || "No se pudo guardar la ronda" }); return; }
			setRounds((current) => current.map((round) => round.key === draft.key ? { ...roundFromMatch(result.match!), open: false } : round));
			await reload();
			setNotice({ type: "success", message: `Ronda ${result.match.round} guardada` });
		} catch (cause) { setNotice({ type: "error", message: cause instanceof Error ? cause.message : "No se pudo guardar la ronda" }); }
		finally { setSavingRoundKey(null); }
	};

	const deleteRound = async (draft: RoundDraft) => {
		if (!draft.id) { setRounds((current) => current.filter((round) => round.key !== draft.key)); return; }
		if (!confirm(`¿Eliminar ronda ${draft.round}?`)) return;
		try {
			await request<{ ok: boolean }>("rounds/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: draft.id }) });
			setRounds((current) => current.filter((round) => round.key !== draft.key));
			await reload();
			setNotice({ type: "success", message: "Ronda eliminada" });
		} catch { setNotice({ type: "error", message: "No se pudo eliminar la ronda" }); }
	};

	const pokemonSelect = (value: string, onChange: (value: string) => void, allowEmpty = false) => (
		<select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD}>
			<option value="">{allowEmpty ? "Ninguno" : "Seleccionar…"}</option>
			{filteredPokemon.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
			{value && !filteredPokemon.some((item) => item.value === value) && <option value={value}>{pokemonOptions.find((item) => item.value === value)?.label ?? value}</option>}
		</select>
	);

	return <div className="space-y-5">
		<BackLink onClick={onBack} />
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 className="text-2xl font-bold text-kumo-default">{tournamentId ? `Editar: ${name || "torneo"}` : "Nuevo torneo"}</h1>
				<p className="mt-1 text-sm text-kumo-subtle">Guarda el torneo y ve agregando rondas con el botón. El video de cada ronda es opcional (YouTube u otro).</p>
			</div>
			{tournamentId && <Button type="button" variant="secondary" onClick={() => onSaved("Torneo listo")}>Listo</Button>}
		</div>
		<NoticeBanner notice={notice} />

		<section className={`${PANEL} space-y-3`}>
			<h2 className="font-semibold text-kumo-default">Datos del torneo</h2>
			<div className="grid gap-3 md:grid-cols-2">
				<label className="block text-sm md:col-span-2"><span className="mb-1 block font-medium">Decklist</span><select value={deckId} onChange={(e) => setDeckId(e.target.value)} className={FIELD}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label>
				<label className="block text-sm md:col-span-2"><span className="mb-1 block font-medium">Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Random Online, League Challenge…" className={FIELD} /></label>
				<label className="block text-sm"><span className="mb-1 block font-medium">Fecha inicio</span><input type="date" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} className={FIELD} /></label>
				<label className="block text-sm"><span className="mb-1 block font-medium">Fecha término</span><input type="date" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} className={FIELD} /></label>
				<label className="block text-sm"><span className="mb-1 block font-medium">Categoría</span><select value={category} onChange={(e) => setCategory(e.target.value as NonNullable<TournamentResult["category"]>)} className={FIELD}><option value="online">Online</option><option value="league">Liga</option><option value="challenge">League Challenge</option><option value="cup">League Cup</option><option value="regional">Regional</option><option value="international">Internacional</option><option value="casual">Casual</option><option value="other">Otro</option></select></label>
				<label className="block text-sm"><span className="mb-1 block font-medium">Formato</span><select value={format} onChange={(e) => setFormat(e.target.value as Decklist["format"])} className={FIELD}><option value="standard">Standard</option><option value="expanded">Expanded</option><option value="glc">GLC</option><option value="custom">Personalizado</option></select></label>
				<label className="block text-sm"><span className="mb-1 block font-medium">Posición</span><input value={placement} onChange={(e) => setPlacement(e.target.value)} placeholder="Top 8…" className={FIELD} /></label>
				<label className="block text-sm"><span className="mb-1 block font-medium">Visibilidad</span><select value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "private")} className={FIELD}><option value="public">Público</option><option value="private">Privado</option></select></label>
				<label className="block text-sm md:col-span-2"><span className="mb-1 block font-medium">Notas</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={AREA} /></label>
			</div>
			<Button type="button" variant="primary" loading={savingTournament} onClick={() => void saveTournament()}>{tournamentId ? "Guardar torneo" : "Crear torneo"}</Button>
		</section>

		<section className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="font-semibold text-kumo-default">Rondas ({rounds.length})</h2>
				<Button type="button" variant="secondary" icon={Plus} disabled={!tournamentId} onClick={addRound}>Agregar ronda</Button>
			</div>
			{!tournamentId && <Banner variant="secondary" description="Crea el torneo primero para poder guardar rondas." />}
			<label className="block max-w-md text-sm"><span className="mb-1 block font-medium">Filtrar Pokémon rival</span><input value={pokemonFilter} onChange={(e) => setPokemonFilter(e.target.value)} placeholder="Zoroark, Charizard…" className={FIELD} /></label>

			{rounds.map((draft) => <article key={draft.key} className="overflow-hidden rounded-lg border border-kumo-line bg-kumo-base">
				<button type="button" className="flex w-full items-center justify-between gap-3 bg-kumo-recessed px-4 py-3 text-left hover:bg-kumo-tint" onClick={() => updateRound(draft.key, { open: !draft.open })}>
					<span className="font-medium text-kumo-default">Ronda {draft.round}{draft.id ? "" : " · borrador"}{draft.primaryPokemon ? ` · ${pokemonOptions.find((item) => item.value === draft.primaryPokemon)?.label ?? ""}` : ""}</span>
					<span className="text-xs text-kumo-subtle">{draft.open ? "Ocultar" : "Editar"}</span>
				</button>
				{draft.open && <div className="space-y-3 border-t border-kumo-line bg-kumo-base px-4 py-4">
					<div className="grid gap-3 md:grid-cols-3">
						<label className="block text-sm"><span className="mb-1 block font-medium">Nº ronda</span><input type="number" min={1} value={draft.round} onChange={(e) => updateRound(draft.key, { round: Math.max(1, Number(e.target.value) || 1) })} className={FIELD} /></label>
						<label className="block text-sm"><span className="mb-1 block font-medium">Pokémon principal</span>{pokemonSelect(draft.primaryPokemon, (value) => updateRound(draft.key, { primaryPokemon: value }))}</label>
						<label className="block text-sm"><span className="mb-1 block font-medium">Segundo (opcional)</span>{pokemonSelect(draft.secondaryPokemon, (value) => updateRound(draft.key, { secondaryPokemon: value }), true)}</label>
					</div>
					<label className="block max-w-xs text-sm"><span className="mb-1 block font-medium">Resultado especial</span><select value={draft.specialOutcome} onChange={(e) => updateRound(draft.key, { specialOutcome: e.target.value })} className={FIELD}><option value="normal">Partida normal</option><option value="bye">BYE</option><option value="no-show">Rival ausente</option><option value="intentional-draw">Empate intencional</option></select></label>
					{draft.specialOutcome === "normal" && <div className="grid gap-2 md:grid-cols-3">
						{([{
							n: 1, result: draft.game1Result, order: draft.game1Order,
							setResult: (value: string) => updateRound(draft.key, { game1Result: value }),
							setOrder: (value: string) => updateRound(draft.key, { game1Order: value }),
						}, {
							n: 2, result: draft.game2Result, order: draft.game2Order,
							setResult: (value: string) => updateRound(draft.key, { game2Result: value }),
							setOrder: (value: string) => updateRound(draft.key, { game2Order: value }),
						}, {
							n: 3, result: draft.game3Result, order: draft.game3Order,
							setResult: (value: string) => updateRound(draft.key, { game3Result: value }),
							setOrder: (value: string) => updateRound(draft.key, { game3Order: value }),
						}] as const).map((game) => <div key={game.n} className="space-y-2 rounded-lg border border-kumo-line bg-kumo-elevated p-3">
							<p className="text-xs font-medium uppercase tracking-wide text-kumo-subtle">Partida {game.n}</p>
							<select value={game.result} onChange={(e) => game.setResult(e.target.value)} className={FIELD}><option value="none">Sin registrar</option><option value="win">Victoria</option><option value="loss">Derrota</option><option value="draw">Empate</option></select>
							<select value={game.order} onChange={(e) => game.setOrder(e.target.value)} className={FIELD}><option value="unknown">¿Quién empezó?</option><option value="first">Empecé yo</option><option value="second">Empezó rival</option></select>
						</div>)}
					</div>}
					<label className="block text-sm"><span className="mb-1 block font-medium">Video (opcional)</span><input value={draft.videoUrl} onChange={(e) => updateRound(draft.key, { videoUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" className={FIELD} /></label>
					<label className="block text-sm"><span className="mb-1 block font-medium">Notas</span><textarea value={draft.notes} onChange={(e) => updateRound(draft.key, { notes: e.target.value })} rows={2} className={AREA} /></label>
					<div className="flex flex-wrap gap-2">
						<Button type="button" variant="primary" loading={savingRoundKey === draft.key} disabled={!tournamentId} onClick={() => void saveRound(draft)}>Guardar ronda</Button>
						<Button type="button" variant="secondary-destructive" onClick={() => void deleteRound(draft)}>Eliminar</Button>
					</div>
				</div>}
			</article>)}
		</section>
	</div>;
}

function ResultsPage() {
	const { data, error, reload } = useAdminData();
	const editor = useEditor(reload);
	const [search, setSearch] = useState("");
	const [visibility, setVisibility] = useState("all");
	const [editing, setEditing] = useState<string | "new" | null>(null);
	const [listNotice, setListNotice] = useState<Notice>(null);
	const names = useMemo(() => new Map((data?.decks ?? []).map((deck) => [deck.id, deck.name])), [data]);
	const tournaments = useMemo(() => (data?.tournaments ?? []).filter((item) => `${item.name} ${names.get(item.deckId) ?? ""}`.toLowerCase().includes(search.toLowerCase()) && (visibility === "all" || item.visibility === visibility)), [data, names, search, visibility]);
	const editingTournament = editing && editing !== "new" ? data?.tournaments.find((item) => item.id === editing) : undefined;

	if (editing !== null && data) {
		return <TournamentEditor
			tournament={editing === "new" ? undefined : editingTournament}
			decks={data.decks}
			matches={data.matches}
			reload={reload}
			onBack={() => { setEditing(null); void reload(); }}
			onSaved={(message) => { setEditing(null); setListNotice({ type: "success", message }); void reload(); }}
		/>;
	}

	if (editor.blocks) return <Editor blocks={editor.blocks} notice={editor.notice} onBack={() => { editor.setBlocks(null); void reload(); }} onAction={(interaction) => void editor.interact(interaction, interaction.type === "form_submit")} />;
	if (!data) return <Loading error={error} />;

	return <div>
		<PageHeader title="Resultados" description="Torneos, rondas y videos. Agrega rondas desde el editor del torneo." action={() => setEditing("new")} actionLabel="Agregar torneo" />
		<NoticeBanner notice={listNotice ?? editor.notice} />
		<Toolbar search={search} setSearch={setSearch} placeholder="Buscar torneos o decklists">
			<Filter value={visibility} onChange={setVisibility} label="Filtrar por visibilidad" options={[{ value: "all", label: "Todas las visibilidades" }, { value: "public", label: "Público" }, { value: "private", label: "Privado" }]} />
		</Toolbar>
		<AdminTable columns={["Torneo", "Fecha", "Decklist", "Rondas", "Resultado", "Videos", "Visibilidad", "Acciones"]} empty={!tournaments.length}>
			{tournaments.map((item) => {
				const rounds = data.matches.filter((match) => match.tournamentId === item.id);
				const wins = rounds.filter((match) => match.result === "win").length;
				const losses = rounds.filter((match) => match.result === "loss").length;
				const draws = rounds.filter((match) => match.result === "draw").length;
				const videos = rounds.filter((match) => match.videoUrl).length;
				return <tr key={item.id} className={ROW}>
					<td className={`${CELL} font-medium text-kumo-default`}>{item.name}</td>
					<td className={`${CELL} whitespace-nowrap text-kumo-subtle`}>{new Date(item.playedAt).toLocaleDateString()}</td>
					<td className={`${CELL} text-kumo-subtle`}>{names.get(item.deckId) ?? "Decklist"}</td>
					<td className={CELL}>{rounds.length}</td>
					<td className={CELL}>{wins}-{losses}-{draws}</td>
					<td className={`${CELL} text-kumo-subtle`}>{videos || "—"}</td>
					<td className={CELL}><span className="rounded-md bg-kumo-tint px-2 py-1 text-xs text-kumo-default">{item.visibility === "public" ? "Público" : "Privado"}</span></td>
					<td className={CELL}><RowActions
						label={item.name}
						onEdit={() => setEditing(item.id)}
						onDelete={() => { if (confirm(`¿Eliminar ${item.name} y sus rondas?`)) void editor.action("delete_tournament", item.id); }}
						extra={<Button type="button" variant="ghost" size="sm" className="me-1" onClick={() => setEditing(item.id)}>Rondas</Button>}
					/></td>
				</tr>;
			})}
		</AdminTable>
	</div>;
}

function CardsPage() {
	const [search, setSearch] = useState("");
	const [cards, setCards] = useState<Array<{ id: string; name: string; localId: string }>>([]);
	const [loading, setLoading] = useState(false);
	const run = async () => {
		if (!search.trim()) return;
		setLoading(true);
		try {
			const result = await request<{ items: Array<{ id: string; name: string; localId: string }> }>(`cards/search?name=${encodeURIComponent(search)}`);
			setCards(result.items);
		} finally { setLoading(false); }
	};
	return <div>
		<PageHeader title="Buscar cartas" description="Consulta el catálogo TCGDex para insertar cartas en el contenido." />
		<div className="mb-4 flex gap-2">
			<div className="min-w-0 flex-1"><Toolbar search={search} setSearch={setSearch} placeholder="Buscar por nombre de carta" /></div>
			<Button type="button" variant="primary" loading={loading} onClick={() => void run()}>Buscar</Button>
		</div>
		<AdminTable columns={["Carta", "Número", "ID TCGDex"]} empty={!cards.length}>
			{cards.map((card) => <tr key={card.id} className={ROW}>
				<td className={`${CELL} font-medium text-kumo-default`}>{card.name}</td>
				<td className={`${CELL} text-kumo-subtle`}>{card.localId}</td>
				<td className={`${CELL} font-mono text-xs text-kumo-subtle`}>{card.id}</td>
			</tr>)}
		</AdminTable>
	</div>;
}

function TcgShortcutsWidget() {
	const { data, error } = useAdminData();
	const links = [
		{ href: "/_emdash/admin/plugins/pokemon-decklists/decks", label: "Decklists", count: data?.decks.length, hint: "Importar y editar listas" },
		{ href: "/_emdash/admin/plugins/pokemon-decklists/archetypes", label: "Arquetipos", count: data?.archetypes.length, hint: "Pokémon del meta" },
		{ href: "/_emdash/admin/plugins/pokemon-decklists/results", label: "Resultados", count: data?.tournaments.length, hint: "Torneos y rondas" },
	];
	if (!data && error) return <p className="text-sm text-kumo-danger">{error}</p>;
	return <div className="grid gap-3 sm:grid-cols-3">
		{links.map((link) => <a key={link.href} href={link.href} className="rounded-lg border border-kumo-line bg-kumo-base p-4 transition hover:border-kumo-brand hover:bg-kumo-tint">
			<div className="flex items-baseline justify-between gap-2">
				<span className="font-semibold text-kumo-default">{link.label}</span>
				<span className="text-2xl font-semibold tabular-nums text-kumo-brand">{data ? link.count : "·"}</span>
			</div>
			<p className="mt-1 text-xs text-kumo-subtle">{link.hint}</p>
		</a>)}
	</div>;
}

export const pages = { "/decks": DecksPage, "/archetypes": ArchetypesPage, "/results": ResultsPage, "/cards": CardsPage };
export const widgets = { "tcg-shortcuts": TcgShortcutsWidget };
