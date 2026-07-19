import type { ArchetypePokemon } from "./domain.js";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";
const NATIONAL_DEX_MAX = 1025;

interface PokemonListResponse {
	results: Array<{ name: string; url: string }>;
}

interface PokemonResponse {
	id: number;
	name: string;
	species: { name: string; url: string };
}

export interface PokemonOption {
	label: string;
	value: string;
}

export async function listPokemonOptions(fetcher: typeof fetch): Promise<PokemonOption[]> {
	const response = await fetcher(`${POKEAPI_BASE}/pokemon?limit=100000&offset=0`, { headers: { accept: "application/json" } });
	if (!response.ok) throw new Error(`PokéAPI respondió ${response.status}`);
	const data = await response.json() as PokemonListResponse;
	return data.results
		.map((pokemon) => ({ ...pokemon, id: resourceId(pokemon.url) }))
		.filter((pokemon) => pokemon.id > 0 && (pokemon.id <= NATIONAL_DEX_MAX || pokemon.name.includes("-mega")))
		.map((pokemon) => ({ label: pokemonLabel(pokemon.name), value: String(pokemon.id) }))
		.sort((a, b) => a.label.localeCompare(b.label));
}

export async function getArchetypePokemon(
	fetcher: typeof fetch,
	pokemonId: string,
	role: ArchetypePokemon["role"],
	order: number,
): Promise<ArchetypePokemon | null> {
	if (!/^\d+$/.test(pokemonId)) return null;
	const response = await fetcher(`${POKEAPI_BASE}/pokemon/${pokemonId}`, { headers: { accept: "application/json" } });
	if (!response.ok) return null;
	const pokemon = await response.json() as PokemonResponse;
	const speciesId = resourceId(pokemon.species.url);
	if (!speciesId) return null;
	return {
		speciesId,
		spriteId: pokemon.id,
		name: pokemonLabel(pokemon.name),
		...(pokemon.id !== speciesId ? { form: pokemon.name } : {}),
		role,
		order,
	};
}

export function pokemonLabel(name: string) {
	const parts = name.split("-");
	const megaIndex = parts.indexOf("mega");
	if (megaIndex > 0) {
		const base = parts.slice(0, megaIndex).map(titleCase).join(" ");
		const suffix = parts.slice(megaIndex + 1).map((part) => part.toUpperCase()).join(" ");
		return `Mega ${base}${suffix ? ` ${suffix}` : ""}`;
	}
	return parts.map(titleCase).join(" ");
}

function titleCase(value: string) {
	return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function resourceId(url: string) {
	const match = url.match(/\/(\d+)\/?$/);
	return match ? Number(match[1]) : 0;
}
