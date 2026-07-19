import { describe, expect, it } from "vitest";
import { chooseBasicPrinting, type FunctionalCard } from "../src/normalizer.js";

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
});
