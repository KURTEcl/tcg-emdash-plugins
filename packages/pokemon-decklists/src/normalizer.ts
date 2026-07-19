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
	set?: { id: string; name: string };
}

const premiumRarity = /illustration|secret|hyper|rainbow|shiny|gold|ultra rare|full art|promo/i;

export function functionalFingerprint(card: FunctionalCard) {
	return stableStringify({
		name: card.name,
		category: card.category,
		hp: card.hp,
		stage: card.stage,
		evolveFrom: card.evolveFrom,
		abilities: card.abilities,
		attacks: card.attacks,
		effect: card.effect,
		trainerType: card.trainerType,
		energyType: card.energyType,
		retreat: card.retreat,
		weaknesses: card.weaknesses,
		resistances: card.resistances,
		regulationMark: card.regulationMark,
	});
}

export function chooseBasicPrinting(original: FunctionalCard, candidates: FunctionalCard[], format = "standard") {
	const fingerprint = functionalFingerprint(original);
	const equivalent = candidates.filter((candidate) =>
		functionalFingerprint(candidate) === fingerprint && candidate.legal?.[format] !== false,
	);
	if (!equivalent.length) return original;

	return equivalent.sort((a, b) => scoreBasicPrinting(b) - scoreBasicPrinting(a) || compareCollectorNumber(a.localId, b.localId))[0];
}

function scoreBasicPrinting(card: FunctionalCard) {
	let score = 0;
	if (card.variants?.normal) score += 8;
	if (!card.variants?.wPromo) score += 4;
	if (!premiumRarity.test(card.rarity ?? "")) score += 4;
	if (card.variants?.holo && !card.variants?.normal) score -= 1;
	return score;
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
