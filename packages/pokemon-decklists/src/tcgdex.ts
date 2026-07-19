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
	const brief = await searchCards(fetcher, language, name);
	const possibleOriginals = collectorNumber
		? brief.filter((card) => String(card.localId).toLowerCase() === collectorNumber.toLowerCase())
		: brief;
	if (possibleOriginals.length !== 1) return { status: "unresolved" as const, candidates: brief };

	const original = await getCard(fetcher, language, possibleOriginals[0].id);
	if (!original) return { status: "unresolved" as const, candidates: brief };
	const details = (await Promise.all(brief.map((card) => getCard(fetcher, language, card.id))))
		.filter((card): card is FunctionalCard => card !== null);
	const selected = chooseBasicPrinting(original, details, format);
	return { status: selected.id === original.id ? "exact" as const : "basic-equivalent" as const, original, selected };
}

function safeLanguage(language: string) {
	return /^[a-z]{2}$/i.test(language) ? language.toLowerCase() : "en";
}
