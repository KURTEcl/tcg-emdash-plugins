import { describe, expect, it } from "vitest";
import { isBasicEnergy } from "../src/tcgdex.js";

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
