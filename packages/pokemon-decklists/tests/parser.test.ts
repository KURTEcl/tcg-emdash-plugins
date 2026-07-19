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

	it("serializes null/undefined cards as empty string", () => {
		expect(serializePokemonDecklist(null)).toBe("");
		expect(serializePokemonDecklist(undefined)).toBe("");
	});

	it("parses hyphenated set codes like PR-SW", () => {
		const result = parsePokemonDecklist("Trainer: 1\n1 Boss's Orders PR-SW 251");
		expect(result.errors).toEqual([]);
		expect(result.cards[0].importedPrinting).toMatchObject({ name: "Boss's Orders", setCode: "PR-SW", collectorNumber: "251" });
	});

	it("merges trainers and energies by name and pokemon by name+number", () => {
		const result = parsePokemonDecklist(`Pokémon: 5
3 Alakazam MEP 003
2 Alakazam MEP 003

Trainer: 7
1 Boss's Orders RCL 189
1 Boss's Orders PR-SW 251
2 Rare Candy MEG 125
1 Rare Candy MEG 125
3 Poké Pad POR 081
1 Poké Pad POR 081

Energy: 6
4 Psychic Energy MEE 79
2 Psychic Energy SVE 13`);
		expect(result.errors).toEqual([]);
		const alakazam = result.cards.find((card) => card.importedPrinting.name === "Alakazam");
		const boss = result.cards.find((card) => card.importedPrinting.name === "Boss's Orders");
		const candy = result.cards.find((card) => card.importedPrinting.name === "Rare Candy");
		const pad = result.cards.find((card) => card.importedPrinting.name === "Poké Pad");
		const psychic = result.cards.find((card) => card.importedPrinting.name === "Psychic Energy");
		expect(alakazam?.quantity).toBe(5);
		expect(boss?.quantity).toBe(2);
		expect(boss?.importedPrinting.setCode).toBeUndefined();
		expect(candy?.quantity).toBe(3);
		expect(pad?.quantity).toBe(4);
		expect(psychic?.quantity).toBe(6);
		expect(result.cards.filter((card) => card.category === "trainer")).toHaveLength(3);
	});
});
