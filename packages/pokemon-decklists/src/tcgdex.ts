import type { CardCategory } from "./domain.js";
import { chooseBasicPrinting, type FunctionalCard } from "./normalizer.js";

const API_BASE = "https://api.tcgdex.net/v2";

export async function searchCards(fetcher: typeof fetch, language: string, name: string) {
	const url = `${API_BASE}/${safeLanguage(language)}/cards?name=${encodeURIComponent(`eq:${name}`)}`;
	const response = await fetcher(url, { headers: { accept: "application/json" } });
	if (!response.ok) throw new Error(`TCGDex respondió ${response.status}`);
	return await response.json() as Array<{ id: string; localId: string | number; name: string; image?: string }>;
}

export async function searchCardCatalog(fetcher: typeof fetch, language: string, query: string) {
	const url = `${API_BASE}/${safeLanguage(language)}/cards?name=${encodeURIComponent(query)}`;
	const response = await fetcher(url, { headers: { accept: "application/json" } });
	if (!response.ok) throw new Error(`TCGDex respondió ${response.status}`);
	return (await response.json() as Array<{ id: string; localId: string | number; name: string; image?: string }>).slice(0, 50);
}

export async function getCard(fetcher: typeof fetch, language: string, id: string) {
	const response = await fetcher(`${API_BASE}/${safeLanguage(language)}/cards/${encodeURIComponent(id)}`, {
		headers: { accept: "application/json" },
	});
	if (!response.ok) return null;
	return await response.json() as FunctionalCard;
}

async function getSetAbbreviation(fetcher: typeof fetch, language: string, id: string) {
	const response = await fetcher(`${API_BASE}/${safeLanguage(language)}/sets/${encodeURIComponent(id)}`, {
		headers: { accept: "application/json" },
	});
	if (!response.ok) return undefined;
	const set = await response.json() as { abbreviation?: { official?: string } };
	return set.abbreviation?.official?.trim().toUpperCase();
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

	if (nameOnly) return resolveByName(fetcher, language, brief, format);

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
	const original = await getCard(fetcher, language, originalBrief.id);
	if (!original) return { status: "unresolved" as const, candidates: brief };

	const details = (await Promise.all(brief.map((card) => getCard(fetcher, language, card.id))))
		.filter((card): card is FunctionalCard => card !== null);

	let selected = possibleOriginals.length === 1
		? original
		: chooseBasicPrinting(original, details, format);

	// Promo rows in TCGDex sometimes have no image (MEP Alakazam 003)
	if (!selected.image) {
		const sameNumber = collectorNumber
			? details.filter((card) => card.image && equivalentCollectorNumber(card.localId, collectorNumber))
			: [];
		const withImage = sameNumber.length ? sameNumber : details.filter((card) => card.image);
		if (withImage.length) {
			selected = chooseBasicPrinting(selected, withImage, format);
			return {
				status: "basic-equivalent" as const,
				original: withoutCommercialData(original),
				selected: withoutCommercialData(selected),
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
) {
	if (!brief.length) return { status: "unresolved" as const, candidates: brief };
	const details = (await Promise.all(brief.map((card) => getCard(fetcher, language, card.id))))
		.filter((card): card is FunctionalCard => card !== null);
	const withImage = details.filter((card) => card.image);
	const pool = withImage.length ? withImage : details;
	if (!pool.length) return { status: "unresolved" as const, candidates: brief };
	const selected = chooseBasicPrinting(pool[0], pool, format);
	return {
		status: "basic-equivalent" as const,
		original: withoutCommercialData(pool[0]),
		selected: withoutCommercialData(selected),
	};
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
	const energyNames: Record<string, string> = {
		"basic {d} energy": "Darkness Energy",
		"basic {r} energy": "Fire Energy",
		"basic {g} energy": "Grass Energy",
		"basic {w} energy": "Water Energy",
		"basic {l} energy": "Lightning Energy",
		"basic {p} energy": "Psychic Energy",
		"basic {f} energy": "Fighting Energy",
		"basic {m} energy": "Metal Energy",
	};
	return energyNames[name.trim().toLowerCase()] ?? name;
}

export function isBasicEnergy(name: string) {
	return /^(?:basic \{[dgrwlpfm]\} energy|darkness energy|fire energy|grass energy|water energy|lightning energy|psychic energy|fighting energy|metal energy)$/i.test(name.trim());
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
