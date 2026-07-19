import { describe, expect, it } from "vitest";
import { isBasicEnergy, pickCatalogResults, resolveBasicPrinting, searchCards } from "../src/tcgdex.js";

describe("searchCards", () => {
	it("matches names case-insensitively without relying on eq:", async () => {
		const fetcher = async (input: RequestInfo | URL) => {
			const url = String(input);
			expect(url).not.toContain("eq%3A");
			expect(url).not.toContain("eq:");
			return Response.json([
				{ id: "me01-056", localId: "056", name: "Alakazam", image: "https://img/a" },
				{ id: "base5-1", localId: "1", name: "Dark Alakazam", image: "https://img/d" },
			]);
		};
		const items = await searchCards(fetcher as typeof fetch, "en", "alakazam");
		expect(items.map((card) => card.id)).toEqual(["me01-056"]);
	});
});

describe("pickCatalogResults", () => {
	it("dedupes by name and keeps a printing with art when the first hits have none", () => {
		const cards = [
			{ id: "mee-007", localId: "007", name: "Darkness Energy" },
			{ id: "sve-015", localId: "015", name: "Darkness Energy" },
			{ id: "swsh12.5-158", localId: "158", name: "Darkness Energy", image: "https://img/d" },
			{ id: "pop5-4", localId: "4", name: "Double Rainbow Energy", image: "https://img/r" },
			{ id: "mee-001", localId: "001", name: "Grass Energy" },
		];
		const picked = pickCatalogResults(cards, 10);
		expect(picked.map((card) => card.name).sort()).toEqual(["Darkness Energy", "Double Rainbow Energy", "Grass Energy"]);
		expect(picked.find((card) => card.name === "Darkness Energy")?.id).toBe("swsh12.5-158");
	});
});

describe("basic energy detection", () => {
	it("recognizes Limitless and TCG Live basic energy names", () => {
		expect(isBasicEnergy("Darkness Energy")).toBe(true);
		expect(isBasicEnergy("Basic {D} Energy")).toBe(true);
		expect(isBasicEnergy("Basic Darkness Energy")).toBe(true);
	});

	it("does not classify special energy cards as basic", () => {
		expect(isBasicEnergy("Jet Energy")).toBe(false);
		expect(isBasicEnergy("Legacy Energy")).toBe(false);
	});
});

describe("energy resolution", () => {
	it("picks a Normal basic Darkness Energy with art, not the old Special Energy", async () => {
		const cards = [
			{ id: "mee-007", localId: "007", name: "Darkness Energy" },
			{ id: "hgss3-79", localId: "79", name: "Darkness Energy", image: "https://img/special" },
			{ id: "swsh12.5-158", localId: "158", name: "Darkness Energy", image: "https://img/basic" },
		];
		const fetcher = async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/cards?")) return Response.json(cards);
			if (url.endsWith("/cards/mee-007")) {
				return Response.json({ ...cards[0], category: "Energy", energyType: "Normal", legal: { standard: true }, set: { id: "mee", name: "MEE" } });
			}
			if (url.endsWith("/cards/hgss3-79")) {
				return Response.json({
					...cards[1], category: "Energy", energyType: "Special", effect: "+10 damage", legal: { standard: false },
					set: { id: "hgss3", name: "Undaunted" },
				});
			}
			if (url.endsWith("/cards/swsh12.5-158")) {
				return Response.json({
					...cards[2], category: "Energy", energyType: "Normal", legal: { standard: true }, variants: { normal: true },
					set: { id: "swsh12.5", name: "Crown Zenith" },
				});
			}
			if (url.endsWith("/sets/mee")) return Response.json({ abbreviation: { official: "MEE" }, releaseDate: "2025-09-25" });
			if (url.endsWith("/sets/hgss3")) return Response.json({ abbreviation: { official: "UD" }, releaseDate: "2010-08-18" });
			if (url.endsWith("/sets/swsh12.5")) return Response.json({ abbreviation: { official: "CRZ" }, releaseDate: "2023-01-20" });
			return new Response(null, { status: 404 });
		};

		const result = await resolveBasicPrinting(fetcher as typeof fetch, "en", "Darkness Energy", "79", "MEE", "standard", { category: "energy" });
		expect(result.status).toBe("basic-equivalent");
		expect(result.selected?.id).toBe("swsh12.5-158");
		expect(result.selected?.energyType).toBe("Normal");
		expect(result.selected?.set?.abbreviation).toBe("CRZ");
	});
});

