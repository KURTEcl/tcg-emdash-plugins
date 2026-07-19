# Pokémon Decklists

Plugin de EmDash para importar listas de Pokémon TCG desde PTCG Live o Limitless, asociarlas a arquetipos de uno o más Pokémon y preparar su publicación y análisis.

## Estado del MVP

- Parser de listas en inglés y español.
- Conserva la impresión importada y una impresión básica para mostrar/copiar.
- Resolución de impresiones equivalentes mediante TCGDex, sin precios.
- Catálogo reutilizable de arquetipos seleccionables desde cada decklist.
- Selector con buscador de PokéAPI para especies normales y formas Mega; los IDs se guardan internamente.
- URL base de sprites configurable, con `https://cdn.tcghub.cl/sprites/sprites` como valor inicial.
- Almacenamiento preparado para decklists y resultados de partidas.
- API pública para consultar listas y obtener su representación de texto.

El registro y las estadísticas de resultados se incorporarán sobre la colección `matches` en la siguiente iteración.
