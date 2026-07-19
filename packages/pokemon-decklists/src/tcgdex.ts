import dns from "node:dns";
import type { CardCategory } from "./domain.js";
import { chooseBasicPrinting, choosePreferredPrinting, type FunctionalCard } from "./normalizer.js";

const API_BASE = "https://api.tcgdex.net/v2";

// ponytail: TCGdex AAAA often times out on some networks; ipv4first avoids ConnectTimeout.
dns.setDefaultResultOrder("ipv4first");

export type CardBrief = { id: string; localId: string | number; name: string; image?: string };

/**
 * Exact name match (case-insensitive).
 * Avoid TCGdex `eq:` — it is case-sensitive (`eq:alakazam` → []).
 */
export async function searchCards(fetcher: typeof fetch, language: string, name: string) {
	const url = `${API_BASE}/${safeLanguage(language)}/cards?name=${encodeURIComponent(name)}`;
	const response = await fetcher(url, { headers: { accept: "application/json" } });
	if (!response.ok) throw new Error(`TCGDex respondió ${response.status}`);
	const needle = name.trim().toLowerCase();
	return (await response.json() as CardBrief[]).filter((card) => card.name.toLowerCase() === needle);
}

export async function searchCardCatalog(fetcher: typeof fetch, language: string, query: string) {
	const url = `${API_BASE}/${safeLanguage(language)}/cards?name=${encodeURIComponent(query)}`;
	const response = await fetcher(url, { headers: { accept: "application/json" } });
	if (!response.ok) throw new Error(`TCGDex respondió ${response.status}`);
	return await response.json() as CardBrief[];
}

/**
 * Broad queries like "energy" return hundreds of kit/basic rows without art first.
 * Collapse to one row per name (prefer a printing with image) before limiting.
 */
export function pickCatalogResults(cards: CardBrief[], limit = 50) {
	const byName = new Map<string, CardBrief>();
	for (const card of cards) {
		const key = card.name.trim().toLowerCase();
		const previous = byName.get(key);
		if (!previous || (!previous.image && card.image)) byName.set(key, card);
	}
	return [...byName.values()]
		.sort((a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image)) || a.name.localeCompare(b.name))
		.slice(0, limit);
}

export async function getCard(fetcher: typeof fetch, language: string, id: string) {
	const response = await fetcher(`${API_BASE}/${safeLanguage(language)}/cards/${encodeURIComponent(id)}`, {
		headers: { accept: "application/json" },
	});
	if (!response.ok) return null;
	return await response.json() as FunctionalCard;
}

async function getSetMeta(fetcher: typeof fetch, language: string, id: string) {
	const response = await fetcher(`${API_BASE}/${safeLanguage(language)}/sets/${encodeURIComponent(id)}`, {
		headers: { accept: "application/json" },
	});
	if (!response.ok) return undefined;
	const set = await response.json() as { abbreviation?: { official?: string }; releaseDate?: string };
	return {
		abbreviation: set.abbreviation?.official?.trim().toUpperCase(),
		releaseDate: set.releaseDate?.trim() || undefined,
	};
}

async function getSetAbbreviation(fetcher: typeof fetch, language: string, id: string) {
	return (await getSetMeta(fetcher, language, id))?.abbreviation;
}

async function hydrateSetMeta(fetcher: typeof fetch, language: string, cards: FunctionalCard[]) {
	const ids = [...new Set(cards.map((card) => card.set?.id).filter((id): id is string => Boolean(id)))];
	const meta = new Map<string, { abbreviation?: string; releaseDate?: string }>();
	await Promise.all(ids.map(async (id) => {
		const value = await getSetMeta(fetcher, language, id);
		if (value) meta.set(id, value);
	}));
	for (const card of cards) {
		const id = card.set?.id;
		if (!id) continue;
		const value = meta.get(id);
		if (!value) continue;
		card.set = { ...card.set!, abbreviation: value.abbreviation, releaseDate: value.releaseDate };
	}
	return cards;
}

