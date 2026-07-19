import { describe, expect, it } from "vitest";
import { isCatalogDecklist } from "../src/domain.js";

describe("isCatalogDecklist", () => {
	it("includes normal lists", () => {
		expect(isCatalogDecklist({})).toBe(true);
		expect(isCatalogDecklist({ isArchetypeBase: false })).toBe(true);
	});

	it("excludes archetype base lists", () => {
		expect(isCatalogDecklist({ isArchetypeBase: true })).toBe(false);
	});
});
