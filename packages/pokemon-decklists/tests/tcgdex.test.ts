import { describe, expect, it } from "vitest";
import { isBasicEnergy, resolveBasicPrinting } from "../src/tcgdex.js";

describe("basic energy detection", () => {
	it("recognizes Limitless and TCG Live basic energy names", () => {
		expect(isBasicEnergy("Darkness Energy")).toBe(true);
		expect(isBasicEnergy("Basic {D} Energy")).toBe(true);
	});

	it("does not classify special energy cards as basic", () => {
		expect(isBasicEnergy("Jet Energy")).toBe(false);
		expect(isBasicEnergy("Legacy Energy")).toBe(false);
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

	it("falls back to another Alakazam art when MEP 003 has no image", async () => {
		const cards = [
			{ id: "mep-003", localId: "003", name: "Alakazam" },
			{ id: "sv06-082", localId: "082", name: "Alakazam", image: "https://img/sv06" },
		];
		const fetcher = async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/cards?")) return Response.json(cards);
			if (url.endsWith("/cards/mep-003")) return Response.json({ id: "mep-003", localId: "003", name: "Alakazam", category: "Pokemon", set: { id: "mep", name: "MEP" } });
			if (url.endsWith("/cards/sv06-082")) return Response.json({ id: "sv06-082", localId: "082", name: "Alakazam", image: "https://img/sv06", category: "Pokemon", variants: { normal: true }, set: { id: "sv06", name: "Twilight Masquerade" } });
			if (url.endsWith("/sets/mep")) return Response.json({ abbreviation: { official: "MEP" } });
			return new Response(null, { status: 404 });
		};

		const result = await resolveBasicPrinting(fetcher as typeof fetch, "en", "Alakazam", "003", "MEP", "standard", { category: "pokemon" });
		expect(result.status).toBe("basic-equivalent");
		expect(result.selected?.id).toBe("sv06-082");
		expect(result.selected?.image).toBe("https://img/sv06");
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
