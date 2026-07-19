import type { CardCategory, DeckCard, ParsedDeck } from "./domain.js";

const headings: Array<[RegExp, CardCategory]> = [
	[/^(pok[eé]mon|pokemon)(?:\s*:\s*\d+|\s*\(\d+\))?$/i, "pokemon"],
	[/^(trainer|trainers|entrenador(?:es)?)(?:\s*:\s*\d+|\s*\(\d+\))?$/i, "trainer"],
	[/^(energy|energies|energ[ií]a(?:s)?)(?:\s*:\s*\d+|\s*\(\d+\))?$/i, "energy"],
];

export function parsePokemonDecklist(input: string): ParsedDeck {
	const cards: DeckCard[] = [];
	const errors: ParsedDeck["errors"] = [];
	let category: CardCategory | null = null;

	for (const [index, raw] of input.replace(/\r/g, "").split("\n").entries()) {
		const line = raw.trim();
		if (!line || /^total\s+cards?\s*:/i.test(line) || /^cartas?\s+totales?\s*:/i.test(line)) continue;

		const heading = headings.find(([pattern]) => pattern.test(line));
		if (heading) {
			category = heading[1];
			continue;
		}

		if (!category) {
			errors.push({ line: index + 1, message: "La carta aparece antes de una categoría", value: raw });
			continue;
		}

		const parsed = parseCardLine(line);
		if (!parsed) {
			errors.push({ line: index + 1, message: "No se pudo interpretar la línea", value: raw });
			continue;
		}

		const printing = { name: parsed.name, setCode: parsed.setCode, collectorNumber: parsed.collectorNumber };
		cards.push({
			quantity: parsed.quantity,
			category,
			importedPrinting: printing,
			displayPrinting: { ...printing },
			resolutionStatus: "pending",
		});
	}

	const merged = mergeEquivalentCards(cards);
	return { cards: merged, totalCards: merged.reduce((sum, card) => sum + card.quantity, 0), errors };
}

/** Trainers/energies: same name → one line. Pokémon: same name + number → one line. */
export function mergeEquivalentCards(cards: DeckCard[]): DeckCard[] {
	const merged = new Map<string, DeckCard>();
	for (const card of cards) {
		const key = cardMergeKey(card);
		const existing = merged.get(key);
		if (!existing) {
			merged.set(key, {
				...card,
				importedPrinting: { ...card.importedPrinting },
				displayPrinting: { ...card.displayPrinting },
			});
			continue;
		}
		existing.quantity += card.quantity;
		if (card.category !== "pokemon") {
			// ponytail: trainers/energies ignore set/number after merge — resolve by name only
			existing.importedPrinting = { name: existing.importedPrinting.name };
			existing.displayPrinting = { name: existing.displayPrinting.name };
			existing.resolutionStatus = "pending";
		}
	}
	return [...merged.values()];
}

function cardMergeKey(card: DeckCard) {
	const name = card.importedPrinting.name.trim().toLowerCase();
	if (card.category === "pokemon") {
		const number = normalizeCollectorNumber(card.importedPrinting.collectorNumber);
		return `pokemon|${name}|${number}`;
	}
	return `${card.category}|${name}`;
}

function normalizeCollectorNumber(value?: string) {
	const text = (value ?? "").trim().toLowerCase();
	if (!text) return "";
	if (/^\d+$/.test(text)) return String(Number(text));
	return text.replace(/^0+/, "") || "0";
}

function parseCardLine(line: string) {
	const quantityMatch = line.match(/^(\d+)\s+(.+)$/);
	if (!quantityMatch) return null;
	const quantity = Number(quantityMatch[1]);
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > 60) return null;

	const remainder = quantityMatch[2].trim();
	// Allow hyphens in set codes (PR-SW, etc.)
	const full = remainder.match(/^(.+?)\s+([A-Z0-9][A-Z0-9-]{1,11})\s+([A-Z0-9-]+)$/i);
	if (full) {
		return { quantity, name: full[1].trim(), setCode: full[2].toUpperCase(), collectorNumber: full[3] };
	}

	return { quantity, name: remainder, setCode: undefined, collectorNumber: undefined };
}

export function serializePokemonDecklist(cards: DeckCard[] | null | undefined, useImportedPrinting = false) {
	const list = cards ?? [];
	const labels: Record<CardCategory, string> = { pokemon: "Pokémon", trainer: "Trainer", energy: "Energy" };
	return (["pokemon", "trainer", "energy"] as const)
		.map((category) => {
			const group = list.filter((card) => card.category === category);
			if (!group.length) return "";
			const count = group.reduce((sum, card) => sum + card.quantity, 0);
			const lines = group.map((card) => {
				const printing = useImportedPrinting ? card.importedPrinting : card.displayPrinting;
				return [card.quantity, printing.name, printing.setCode, printing.collectorNumber].filter(Boolean).join(" ");
			});
			return `${labels[category]}: ${count}\n${lines.join("\n")}`;
		})
		.filter(Boolean)
		.join("\n\n");
}
