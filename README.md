# TCG EmDash Plugins

Monorepo open source de plugins para mejorar la publicación de contenido TCG en EmDash.

## Plugins planificados

- `decklist`: listas de cartas, secciones, formatos e importación/exportación.
- `tournaments`: eventos, rondas, resultados y posiciones.
- `hub-connector`: conexión voluntaria y segura con un HUB externo.

Cada plugin vivirá como paquete independiente dentro de `packages/`. Los plugins estándar deberán funcionar tanto en Node.js como en Cloudflare; las funciones que necesiten componentes Astro o bloques Portable Text se implementarán como plugins nativos.

El protocolo del HUB se diseñará antes de implementar `hub-connector` para no fijar una API prematura.

## Desarrollo

Requiere Node.js 22+ y pnpm 11.

```bash
pnpm install
pnpm typecheck
```

## Licencia

MIT
