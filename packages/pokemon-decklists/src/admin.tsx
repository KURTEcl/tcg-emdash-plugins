import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@emdash-cms/admin";
import { BlockRenderer } from "@emdash-cms/blocks";
import type { Block, BlockInteraction } from "@emdash-cms/blocks";
import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { Copy } from "@phosphor-icons/react/Copy";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Plus } from "@phosphor-icons/react/Plus";
import { Trash } from "@phosphor-icons/react/Trash";
import type { Archetype, CardCategory, DeckCard, Decklist, MatchResult, TournamentResult } from "./domain.js";

const API = "/_emdash/api/plugins/pokemon-decklists";
type AdminData = { decks: Decklist[]; archetypes: Archetype[]; tournaments: TournamentResult[]; matches: MatchResult[] };
type Notice = { message: string; type: "success" | "error" } | null;

type PickerCard = { id: string; name: string; number: string; imageUrl: string };

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

function installCardPickerEnhancer() {
	if (typeof document === "undefined" || document.documentElement.dataset.tcgCardPicker === "ready") return;
	document.documentElement.dataset.tcgCardPicker = "ready";
	const style = document.createElement("style");
	style.textContent = `.tcg-picker{margin-bottom:1rem}.tcg-picker__search{display:flex;gap:.5rem}.tcg-picker__search input{min-width:0;flex:1;height:2.5rem;border:1px solid var(--kumo-line);border-radius:.375rem;background:transparent;padding:0 .75rem;color:inherit}.tcg-picker__search button{height:2.5rem;border-radius:.375rem;background:var(--kumo-accent);padding:0 1rem;color:white;font-size:.875rem;font-weight:600}.tcg-picker__status{margin:.7rem 0;color:var(--kumo-subtle);font-size:.8rem}.tcg-picker__grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.6rem}.tcg-picker__card{position:relative;border:2px solid transparent;border-radius:.55rem;padding:.15rem;background:transparent;color:inherit;text-align:left;cursor:pointer}.tcg-picker__card img{display:block;width:100%;aspect-ratio:245/342;border-radius:.38rem;object-fit:cover}.tcg-picker__card span{display:block;margin-top:.25rem;overflow:hidden;font-size:.68rem;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}.tcg-picker__card.is-selected{border-color:var(--kumo-accent);background:color-mix(in srgb,var(--kumo-accent) 12%,transparent)}.tcg-picker__card.is-selected:after{content:'✓';position:absolute;top:.4rem;right:.4rem;display:grid;width:1.5rem;height:1.5rem;place-items:center;border-radius:999px;background:var(--kumo-accent);color:white;font-weight:800}.tcg-picker__selected{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.75rem}.tcg-picker__selected button{display:inline-flex;align-items:center;gap:.4rem;max-width:100%;border:1px solid var(--kumo-line);border-radius:999px;background:var(--kumo-elevated);padding:.3rem .55rem;color:inherit;font-size:.75rem;cursor:pointer}.tcg-picker__selected button:hover{border-color:var(--kumo-accent)}.tcg-picker__selected button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tcg-picker__selected button b{color:var(--kumo-subtle);font-size:1rem;line-height:.75}@media(max-width:640px){.tcg-picker__grid{grid-template-columns:repeat(3,minmax(0,1fr))}}`;
	document.head.append(style);

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
		const render = (cards: PickerCard[]) => { currentCards = cards; grid.replaceChildren(...cards.map((card) => { const item = document.createElement("button"); item.type = "button"; item.className = `tcg-picker__card${selected.has(card.id) ? " is-selected" : ""}`; item.title = `${card.name} · ${card.id}`; item.setAttribute("aria-pressed", String(selected.has(card.id))); const image = document.createElement("img"); image.src = card.imageUrl; image.alt = ""; const label = document.createElement("span"); label.textContent = `${card.name} · ${card.number}`; item.append(image, label); item.addEventListener("click", () => { if (selected.has(card.id)) selected.delete(card.id); else { if (!multiple) selected.clear(); if (selected.size < 4) selected.add(card.id); } render(cards); sync(); }); return item; })); };
		const runSearch = async () => { const query = search.value.trim(); if (query.length < 2) { status.textContent = "Escribe al menos dos caracteres."; return; } button.disabled = true; status.textContent = "Buscando…"; try { const response = await apiFetch(`${API}/card-picker-search?q=${encodeURIComponent(query)}`); if (!response.ok) throw new Error(); const body = await response.json() as { data: { items: PickerCard[] } }; render(body.data.items); status.textContent = body.data.items.length ? "Selecciona una carta." : "No se encontraron cartas."; } catch { status.textContent = "No se pudo consultar TCGDex."; } finally { button.disabled = false; } };
		button.addEventListener("click", () => void runSearch()); search.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void runSearch(); } }); sync();
		}
	};
	new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true }); enhance();
}

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
		<div><h1 className="text-2xl font-semibold text-kumo-default">{title}</h1><p className="mt-1 text-sm text-kumo-subtle">{description}</p></div>
		{action && <button type="button" onClick={action} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-kumo-accent px-3 text-sm font-medium text-white hover:opacity-90"><Plus size={16} />{actionLabel}</button>}
	</div>;
}

