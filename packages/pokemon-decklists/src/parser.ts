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

	return { cards, totalCards: cards.reduce((sum, card) => sum + card.quantity, 0), errors };
}

function parseCardLine(line: string) {
	const quantityMatch = line.match(/^(\d+)\s+(.+)$/);
	if (!quantityMatch) return null;
	const quantity = Number(quantityMatch[1]);
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > 60) return null;

	const remainder = quantityMatch[2].trim();
	const full = remainder.match(/^(.+?)\s+([A-Z0-9]{2,12})\s+([A-Z0-9-]+)$/i);
	if (full) {
		return { quantity, name: full[1].trim(), setCode: full[2].toUpperCase(), collectorNumber: full[3] };
	}

	return { quantity, name: remainder, setCode: undefined, collectorNumber: undefined };
}

export function serializePokemonDecklist(cards: DeckCard[], useImportedPrinting = false) {
	const labels: Record<CardCategory, string> = { pokemon: "Pokémon", trainer: "Trainer", energy: "Energy" };
	return (["pokemon", "trainer", "energy"] as const)
		.map((category) => {
			const group = cards.filter((card) => card.category === category);
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
