import { describe, expect, it } from "vitest";
import { parsePokemonDecklist, serializePokemonDecklist } from "../src/parser.js";

const exported = `Pokémon: 2
2 N's Zoroark ex JTG 98

Trainer: 1
4 Professor's Research PRE 122

Energy: 1
8 Basic Darkness Energy SVE 15`;

describe("parsePokemonDecklist", () => {
	it("parses PTCG Live categories and card references", () => {
		const result = parsePokemonDecklist(exported);
		expect(result.errors).toEqual([]);
		expect(result.totalCards).toBe(14);
		expect(result.cards[0].importedPrinting).toEqual({ name: "N's Zoroark ex", setCode: "JTG", collectorNumber: "98" });
	});

	it("accepts Spanish headings and cards without a printing", () => {
		const result = parsePokemonDecklist("Pokémon: 1\n1 Pikachu\nEntrenadores: 1\n2 Rare Candy");
		expect(result.errors).toEqual([]);
		expect(result.cards[1].importedPrinting.name).toBe("Rare Candy");
	});

	it("serializes the display printing by default", () => {
		const parsed = parsePokemonDecklist(exported);
		parsed.cards[0].displayPrinting = { name: "N's Zoroark ex", setCode: "JTG", collectorNumber: "185" };
		expect(serializePokemonDecklist(parsed.cards)).toContain("2 N's Zoroark ex JTG 185");
	});
});
