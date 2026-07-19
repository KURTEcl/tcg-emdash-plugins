# TCG EmDash Plugins

Plugins open source para sitios EmDash orientados a contenido TCG.

Hoy el plugin de decklists está pensado para **Pokémon TCG**. Se ampliará a otros TCG (p. ej. One Piece, Riftbound) con plugins por juego y el mismo patrón (catálogo, import de listas, admin, bloques, resultados donde aplique).

Usar junto con [tcg-emdash-starter](https://github.com/KURTEcl/tcg-emdash-starter).  
Demo: [tcg.kurte.cl](https://tcg.kurte.cl)

## Paquetes

| Paquete | Nombre npm | Qué hace |
| --- | --- | --- |
| `packages/theme-settings` | `@tcg-emdash/plugin-theme-settings` | Colores y Google Fonts desde el admin (Apariencia) |
| `packages/pokemon-decklists` | `@tcg-emdash/plugin-pokemon-decklists` | Decklists, arquetipos, cartas, galería, resultados, catálogo `/decklists` (Pokémon TCG) |

Planificados: plugins para otros TCG; también `tournaments`, `hub-connector` (ver notas abajo).

---

## Guía rápida (humano)

### Requisitos

- Node.js **22+**, pnpm **11+**
- Un sitio EmDash Astro (recomendado: clonar el starter Node)
- Este repo **junto** al sitio, o referenciado por GitHub

Estructura típica de desarrollo:

```text
Develop/
  mi-blog/                 # tcg-emdash-starter o tu fork
  tcg-emdash-plugins/      # este repo
```

### 1. Instalar dependencias del monorepo de plugins

```bash
git clone https://github.com/KURTEcl/tcg-emdash-plugins.git
cd tcg-emdash-plugins
pnpm install
pnpm typecheck
```

### 2. Enlazar al blog (local)

En el `package.json` del sitio:

```json
{
  "dependencies": {
    "@tcg-emdash/plugin-theme-settings": "link:../tcg-emdash-plugins/packages/theme-settings",
    "@tcg-emdash/plugin-pokemon-decklists": "link:../tcg-emdash-plugins/packages/pokemon-decklists"
  }
}
```

Luego `pnpm install` en el sitio.

**Producción / CI** (sin carpeta hermana):

```json
{
  "dependencies": {
    "@tcg-emdash/plugin-theme-settings": "github:KURTEcl/tcg-emdash-plugins#path:packages/theme-settings",
    "@tcg-emdash/plugin-pokemon-decklists": "github:KURTEcl/tcg-emdash-plugins#path:packages/pokemon-decklists"
  }
}
```

### 3. Registrar plugins en `astro.config.mjs`

```js
import { themeSettingsPlugin } from "@tcg-emdash/plugin-theme-settings";
import { pokemonDecklistsPlugin } from "@tcg-emdash/plugin-pokemon-decklists";

emdash({
  // database, storage…
  plugins: [
    // …otros
    themeSettingsPlugin(),
    pokemonDecklistsPlugin(),
  ],
});
```

### 4. Registrar bloques Portable Text en las páginas

En cada página que renderice contenido CMS (`posts/[slug].astro`, `pages/[slug].astro`, etc.):

```astro
---
import DecklistBlock from "@tcg-emdash/plugin-pokemon-decklists/DecklistBlock.astro";
import ArchetypeDecklistsBlock from "@tcg-emdash/plugin-pokemon-decklists/ArchetypeDecklistsBlock.astro";
import PokemonCardBlock from "@tcg-emdash/plugin-pokemon-decklists/PokemonCardBlock.astro";
import PokemonCardGalleryBlock from "@tcg-emdash/plugin-pokemon-decklists/PokemonCardGalleryBlock.astro";
---

<PortableText
  value={entry.data.content}
  components={{
    type: {
      pokemonDecklist: DecklistBlock,
      pokemonArchetypeDecklists: ArchetypeDecklistsBlock,
      pokemonCard: PokemonCardBlock,
      pokemonCardGallery: PokemonCardGalleryBlock,
    },
  }}
/>
```

Sin este mapa, el admin inserta el bloque pero el front no lo pinta.

### 5. Reiniciar y probar

```bash
# en el sitio
pnpm exec emdash dev
```

- Admin → **Apariencia** (`theme-settings`)
- Admin → **Resultados Pokémon** / decklists (`pokemon-decklists`)
- En un post: `/` → bloques Decklist, Carta, Galería, Tabla de arquetipo

### 6. Rutas públicas útiles (pokemon-decklists)

Si el tema las incluye (como en tcg.kurte.cl):

- `/decklists` — catálogo buscable
- `/results` — resultados de torneos

Puedes copiar esas páginas desde el blog demo o implementarlas en tu tema.

---

## Guía para agentes de IA

### Objetivo

Conectar estos plugins a un sitio EmDash Astro existente (o al starter) y verificar que admin + front renderizan.

### Pasos

1. Confirmar layout: sitio y `tcg-emdash-plugins` como carpetas hermanas **o** deps `github:…#path:…`.
2. Añadir deps en `package.json` del sitio + `pnpm install`.
3. Importar y añadir ambos plugins en `emdash({ plugins })` de `astro.config.mjs`.
4. En **todas** las rutas que usan `<PortableText />` para CMS, registrar los 4 componentes Astro del decklist plugin.
5. Reiniciar `emdash dev` (cambios de plugin suelen exigir restart).
6. Smoke test:
   - `GET /` → 200
   - Admin carga
   - Insertar bloque carta/decklist en un borrador y ver HTML en preview/front
7. No inventar APIs del HUB; `hub-connector` aún no está definido.
8. No publicar precios de cartas (TCGDex se usa sin pricing comercial).
9. Variables de tema: el front debe usar `--color-*`, `--font-body`, `--font-heading` para que `theme-settings` tenga efecto.

### Exports importantes (`pokemon-decklists`)

- `.` / `pokemonDecklistsPlugin` — registro EmDash
- `./DecklistBlock.astro`, `./ArchetypeDecklistsBlock.astro`, `./PokemonCardBlock.astro`, `./PokemonCardGalleryBlock.astro`
- `./astro`, `./admin`, `./native` según empaquetado del plugin

### Docs por paquete

- [packages/theme-settings/README.md](packages/theme-settings/README.md)
- [packages/pokemon-decklists/README.md](packages/pokemon-decklists/README.md)

---

## Desarrollo de plugins

```bash
pnpm install
pnpm typecheck
```

Cada paquete vive en `packages/<nombre>` y debe preferir APIs que funcionen en Node y Cloudflare; UI Astro/bloques PT van como plugin nativo.

## Licencia

MIT
