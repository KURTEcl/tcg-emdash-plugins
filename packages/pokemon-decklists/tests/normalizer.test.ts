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
});
