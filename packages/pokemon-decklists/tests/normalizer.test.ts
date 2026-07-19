import { describe, expect, it } from "vitest";
import { chooseBasicPrinting, choosePreferredPrinting, type FunctionalCard } from "../src/normalizer.js";

const base: FunctionalCard = {
	id: "regular", name: "Zoroark ex", localId: "98", category: "Pokemon", hp: 280,
	stage: "Stage1", attacks: [{ name: "Night Joker", damage: 100 }], regulationMark: "I",
	legal: { standard: true }, rarity: "Double Rare", variants: { normal: true },
};

describe("chooseBasicPrinting", () => {
	it("prefers the regular equivalent over a premium artwork", () => {
		const premium = { ...base, id: "sir", localId: "185", rarity: "Special Illustration Rare", variants: { holo: true } };
		expect(chooseBasicPrinting(premium, [premium, base]).id).toBe("regular");
	});

	it("does not substitute a functionally different card", () => {
		const other = { ...base, id: "other", attacks: [{ name: "Different attack", damage: 100 }] };
		expect(chooseBasicPrinting(base, [other]).id).toBe("regular");
	});

	it("matches incomplete promo rows to the full set printing", () => {
		const promo: FunctionalCard = {
			id: "mep-003", name: "Alakazam", localId: "003", category: "Pokemon", hp: 140,
			stage: "Stage2", regulationMark: "I", retreat: 1, rarity: "Promo",
			abilities: [{ name: "Psychic Draw" }],
			attacks: [{ name: "Powerful Hand" }],
		};
		const setPrint: FunctionalCard = {
			...promo,
			id: "me01-056",
			localId: "056",
			image: "https://assets.tcgdex.net/en/me/me01/056",
			evolveFrom: "Kadabra",
			weaknesses: [{ type: "Darkness", value: "×2" }],
			resistances: [{ type: "Fighting", value: "-30" }],
			rarity: "Rare",
			variants: { normal: true },
			legal: { standard: true },
		};
		expect(chooseBasicPrinting(promo, [promo, setPrint]).id).toBe("me01-056");
	});

	it("prefers the newer regular reprint when scores tie", () => {
		const older = {
			...base,
			id: "old",
			localId: "10",
			image: "https://img/old",
			set: { id: "swsh1", name: "Sword & Shield", releaseDate: "2020-02-07" },
		};
		const newer = {
			...base,
			id: "new",
			localId: "20",
			image: "https://img/new",
			set: { id: "sv01", name: "Scarlet & Violet", releaseDate: "2023-03-31" },
		};
		expect(chooseBasicPrinting(older, [older, newer]).id).toBe("new");
	});
});

describe("choosePreferredPrinting", () => {
	it("picks the newest standard common over an older print with different effect text", () => {
		const oldText: FunctionalCard = {
			id: "bw10-90", name: "Ultra Ball", localId: "90", category: "Trainer", rarity: "Uncommon",
			effect: "Discard 2 cards from your hand.", image: "https://img/old",
			legal: { standard: false, expanded: true }, variants: { normal: true },
			set: { id: "bw10", name: "Plasma Blast", releaseDate: "2013-08-14" },
		};
		const newest: FunctionalCard = {
			id: "me02.5-213", name: "Ultra Ball", localId: "213", category: "Trainer", rarity: "Common",
			effect: "You can use this card only if you discard 2 other cards from your hand.",
			image: "https://img/new", legal: { standard: true, expanded: true }, variants: { normal: true },
			set: { id: "me02.5", name: "Ascended Heroes", releaseDate: "2026-01-30" },
		};
		const premium: FunctionalCard = {
			...newest, id: "me02.5-264", localId: "264", rarity: "Ultra Rare", variants: { holo: true },
		};
		expect(choosePreferredPrinting([oldText, premium, newest], "standard")?.id).toBe("me02.5-213");
	});
});
