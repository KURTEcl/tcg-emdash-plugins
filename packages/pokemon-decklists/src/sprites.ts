import type { ArchetypePokemon } from "./domain.js";

export const DEFAULT_SPRITE_BASE_URL = "https://cdn.tcghub.cl/sprites/sprites";

export function buildPokemonSpriteUrl(
	baseUrl: string,
	pokemon: Pick<ArchetypePokemon, "speciesId" | "spriteId">,
	style: "sprite" | "official-artwork" = "sprite",
) {
	const base = baseUrl.replace(/\/+$/, "");
	const id = pokemon.spriteId || pokemon.speciesId;
	return style === "official-artwork"
		? `${base}/pokemon/other/official-artwork/${id}.png`
		: `${base}/pokemon/${id}.png`;
}