function Toolbar({ search, setSearch, placeholder, children }: { search: string; setSearch: (value: string) => void; placeholder: string; children?: React.ReactNode }) {
	return <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
		<label className="relative min-w-0 flex-1"><span className="sr-only">Buscar</span><MagnifyingGlass className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-kumo-subtle" size={16} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={placeholder} className="h-9 w-full rounded-md border border-kumo-line bg-kumo-elevated ps-9 pe-3 text-sm text-kumo-default outline-none focus:border-kumo-accent" /></label>
		{children}
	</div>;
}

function Filter({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: Array<{ value: string; label: string }> }) {
	return <label><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-kumo-line bg-kumo-elevated px-3 text-sm text-kumo-default outline-none focus:border-kumo-accent">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function AdminTable({ columns, children, empty }: { columns: string[]; children: React.ReactNode; empty?: boolean }) {
	if (empty) return <div className="rounded-lg border border-dashed border-kumo-line px-6 py-12 text-center text-sm text-kumo-subtle">No hay elementos que coincidan con los filtros.</div>;
	return <div className="overflow-x-auto rounded-lg border border-kumo-line bg-kumo-elevated"><table className="w-full text-start text-sm"><thead><tr className="border-b border-kumo-line">{columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3 text-start font-medium text-kumo-subtle">{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function RowActions({ label, onEdit, onDuplicate, onDelete, extra }: { label: string; onEdit: () => void; onDuplicate?: () => void; onDelete: () => void; extra?: React.ReactNode }) {
	return <div className="flex items-center justify-end gap-1">{extra}<IconButton label={`Editar ${label}`} onClick={onEdit}><PencilSimple size={17} /></IconButton>{onDuplicate && <IconButton label={`Duplicar ${label}`} onClick={onDuplicate}><Copy size={17} /></IconButton>}<IconButton danger label={`Eliminar ${label}`} onClick={onDelete}><Trash size={17} /></IconButton></div>;
}

function IconButton({ label, onClick, children, danger = false, disabled = false, busy = false }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean; busy?: boolean }) {
	return <button type="button" aria-label={label} title={label} disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick} className={`inline-flex size-8 items-center justify-center rounded-md hover:bg-kumo-tint disabled:pointer-events-none disabled:opacity-40 ${danger ? "text-kumo-danger" : "text-kumo-subtle hover:text-kumo-default"} ${busy ? "text-kumo-accent" : ""}`}>{busy ? <ArrowsClockwise size={17} className="animate-spin" /> : children}</button>;
}