/**
 * Pokémon: match by name + collector number (set disambiguates collisions).
 * Trainers / energies: match by name only and pick a basic printing with art.
 */
export async function resolveBasicPrinting(
	fetcher: typeof fetch,
	language: string,
	name: string,
	collectorNumber?: string,
	setCode?: string,
	format = "standard",
	options?: { category?: CardCategory },
) {
	const canonicalName = canonicalCardName(name);
	const brief = await searchCards(fetcher, language, canonicalName);
	const nameOnly = options?.category === "trainer"
		|| options?.category === "energy"
		|| isBasicEnergy(name);

	if (nameOnly) return resolveByName(fetcher, language, brief, format, name, options?.category);

	let possibleOriginals = collectorNumber
		? brief.filter((card) => equivalentCollectorNumber(card.localId, collectorNumber))
		: brief;

	if (possibleOriginals.length > 1 && setCode) {
		const expectedSetCode = setCode.trim().toUpperCase();
		const matchingSet = (await Promise.all(possibleOriginals.map(async (card) => {
			const detail = await getCard(fetcher, language, card.id);
			if (!detail?.set?.id) return null;
			const abbreviation = await getSetAbbreviation(fetcher, language, detail.set.id);
			if (abbreviation === expectedSetCode) return card;
			if (detail.set.id.toUpperCase() === expectedSetCode) return card;
			return null;
		}))).filter((card): card is typeof possibleOriginals[number] => card !== null);
		if (matchingSet.length) possibleOriginals = matchingSet;
	}

	// Direct id hint: MEP 003 → mep-003
	if (possibleOriginals.length !== 1 && setCode && collectorNumber) {
		const expected = setCode.trim().toLowerCase();
		const padded = padCollectorForSetId(collectorNumber);
		const byId = brief.filter((card) =>
			card.id.toLowerCase() === `${expected}-${padded}`
			|| card.id.toLowerCase() === `${expected}-${collectorNumber.toLowerCase()}`,
		);
		if (byId.length === 1) possibleOriginals = byId;
	}

	if (!possibleOriginals.length) return { status: "unresolved" as const, candidates: brief };

	const originalBrief = possibleOriginals.length === 1
		? possibleOriginals[0]
		: possibleOriginals.find((card) => card.image) ?? possibleOriginals[0];

	const details = await hydrateSetMeta(
		fetcher,
		language,
		(await Promise.all(brief.map((card) => getCard(fetcher, language, card.id))))
			.filter((card): card is FunctionalCard => card !== null),
	);
	const original = details.find((card) => card.id === originalBrief.id) ?? await getCard(fetcher, language, originalBrief.id);
	if (!original) return { status: "unresolved" as const, candidates: brief };

	let selected = possibleOriginals.length === 1
		? original
		: chooseBasicPrinting(original, details, format);

	// Promo rows in TCGDex often have no image; borrow art from the set reprint
	// with the same attacks/abilities (MEP Alakazam 003 → me01-056).
	if (!selected.image) {
		const withImage = details.filter((card) => card.image);
		const art = withImage.length ? chooseBasicPrinting(selected, withImage, format) : selected;
		if (art.image) {
			return {
				status: "basic-equivalent" as const,
				original: withoutCommercialData(original),
				selected: withoutCommercialData(art),
			};
		}
	}

	if (possibleOriginals.length !== 1 && !setCode) {
		return { status: "unresolved" as const, candidates: brief };
	}

	return {
		status: selected.id === original.id ? "exact" as const : "basic-equivalent" as const,
		original: withoutCommercialData(original),
		selected: withoutCommercialData(selected),
	};
}

