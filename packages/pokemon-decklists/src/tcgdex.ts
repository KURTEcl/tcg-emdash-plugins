import { chooseBasicPrinting, type FunctionalCard } from "./normalizer.js";

const API_BASE = "https://api.tcgdex.net/v2";

export async function searchCards(fetcher: typeof fetch, language: string, name: string) {
	const url = `${API_BASE}/${safeLanguage(language)}/cards?name=${encodeURIComponent(`eq:${name}`)}`;
	const response = await fetcher(url, { headers: { accept: "application/json" } });
	if (!response.ok) throw new Error(`TCGDex respondió ${response.status}`);
	return await response.json() as Array<{ id: string; localId: string | number; name: string; image?: string }>;
}

export async function getCard(fetcher: typeof fetch, language: string, id: string) {
	const response = await fetcher(`${API_BASE}/${safeLanguage(language)}/cards/${encodeURIComponent(id)}`, {
		headers: { accept: "application/json" },
	});
	if (!response.ok) return null;
	return await response.json() as FunctionalCard;
}

export async function resolveBasicPrinting(
	fetcher: typeof fetch,
	language: string,
	name: string,
	collectorNumber?: string,
	format = "standard",
) {
	const canonicalName = canonicalCardName(name);
	const brief = await searchCards(fetcher, language, canonicalName);
	if (canonicalName !== name) {
		const preferred = brief.find((card) => card.id.startsWith("mee-")) ?? brief.find((card) => card.id.startsWith("sve-")) ?? brief.find((card) => card.image);
		const selected = preferred ? await getCard(fetcher, language, preferred.id) : null;
		if (selected) return { status: "basic-equivalent" as const, original: withoutCommercialData(selected), selected: withoutCommercialData(selected) };
	}
	const possibleOriginals = collectorNumber
		? brief.filter((card) => equivalentCollectorNumber(card.localId, collectorNumber))
		: brief;
	if (possibleOriginals.length !== 1) return { status: "unresolved" as const, candidates: brief };

	const original = await getCard(fetcher, language, possibleOriginals[0].id);
	if (!original) return { status: "unresolved" as const, candidates: brief };
	const details = (await Promise.all(brief.map((card) => getCard(fetcher, language, card.id))))
		.filter((card): card is FunctionalCard => card !== null);
	const selected = chooseBasicPrinting(original, details, format);
	return {
		status: selected.id === original.id ? "exact" as const : "basic-equivalent" as const,
		original: withoutCommercialData(original),
		selected: withoutCommercialData(selected),
	};
}

function equivalentCollectorNumber(a: string | number, b: string | number) {
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