function NoticeBanner({ notice }: { notice: Notice }) { return notice ? <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${notice.type === "error" ? "border-kumo-danger/40 text-kumo-danger" : "border-kumo-line text-kumo-default"}`}>{notice.message}</div> : null; }
function Loading({ error }: { error?: string }) { return <div className="py-16 text-center text-sm text-kumo-subtle">{error || "Cargando…"}</div>; }

function Editor({ blocks, notice, onAction, onBack }: { blocks: Block[]; notice: Notice; onAction: (interaction: BlockInteraction) => void; onBack: () => void }) {
	return <div><button type="button" onClick={onBack} className="mb-4 text-sm text-kumo-subtle hover:text-kumo-default">← Volver al listado</button><NoticeBanner notice={notice} /><BlockRenderer blocks={blocks} onAction={onAction} /></div>;
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

	const total = cards.reduce((sum, card) => sum + card.quantity, 0);
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
		<button type="button" onClick={onBack} className="text-sm text-kumo-subtle hover:text-kumo-default">← Volver al listado</button>
		<div><h1 className="text-2xl font-semibold">{deck ? `Editar: ${deck.name}` : "Nueva decklist"}</h1><p className="mt-1 text-sm text-kumo-subtle">Busca y quita cartas, o pega una lista exportada. Marca “lista base” si es la referencia del arquetipo.</p></div>
		<NoticeBanner notice={notice} />
		<div className="grid gap-4 md:grid-cols-2">
			<label className="block text-sm"><span className="mb-1 block font-medium">Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-full rounded-md border border-kumo-line bg-kumo-elevated px-3" /></label>
			<div className="block text-sm">
				<div className="mb-1 flex items-center justify-between gap-2">
					<span className="font-medium">Arquetipo</span>
					<button type="button" onClick={() => void openCreateArchetype()} className="text-xs font-medium text-kumo-accent hover:underline">+ Crear arquetipo</button>
				</div>
				<select value={archetypeId} onChange={(e) => setArchetypeId(e.target.value)} className="h-9 w-full rounded-md border border-kumo-line bg-kumo-elevated px-3">
					{!archetypes.length && <option value="">Sin arquetipos — créalo con el botón</option>}
					{archetypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
				</select>
			</div>
			<label className="block text-sm"><span className="mb-1 block font-medium">Formato</span><select value={format} onChange={(e) => setFormat(e.target.value as Decklist["format"])} className="h-9 w-full rounded-md border border-kumo-line bg-kumo-elevated px-3"><option value="standard">Standard</option><option value="expanded">Expanded</option><option value="glc">GLC</option><option value="custom">Personalizado</option></select></label>
			<label className="flex items-start gap-3 rounded-md border border-kumo-line bg-kumo-elevated p-3 text-sm"><input type="checkbox" checked={isArchetypeBase} onChange={(e) => setIsArchetypeBase(e.target.checked)} className="mt-0.5" /><span><strong className="block">Lista base del arquetipo</strong><span className="text-kumo-subtle">No aparece en /decklists ni en la tabla del arquetipo. Solo una base por arquetipo.</span></span></label>
		</div>

		{creatingArchetype && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
			<button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/50" onClick={() => setCreatingArchetype(false)} />
			<div role="dialog" aria-modal="true" aria-labelledby="new-archetype-title" className="relative z-10 w-full max-w-lg rounded-lg border border-kumo-line bg-kumo-base p-5 shadow-lg space-y-3" onKeyDown={(e) => { if (e.key === "Escape") setCreatingArchetype(false); }}>
				<div><h2 id="new-archetype-title" className="text-lg font-semibold">Nuevo arquetipo</h2><p className="text-xs text-kumo-subtle">Se crea y queda seleccionado para esta decklist.</p></div>
				{notice?.type === "error" && <p className="rounded-md border border-kumo-danger/40 px-3 py-2 text-sm text-kumo-danger">{notice.message}</p>}
				<label className="block text-sm"><span className="mb-1 block font-medium">Nombre</span><input autoFocus value={newArchName} onChange={(e) => setNewArchName(e.target.value)} placeholder="N's Zoroark / Munkidori" className="h-9 w-full rounded-md border border-kumo-line bg-kumo-elevated px-3" /></label>
				<label className="block text-sm"><span className="mb-1 block font-medium">Filtrar Pokémon</span><input value={pokemonFilter} onChange={(e) => setPokemonFilter(e.target.value)} placeholder="Zoroark, Charizard, Mega…" className="h-9 w-full rounded-md border border-kumo-line bg-kumo-elevated px-3" /></label>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="block text-sm"><span className="mb-1 block font-medium">Pokémon principal</span><select value={primaryPokemon} onChange={(e) => setPrimaryPokemon(e.target.value)} className="h-9 w-full rounded-md border border-kumo-line bg-kumo-elevated px-3"><option value="">Seleccionar…</option>{filteredPokemon.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}{primaryPokemon && !filteredPokemon.some((item) => item.value === primaryPokemon) && <option value={primaryPokemon}>{pokemonOptions.find((item) => item.value === primaryPokemon)?.label ?? primaryPokemon}</option>}</select></label>
					<label className="block text-sm"><span className="mb-1 block font-medium">Segundo (opcional)</span><select value={secondaryPokemon} onChange={(e) => setSecondaryPokemon(e.target.value)} className="h-9 w-full rounded-md border border-kumo-line bg-kumo-elevated px-3"><option value="">Ninguno</option>{filteredPokemon.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}{secondaryPokemon && !filteredPokemon.some((item) => item.value === secondaryPokemon) && <option value={secondaryPokemon}>{pokemonOptions.find((item) => item.value === secondaryPokemon)?.label ?? secondaryPokemon}</option>}</select></label>
				</div>
				<div className="flex justify-end gap-2 pt-1">
					<button type="button" onClick={() => setCreatingArchetype(false)} className="h-9 rounded-md border border-kumo-line px-4 text-sm">Cancelar</button>
					<button type="button" disabled={savingArchetype} onClick={() => void createArchetype()} className="h-9 rounded-md bg-kumo-accent px-4 text-sm font-medium text-white disabled:opacity-60">{savingArchetype ? "Creando…" : "Crear y seleccionar"}</button>
				</div>
			</div>
		</div>}

		<section className="rounded-lg border border-kumo-line bg-kumo-elevated p-4">
			<div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">Cartas ({total})</h2><span className="text-xs text-kumo-subtle">Busca para agregar · ajusta cantidad o quita</span></div>
			<div className="mb-3 flex gap-2"><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runSearch(); } }} placeholder="Zoroark, Rare Candy…" className="h-9 min-w-0 flex-1 rounded-md border border-kumo-line bg-transparent px-3 text-sm" /><button type="button" disabled={searching} onClick={() => void runSearch()} className="h-9 rounded-md bg-kumo-accent px-3 text-sm font-medium text-white">{searching ? "…" : "Buscar"}</button></div>
			{status && <p className="mb-3 text-xs text-kumo-subtle">{status}</p>}
			{!!hits.length && <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5">{hits.map((hit) => <button key={hit.id} type="button" onClick={() => void addCard(hit)} className="rounded-md border border-kumo-line p-1 text-left hover:border-kumo-accent"><img src={hit.imageUrl} alt="" className="aspect-[245/342] w-full rounded object-cover" /><span className="mt-1 block truncate text-[11px]">{hit.name}</span></button>)}</div>}
			{!cards.length ? <p className="text-sm text-kumo-subtle">Todavía no hay cartas. Busca arriba o pega una lista abajo.</p> : <ul className="divide-y divide-kumo-line">{cards.map((card) => <li key={card.key} className="flex items-center gap-3 py-2"><div className="size-10 shrink-0 overflow-hidden rounded bg-kumo-tint">{card.imageUrl ? <img src={card.imageUrl.replace("/high.webp", "/low.webp")} alt="" className="size-full object-cover" /> : null}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{card.name}</p><p className="text-xs text-kumo-subtle">{card.category}{card.collectorNumber ? ` · ${card.collectorNumber}` : ""}</p></div><div className="flex items-center gap-1"><button type="button" className="size-7 rounded border border-kumo-line" onClick={() => setCards((current) => current.map((item) => item.key === card.key ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))}>-</button><span className="w-6 text-center text-sm">{card.quantity}</span><button type="button" className="size-7 rounded border border-kumo-line" onClick={() => setCards((current) => current.map((item) => item.key === card.key ? { ...item, quantity: Math.min(60, item.quantity + 1) } : item))}>+</button></div><button type="button" className="text-xs text-kumo-danger" onClick={() => setCards((current) => current.filter((item) => item.key !== card.key))}>Quitar</button></li>)}</ul>}
		</section>

		<details className="rounded-lg border border-kumo-line bg-kumo-elevated p-4"><summary className="cursor-pointer text-sm font-medium">Pegar lista exportada (opcional)</summary><p className="mt-2 text-xs text-kumo-subtle">Si hay cartas en la lista de arriba, se ignorará este texto al guardar. Úsalo para importar desde PTCGL/Limitless cuando la lista esté vacía.</p><textarea value={deckText} onChange={(e) => setDeckText(e.target.value)} rows={8} className="mt-3 w-full rounded-md border border-kumo-line bg-transparent p-3 font-mono text-xs" placeholder={"Pokémon: 1\n1 Zoroark PFL 83\n…"} /></details>

		<div className="flex flex-wrap gap-2">
			<button type="button" disabled={saving} onClick={() => void save(false)} className="h-9 rounded-md bg-kumo-accent px-4 text-sm font-medium text-white disabled:opacity-60">{saving ? "Guardando…" : "Guardar"}</button>
			{deck && <button type="button" disabled={saving} onClick={() => void save(true)} className="h-9 rounded-md border border-kumo-line px-4 text-sm">Guardar y reanalizar imágenes</button>}
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
			{decks.map((deck) => <tr key={deck.id} className="border-b border-kumo-line last:border-0">
				<td className="px-4 py-3 font-medium text-kumo-default">{deck.name}</td>
				<td className="px-4 py-3 text-kumo-subtle">{deck.archetypeName}</td>
				<td className="px-4 py-3 text-kumo-subtle">{deck.isArchetypeBase ? "Sí" : "—"}</td>
				<td className="px-4 py-3"><span className="rounded-full bg-kumo-tint px-2 py-1 text-xs">{deck.format}</span></td>
				<td className="px-4 py-3">{deck.totalCards}</td>
				<td className="px-4 py-3 text-kumo-subtle">{deck.cards.some((card) => !card.displayPrinting.imageUrl) ? "Pendientes" : "Listas"}</td>
				<td className="whitespace-nowrap px-4 py-3 text-kumo-subtle">{new Date(deck.updatedAt).toLocaleDateString()}</td>
				<td className="px-4 py-3"><RowActions
					label={deck.name}
					onEdit={() => setEditing(deck.id)}
					onDuplicate={() => void editor.action("duplicate_deck", deck.id)}
					onDelete={() => { if (confirm(`¿Eliminar ${deck.name}?`)) void editor.action("delete_deck", deck.id); }}
					extra={<IconButton
						label={reanalyzingId === deck.id ? `Reanalizando ${deck.name}…` : `Reanalizar imágenes de ${deck.name}`}
						busy={reanalyzingId === deck.id}
						disabled={Boolean(reanalyzingId) && reanalyzingId !== deck.id}
						onClick={() => void reanalyzeDeck(deck)}
					><ArrowsClockwise size={17} /></IconButton>}
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
	return <div><PageHeader title="Arquetipos" description="Administra arquetipos formados por uno o dos Pokémon." action={() => void editor.open("new_archetype")} actionLabel="Agregar nuevo" /><NoticeBanner notice={editor.notice} /><Toolbar search={search} setSearch={setSearch} placeholder="Buscar arquetipos" /><AdminTable columns={["Nombre", "Pokémon", "Decklists", "Actualizado", "Acciones"]} empty={!archetypes.length}>{archetypes.map((item) => <tr key={item.id} className="border-b border-kumo-line last:border-0"><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3 text-kumo-subtle">{item.pokemon.map((pokemon) => pokemon.name).join(" / ")}</td><td className="px-4 py-3">{data.decks.filter((deck) => deck.archetypeId === item.id).length}</td><td className="whitespace-nowrap px-4 py-3 text-kumo-subtle">{new Date(item.updatedAt).toLocaleDateString()}</td><td className="px-4 py-3"><RowActions label={item.name} onEdit={() => void editor.open("edit_archetype", item.id)} onDelete={() => { if (confirm(`¿Eliminar ${item.name}?`)) void editor.action("delete_archetype", item.id); }} /></td></tr>)}</AdminTable></div>;
}

function ResultsPage() {
	const { data, error, reload } = useAdminData(); const editor = useEditor(reload); const [search, setSearch] = useState(""); const [visibility, setVisibility] = useState("all");
	const names = useMemo(() => new Map((data?.decks ?? []).map((deck) => [deck.id, deck.name])), [data]);
	const tournaments = useMemo(() => (data?.tournaments ?? []).filter((item) => `${item.name} ${names.get(item.deckId) ?? ""}`.toLowerCase().includes(search.toLowerCase()) && (visibility === "all" || item.visibility === visibility)), [data, names, search, visibility]);
	if (editor.blocks) return <Editor blocks={editor.blocks} notice={editor.notice} onBack={() => { editor.setBlocks(null); void reload(); }} onAction={(interaction) => void editor.interact(interaction, interaction.type === "form_submit" && interaction.action_id !== "save_tournament")} />;
	if (!data) return <Loading error={error} />;
	return <div><PageHeader title="Resultados" description="Administra torneos y sus rondas siguiendo el modelo de Training Court." action={() => void editor.open("new_tournament")} actionLabel="Agregar torneo" /><NoticeBanner notice={editor.notice} /><Toolbar search={search} setSearch={setSearch} placeholder="Buscar torneos o decklists"><Filter value={visibility} onChange={setVisibility} label="Filtrar por visibilidad" options={[{ value: "all", label: "Todas las visibilidades" }, { value: "public", label: "Público" }, { value: "private", label: "Privado" }]} /></Toolbar><AdminTable columns={["Torneo", "Fecha", "Decklist", "Rondas", "Resultado", "Visibilidad", "Acciones"]} empty={!tournaments.length}>{tournaments.map((item) => { const rounds = data.matches.filter((match) => match.tournamentId === item.id); const wins = rounds.filter((match) => match.result === "win").length; const losses = rounds.filter((match) => match.result === "loss").length; const draws = rounds.filter((match) => match.result === "draw").length; return <tr key={item.id} className="border-b border-kumo-line last:border-0"><td className="px-4 py-3 font-medium">{item.name}</td><td className="whitespace-nowrap px-4 py-3 text-kumo-subtle">{new Date(item.playedAt).toLocaleDateString()}</td><td className="px-4 py-3 text-kumo-subtle">{names.get(item.deckId) ?? "Decklist"}</td><td className="px-4 py-3">{rounds.length}</td><td className="px-4 py-3">{wins}-{losses}-{draws}</td><td className="px-4 py-3"><span className="rounded-full bg-kumo-tint px-2 py-1 text-xs">{item.visibility === "public" ? "Público" : "Privado"}</span></td><td className="px-4 py-3"><RowActions label={item.name} onEdit={() => void editor.open("edit_tournament", item.id)} onDelete={() => { if (confirm(`¿Eliminar ${item.name} y sus rondas?`)) void editor.action("delete_tournament", item.id); }} extra={<button type="button" onClick={() => void editor.open("add_round", item.id)} className="me-1 rounded-md px-2 py-1 text-xs text-kumo-subtle hover:bg-kumo-tint">Agregar ronda</button>} /></td></tr>; })}</AdminTable></div>;
}

function CardsPage() {
	const [search, setSearch] = useState(""); const [cards, setCards] = useState<Array<{ id: string; name: string; localId: string }>>([]); const [loading, setLoading] = useState(false); const run = async () => { if (!search.trim()) return; setLoading(true); try { const result = await request<{ items: Array<{ id: string; name: string; localId: string }> }>(`cards/search?name=${encodeURIComponent(search)}`); setCards(result.items); } finally { setLoading(false); } };
	return <div><PageHeader title="Buscar cartas" description="Consulta el catálogo TCGDex para insertar cartas en el contenido." /><div className="mb-4 flex gap-2"><div className="flex-1"><Toolbar search={search} setSearch={setSearch} placeholder="Buscar por nombre de carta" /></div><button type="button" onClick={() => void run()} className="h-9 rounded-md bg-kumo-accent px-4 text-sm font-medium text-white">{loading ? "Buscando…" : "Buscar"}</button></div><AdminTable columns={["Carta", "Número", "ID TCGDex"]} empty={!cards.length}>{cards.map((card) => <tr key={card.id} className="border-b border-kumo-line last:border-0"><td className="px-4 py-3 font-medium">{card.name}</td><td className="px-4 py-3 text-kumo-subtle">{card.localId}</td><td className="px-4 py-3 font-mono text-xs text-kumo-subtle">{card.id}</td></tr>)}</AdminTable></div>;
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
		{links.map((link) => <a key={link.href} href={link.href} className="rounded-md border border-kumo-line bg-kumo-elevated p-4 transition hover:border-kumo-accent hover:bg-kumo-tint">
			<div className="flex items-baseline justify-between gap-2"><span className="font-semibold text-kumo-default">{link.label}</span><span className="text-2xl font-semibold tabular-nums text-kumo-accent">{data ? link.count : "·"}</span></div>
			<p className="mt-1 text-xs text-kumo-subtle">{link.hint}</p>
		</a>)}
	</div>;
}

export const pages = { "/decks": DecksPage, "/archetypes": ArchetypesPage, "/results": ResultsPage, "/cards": CardsPage };
export const widgets = { "tcg-shortcuts": TcgShortcutsWidget };
