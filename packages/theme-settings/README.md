# Theme Settings for EmDash

Plugin nativo para administrar desde EmDash los colores del tema y una selección segura de Google Fonts.

```ts
import { themeSettingsPlugin } from "@tcg-emdash/plugin-theme-settings";

emdash({ plugins: [themeSettingsPlugin()] });
```

El tema debe consumir las variables CSS estándar `--color-*`, `--font-body` y `--font-heading`.
