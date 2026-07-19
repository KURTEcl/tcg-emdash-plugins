# Pokémon Decklists

Plugin de EmDash para importar listas de Pokémon TCG desde PTCG Live o Limitless, asociarlas a arquetipos de uno o más Pokémon y preparar su publicación y análisis.

## Estado del MVP

- Parser de listas en inglés y español.
- Conserva la impresión importada y una impresión básica para mostrar/copiar.
- Resolución de impresiones equivalentes mediante TCGDex, sin precios.
- Arquetipos con uno o dos Pokémon desde el formulario inicial.
- URL base de sprites configurable, con `https://cdn.tcghub.cl` como valor inicial.
- Almacenamiento preparado para decklists y resultados de partidas.
- API pública para consultar listas y obtener su representación de texto.

El registro y las estadísticas de resultados se incorporarán sobre la colección `matches` en la siguiente iteración.
