import DecklistBlock from "./DecklistBlock.astro";
import PokemonCardBlock from "./PokemonCardBlock.astro";
import PokemonCardGalleryBlock from "./PokemonCardGalleryBlock.astro";
import ArchetypeDecklistsBlock from "./ArchetypeDecklistsBlock.astro";

export const blockComponents = {
	pokemonDecklist: DecklistBlock,
	pokemonArchetypeDecklists: ArchetypeDecklistsBlock,
	pokemonCard: PokemonCardBlock,
	pokemonCardGallery: PokemonCardGalleryBlock,
};
