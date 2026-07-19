import { describe, expect, it } from "vitest";
import { buildPokemonSpriteUrl, DEFAULT_SPRITE_BASE_URL } from "../src/sprites.js";

describe("buildPokemonSpriteUrl", () => {
	it("uses the species ID for a normal Pokémon", () => {
		expect(buildPokemonSpriteUrl(DEFAULT_SPRITE_BASE_URL, { speciesId: 571, spriteId: 571 }))
			.toBe("https://cdn.tcghub.cl/sprites/sprites/pokemon/571.png");
	});

	it("uses the form sprite ID for a Mega Evolution", () => {
		expect(buildPokemonSpriteUrl(DEFAULT_SPRITE_BASE_URL, { speciesId: 6, spriteId: 10034 }, "official-artwork"))
			.toBe("https://cdn.tcghub.cl/sprites/sprites/pokemon/other/official-artwork/10034.png");
	});
});
