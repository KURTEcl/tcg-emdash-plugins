# Pokémon Decklists

Plugin de EmDash para importar listas de Pokémon TCG desde PTCG Live o Limitless, asociarlas a arquetipos de uno o más Pokémon y preparar su publicación y análisis.

## Estado del MVP

- Parser de listas en inglés y español.
- Conserva la impresión importada y una impresión básica para mostrar/copiar.
- Resolución de impresiones equivalentes mediante TCGDex, sin precios.
- Catálogo reutilizable de arquetipos seleccionables desde cada decklist.
- Selector con buscador de PokéAPI para especies normales y formas Mega; los IDs se guardan internamente.
- URL base de sprites configurable, con `https://cdn.tcghub.cl/sprites/sprites` como valor inicial.
- Registro de torneos con fecha, decklist, posición, visibilidad y notas.
- Rondas editables con arquetipo rival seleccionable desde PokéAPI, hasta tres partidas y orden de inicio.
- Casos especiales de torneo: BYE, rival ausente y empate intencional.
- Estadísticas públicas calculadas por ronda, manteniendo compatibilidad con resultados anteriores.
- Edición de torneos con rango de fechas, categoría, formato, posición y privacidad.
- Bloque de tabla para mostrar todas las decklists de un arquetipo.
- Buscador administrativo de cartas y bloque para insertarlas dentro del contenido.
- API pública para consultar listas y obtener su representación de texto.