async function resolveByName(
	fetcher: typeof fetch,
	language: string,
	brief: Array<{ id: string; localId: string | number; name: string; image?: string }>,
	format: string,
	rawName: string,
	category?: CardCategory,
) {
	if (!brief.length) return { status: "unresolved" as const, candidates: brief };
	const details = await hydrateSetMeta(
		fetcher,
		language,
		(await Promise.all(brief.map((card) => getCard(fetcher, language, card.id))))
			.filter((card): card is FunctionalCard => card !== null),
	);
	const typed = filterEnergyCandidates(details, rawName, category);
	// Prefer art when available, but never let image-only pool mix Special into Basic Energy
	const withImage = typed.filter((card) => card.image);
	const pool = withImage.length ? withImage : typed;
	if (!pool.length) return { status: "unresolved" as const, candidates: brief };
	// Trainers/energies: newest basic print — do not anchor to the oldest effect-text fingerprint
	const selected = choosePreferredPrinting(pool, format) ?? pool[0];
	return {
		status: "basic-equivalent" as const,
		original: withoutCommercialData(selected),
		selected: withoutCommercialData(selected),
	};
}

/** Keep basic vs special energy from collapsing onto the wrong TCGdex row. */
function filterEnergyCandidates(details: FunctionalCard[], rawName: string, category?: CardCategory) {
	if (category !== "energy" && !isBasicEnergy(rawName)) return details;
	if (isBasicEnergy(rawName)) {
		const basic = details.filter(isBasicEnergyCard);
		return basic.length ? basic : details;
	}
	const special = details.filter(isSpecialEnergyCard);
	return special.length ? special : details;
}

function isBasicEnergyCard(card: FunctionalCard) {
	if (card.category && card.category.toLowerCase() !== "energy") return false;
	if (card.energyType === "Normal") return !card.effect;
	if (card.energyType === "Special") return false;
	return !card.effect;
}

function isSpecialEnergyCard(card: FunctionalCard) {
	if (card.category && card.category.toLowerCase() !== "energy") return false;
	return card.energyType === "Special" || Boolean(card.effect);
}

/** mep ids use 003; live exports sometimes send 3 or 003 */
function padCollectorForSetId(collectorNumber: string) {
	const text = collectorNumber.trim();
	if (/^\d+$/.test(text) && text.length < 3) return text.padStart(3, "0");
	return text.toLowerCase();
}

export function equivalentCollectorNumber(a: string | number, b: string | number) {
	const left = String(a).trim().toLowerCase();
	const right = String(b).trim().toLowerCase();
	if (left === right) return true;
	if (/^\d+$/.test(left) && /^\d+$/.test(right)) return Number(left) === Number(right);
	return left.replace(/^0+/, "") === right.replace(/^0+/, "");
}

function canonicalCardName(name: string) {
	const trimmed = name.trim();
	const energyNames: Record<string, string> = {
		"basic {d} energy": "Darkness Energy",
		"basic {r} energy": "Fire Energy",
		"basic {g} energy": "Grass Energy",
		"basic {w} energy": "Water Energy",
		"basic {l} energy": "Lightning Energy",
		"basic {p} energy": "Psychic Energy",
		"basic {f} energy": "Fighting Energy",
		"basic {m} energy": "Metal Energy",
		"basic darkness energy": "Darkness Energy",
		"basic fire energy": "Fire Energy",
		"basic grass energy": "Grass Energy",
		"basic water energy": "Water Energy",
		"basic lightning energy": "Lightning Energy",
		"basic psychic energy": "Psychic Energy",
		"basic fighting energy": "Fighting Energy",
		"basic metal energy": "Metal Energy",
	};
	return energyNames[trimmed.toLowerCase()] ?? trimmed;
}

export function isBasicEnergy(name: string) {
	const text = name.trim();
	if (/^basic \{[dgrwlpfm]\} energy$/i.test(text)) return true;
	return /^(?:basic\s+)?(?:darkness|fire|grass|water|lightning|psychic|fighting|metal)\s+energy$/i.test(text);
}

function safeLanguage(language: string) {
	return /^[a-z]{2}$/i.test(language) ? language.toLowerCase() : "en";
}

function withoutCommercialData(card: FunctionalCard) {
	const { pricing: _pricing, variants_detailed: _variantsDetailed, ...publicCard } = card as FunctionalCard & {
		pricing?: unknown;
		variants_detailed?: unknown;
	};
	return publicCard;
}