describe("set disambiguation", () => {
	it("uses the official set abbreviation when name and collector number collide", async () => {
		const cards = [
			{ id: "sv08.5-083", localId: "083", name: "Buneary", image: "https://img/pre" },
			{ id: "me02-083", localId: "083", name: "Buneary", image: "https://img/pfl" },
		];
		const fetcher = async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/cards?")) return Response.json(cards);
			if (url.endsWith("/cards/sv08.5-083")) return Response.json({ ...cards[0], category: "Pokemon", hp: 60, attacks: [{ name: "Smash Kick", damage: 20 }], set: { id: "sv08.5", name: "Prismatic Evolutions" } });
			if (url.endsWith("/cards/me02-083")) return Response.json({ ...cards[1], category: "Pokemon", hp: 70, attacks: [{ name: "Run Around" }, { name: "Kick", damage: 20 }], set: { id: "me02", name: "Phantasmal Flames" } });
			if (url.endsWith("/sets/sv08.5")) return Response.json({ abbreviation: { official: "PRE" } });
			if (url.endsWith("/sets/me02")) return Response.json({ abbreviation: { official: "PFL" } });
			return new Response(null, { status: 404 });
		};

		const result = await resolveBasicPrinting(fetcher as typeof fetch, "en", "Buneary", "83", "PFL", "standard", { category: "pokemon" });

		expect(result.status).toBe("exact");
		expect(result.selected?.id).toBe("me02-083");
	});

	it("falls back to the set reprint art when MEP 003 has no image", async () => {
		const shared = {
			name: "Alakazam",
			category: "Pokemon",
			hp: 140,
			stage: "Stage2",
			regulationMark: "I",
			retreat: 1,
			abilities: [{ type: "Ability", name: "Psychic Draw", effect: "Draw 3 cards." }],
			attacks: [{ cost: ["Psychic"], name: "Powerful Hand", effect: "Place 2 damage counters..." }],
		};
		const cards = [
			{ id: "mep-003", localId: "003", name: "Alakazam" },
			{ id: "me01-056", localId: "056", name: "Alakazam", image: "https://assets.tcgdex.net/en/me/me01/056" },
			{ id: "base1-001", localId: "001", name: "Alakazam", image: "https://img/base" },
		];
		const fetcher = async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/cards?")) return Response.json(cards);
			// Incomplete promo row (no evolveFrom/weaknesses/image) — real TCGdex shape
			if (url.endsWith("/cards/mep-003")) {
				return Response.json({ ...shared, id: "mep-003", localId: "003", rarity: "Promo", set: { id: "mep", name: "MEP" } });
			}
			if (url.endsWith("/cards/me01-056")) {
				return Response.json({
					...shared,
					id: "me01-056",
					localId: "056",
					image: "https://assets.tcgdex.net/en/me/me01/056",
					evolveFrom: "Kadabra",
					weaknesses: [{ type: "Darkness", value: "×2" }],
					variants: { normal: true, holo: true },
					rarity: "Rare",
					legal: { standard: true },
					set: { id: "me01", name: "Mega Evolution" },
				});
			}
			if (url.endsWith("/cards/base1-001")) {
				return Response.json({
					id: "base1-001", localId: "001", name: "Alakazam", category: "Pokemon", hp: 80,
					image: "https://img/base", attacks: [{ name: "Confuse Ray" }], set: { id: "base1", name: "Base" },
				});
			}
			if (url.endsWith("/sets/mep")) return Response.json({ abbreviation: { official: "MEP" } });
			return new Response(null, { status: 404 });
		};

		const result = await resolveBasicPrinting(fetcher as typeof fetch, "en", "Alakazam", "003", "MEP", "standard", { category: "pokemon" });
		expect(result.status).toBe("basic-equivalent");
		expect(result.selected?.id).toBe("me01-056");
		expect(result.selected?.image).toBe("https://assets.tcgdex.net/en/me/me01/056");
	});

	it("resolves trainers by name only", async () => {
		const cards = [
			{ id: "rcl-189", localId: "189", name: "Boss's Orders", image: "https://img/full" },
			{ id: "swshp-251", localId: "251", name: "Boss's Orders", image: "https://img/promo" },
		];
		const fetcher = async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/cards?")) return Response.json(cards);
			if (url.endsWith("/cards/rcl-189")) return Response.json({ ...cards[0], category: "Trainer", variants: { normal: true } });
			if (url.endsWith("/cards/swshp-251")) return Response.json({ ...cards[1], category: "Trainer", rarity: "Promo" });
			return new Response(null, { status: 404 });
		};

		const result = await resolveBasicPrinting(fetcher as typeof fetch, "en", "Boss's Orders", "189", "RCL", "standard", { category: "trainer" });
		expect(result.status).toBe("basic-equivalent");
		expect(result.selected?.id).toBe("rcl-189");
	});
});
