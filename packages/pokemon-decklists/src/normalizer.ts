export interface FunctionalCard {
	id: string;
	name: string;
	image?: string;
	localId: string | number;
	rarity?: string;
	category: string;
	hp?: number;
	stage?: string;
	evolveFrom?: string;
	abilities?: unknown[];
	attacks?: unknown[];
	effect?: string;
	trainerType?: string;
	energyType?: string;
	retreat?: number;
	weaknesses?: unknown[];
	resistances?: unknown[];
	regulationMark?: string;
	legal?: Record<string, boolean>;
	variants?: { normal?: boolean; holo?: boolean; reverse?: boolean; firstEdition?: boolean; wPromo?: boolean };
	set?: { id: string; name: string; releaseDate?: string; abbreviation?: string };
}

const premiumRarity = /illustration|secret|hyper|rainbow|shiny|gold|ultra rare|full art|promo/i;

/**
 * Gameplay identity for reprints / stamp promos.
 * Omit evolveFrom/weaknesses/resistances: TCGdex promo rows often leave those blank
 * while the set printing (e.g. mep-003 → me01-056) has the full text box.
 */
export function functionalFingerprint(card: FunctionalCard) {
	return stableStringify({
		name: card.name,
		category: card.category,
		hp: card.hp,
		stage: card.stage,
		abilities: card.abilities,
		attacks: card.attacks,
		effect: card.effect,
		trainerType: card.trainerType,
		energyType: card.energyType,
		retreat: card.retreat,
		regulationMark: card.regulationMark,
	});
}

export function chooseBasicPrinting(original: FunctionalCard, candidates: FunctionalCard[], format = "standard") {
	const fingerprint = functionalFingerprint(original);
	const equivalent = candidates.filter((candidate) =>
		functionalFingerprint(candidate) === fingerprint && candidate.legal?.[format] !== false,
	);
	if (!equivalent.length) return original;

	// Prefer regular (non-premium) art, then newest set, then lowest collector number
	return equivalent.sort((a, b) =>
		scoreBasicPrinting(b) - scoreBasicPrinting(a)
		|| compareReleaseDate(b, a)
		|| compareCollectorNumber(a.localId, b.localId)
	)[0];
}

/**
 * Name-only picks (trainers / energies): ignore effect-text fingerprints (errata changes them)
 * and prefer the newest standard-legal non-premium print with art.
 */
export function choosePreferredPrinting(candidates: FunctionalCard[], format = "standard") {
	const legal = candidates.filter((card) => card.legal?.[format] !== false);
	const pool = legal.length ? legal : candidates;
	if (!pool.length) return undefined;
	return pool.sort((a, b) =>
		scorePreferredPrinting(b, format) - scorePreferredPrinting(a, format)
		|| compareReleaseDate(b, a)
		|| compareCollectorNumber(a.localId, b.localId)
	)[0];
}

function scorePreferredPrinting(card: FunctionalCard, format: string) {
	let score = scoreBasicPrinting(card);
	if (card.legal?.[format] === true) score += 20;
	return score;
}

function scoreBasicPrinting(card: FunctionalCard) {
	let score = 0;
	if (card.image) score += 3;
	if (card.variants?.normal) score += 8;
	if (!card.variants?.wPromo) score += 4;
	if (!premiumRarity.test(card.rarity ?? "")) score += 4;
	if (card.variants?.holo && !card.variants?.normal) score -= 1;
	return score;
}

function compareReleaseDate(a: FunctionalCard, b: FunctionalCard) {
	const left = a.set?.releaseDate ?? "";
	const right = b.set?.releaseDate ?? "";
	if (left === right) return 0;
	if (!left) return -1;
	if (!right) return 1;
	return left.localeCompare(right);
}

function compareCollectorNumber(a: string | number, b: string | number) {
	return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}
