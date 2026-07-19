import { definePlugin } from "emdash";
import type { PluginDescriptor } from "emdash";

const VERSION = "0.1.0";
const defaults = {
	backgroundColor: "#050505",
	panelColor: "#0D0B08",
	textColor: "#F4EEE5",
	mutedColor: "#B7A98E",
	borderColor: "#302A23",
	primaryColor: "#BD5347",
	accentColor: "#F59E2B",
	bodyFont: "Space Grotesk",
	headingFont: "Space Grotesk",
} as const;
const fontOptions = ["Space Grotesk", "Inter", "Roboto", "Lato", "Merriweather", "Source Sans 3", "Montserrat", "IBM Plex Sans"] as const;
const fontChoices = fontOptions.map((font) => ({ value: font, label: font }));
const fontSet = new Set<string>(fontOptions);
const hexColor = /^#[0-9a-f]{6}$/i;

export function themeSettingsPlugin(): PluginDescriptor {
	return { id: "theme-settings", version: VERSION, format: "native", entrypoint: "@tcg-emdash/plugin-theme-settings", options: {} };
}

export function createPlugin() {
	return definePlugin({
		id: "theme-settings",
		version: VERSION,
		capabilities: ["hooks.page-fragments:register"],
		admin: {
			settingsSchema: {
				backgroundColor: colorField("Color de fondo", defaults.backgroundColor),
				panelColor: colorField("Color de paneles", defaults.panelColor),
				textColor: colorField("Color de texto", defaults.textColor),
				mutedColor: colorField("Texto secundario", defaults.mutedColor),
				borderColor: colorField("Color de bordes", defaults.borderColor),
				primaryColor: colorField("Color principal", defaults.primaryColor),
				accentColor: colorField("Color de acento", defaults.accentColor),
				bodyFont: { type: "select", label: "Fuente del contenido", options: fontChoices, default: defaults.bodyFont },
				headingFont: { type: "select", label: "Fuente de títulos", options: fontChoices, default: defaults.headingFont },
			},
		},
		hooks: {
			"plugin:install": async (_event, ctx) => {
				for (const [key, value] of Object.entries(defaults)) {
					if ((await ctx.kv.get(`settings:${key}`)) === null) await ctx.kv.set(`settings:${key}`, value);
				}
			},
			"page:fragments": {
				errorPolicy: "continue",
				handler: async (_event, ctx) => {
					const settings = await readSettings(ctx.kv);
					const fonts = [...new Set([settings.bodyFont, settings.headingFont])];
					const family = fonts.map((font) => `family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700`).join("&");
					return [{
						kind: "html",
						placement: "head",
						key: "theme-settings",
						html: `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${family}&display=swap"><style>:root{--color-bg:${settings.backgroundColor};--color-bg-subtle:${settings.backgroundColor};--color-surface:${settings.panelColor};--color-text:${settings.textColor};--color-text-secondary:${settings.mutedColor};--color-muted:${settings.mutedColor};--color-border:${settings.borderColor};--color-border-subtle:${settings.borderColor};--color-brand:${settings.primaryColor};--color-brand-hover:${settings.primaryColor};--color-warning:${settings.accentColor};--font-body:"${settings.bodyFont}",sans-serif;--font-heading:"${settings.headingFont}",sans-serif}</style>`,
					}];
				},
			},
		},
	});
}

function colorField(label: string, defaultValue: string) {
	return { type: "string" as const, label, description: "Formato hexadecimal de seis dígitos, por ejemplo #BD5347", default: defaultValue, placeholder: defaultValue };
}

async function readSettings(kv: { get<T>(key: string): Promise<T | null> }) {
	const value = async (key: keyof typeof defaults) => (await kv.get<string>(`settings:${key}`)) ?? defaults[key];
	const color = async (key: keyof typeof defaults) => {
		const candidate = await value(key);
		return hexColor.test(candidate) ? candidate.toUpperCase() : defaults[key];
	};
	const font = async (key: "bodyFont" | "headingFont") => {
		const candidate = await value(key);
		return fontSet.has(candidate) ? candidate : defaults[key];
	};
	return {
		backgroundColor: await color("backgroundColor"), panelColor: await color("panelColor"),
		textColor: await color("textColor"), mutedColor: await color("mutedColor"),
		borderColor: await color("borderColor"), primaryColor: await color("primaryColor"),
		accentColor: await color("accentColor"), bodyFont: await font("bodyFont"), headingFont: await font("headingFont"),
	};
}
