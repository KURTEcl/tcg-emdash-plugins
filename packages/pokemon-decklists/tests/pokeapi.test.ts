import { describe, expect, it } from "vitest";
import { pokemonLabel } from "../src/pokeapi.js";

describe("pokemonLabel", () => {
	it("formats base Pokémon names", () => {
		expect(pokemonLabel("mr-mime")).toBe("Mr Mime");
	});

	it("places Mega before the species name", () => {
		expect(pokemonLabel("charizard-mega-x")).toBe("Mega Charizard X");
		expect(pokemonLabel("venusaur-mega")).toBe("Mega Venusaur");
	});
});
