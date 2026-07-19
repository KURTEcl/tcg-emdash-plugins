import { useEffect, useState } from "react";
import { apiFetch } from "@emdash-cms/admin";
import { defaults, fontOptions } from "./settings.js";

type Settings = { [K in keyof typeof defaults]: string };
type Notice = { type: "success" | "error"; message: string } | null;
const API = "/_emdash/api/plugins/theme-settings/settings";

const colors: Array<{ key: keyof Settings; label: string; description: string }> = [
	{ key: "backgroundColor", label: "Fondo", description: "Fondo general del sitio" },
	{ key: "panelColor", label: "Paneles", description: "Tarjetas, bloques y superficies" },
	{ key: "textColor", label: "Texto", description: "Texto principal" },
	{ key: "mutedColor", label: "Texto secundario", description: "Metadatos y textos de apoyo" },
	{ key: "borderColor", label: "Bordes", description: "Líneas y separadores" },
	{ key: "primaryColor", label: "Principal", description: "Marca, enlaces y acciones" },
	{ key: "accentColor", label: "Acento", description: "Detalles destacados" },
];

async function request(init?: RequestInit) {
	const response = await apiFetch(API, init);
	if (!response.ok) throw new Error(await response.text());
	return (await response.json() as { data: { settings: Settings } }).data.settings;
}

function AppearancePage() {
	const [settings, setSettings] = useState<Settings | null>(null);
	const [notice, setNotice] = useState<Notice>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		request().then(setSettings).catch((error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "No se pudieron cargar los ajustes." }));
	}, []);

	const update = (key: keyof Settings, value: string) => setSettings((current) => current ? { ...current, [key]: value } : current);
	const save = async () => {
		if (!settings) return;
		setSaving(true); setNotice(null);
		try {
			setSettings(await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }));
			setNotice({ type: "success", message: "La apariencia se guardó correctamente." });
		} catch (error) {
			setNotice({ type: "error", message: error instanceof Error ? error.message : "No se pudieron guardar los ajustes." });
		} finally { setSaving(false); }
	};

	if (!settings) return <div className="py-16 text-center text-sm text-kumo-subtle">{notice?.message ?? "Cargando…"}</div>;
	return <div className="max-w-5xl">
		<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div><h1 className="text-2xl font-semibold text-kumo-default">Apariencia</h1><p className="mt-1 text-sm text-kumo-subtle">Personaliza los colores y las fuentes públicas del sitio.</p></div>
			<button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-9 items-center justify-center rounded-md bg-kumo-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "Guardando…" : "Guardar cambios"}</button>
		</div>
		{notice && <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${notice.type === "error" ? "border-kumo-danger/40 text-kumo-danger" : "border-kumo-line text-kumo-default"}`}>{notice.message}</div>}
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
			<div className="space-y-6">
				<section className="rounded-lg border border-kumo-line bg-kumo-elevated p-5"><h2 className="text-base font-semibold text-kumo-default">Colores</h2><p className="mt-1 text-sm text-kumo-subtle">Usa valores hexadecimales de seis dígitos.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{colors.map(({ key, label, description }) => <label key={key} className="block"><span className="text-sm font-medium text-kumo-default">{label}</span><span className="mt-0.5 block text-xs text-kumo-subtle">{description}</span><span className="mt-2 flex h-10 overflow-hidden rounded-md border border-kumo-line bg-kumo-default"><input aria-label={`Selector de ${label}`} type="color" value={settings[key]} onChange={(event) => update(key, event.target.value)} className="h-full w-12 cursor-pointer border-0 bg-transparent p-1" /><input aria-label={label} value={settings[key]} onChange={(event) => update(key, event.target.value)} pattern="#[0-9A-Fa-f]{6}" className="min-w-0 flex-1 border-0 bg-transparent px-3 font-mono text-sm text-kumo-default outline-none" /></span></label>)}</div></section>
				<section className="rounded-lg border border-kumo-line bg-kumo-elevated p-5"><h2 className="text-base font-semibold text-kumo-default">Tipografía</h2><p className="mt-1 text-sm text-kumo-subtle">Las fuentes se cargan desde Google Fonts en el sitio público.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{([['headingFont', 'Títulos'], ['bodyFont', 'Contenido']] as const).map(([key, label]) => <label key={key} className="block"><span className="text-sm font-medium text-kumo-default">{label}</span><select value={settings[key]} onChange={(event) => update(key, event.target.value)} className="mt-2 h-10 w-full rounded-md border border-kumo-line bg-kumo-default px-3 text-sm text-kumo-default outline-none focus:border-kumo-accent">{fontOptions.map((font) => <option key={font} value={font} style={{ color: "#111827", backgroundColor: "#FFFFFF" }}>{font}</option>)}</select></label>)}</div></section>
			</div>
			<aside className="lg:sticky lg:top-6 lg:self-start"><div className="rounded-lg border border-kumo-line p-5" style={{ background: settings.panelColor, borderColor: settings.borderColor, color: settings.textColor }}><span className="text-xs font-medium uppercase tracking-widest" style={{ color: settings.accentColor, fontFamily: settings.bodyFont }}>Vista previa</span><h2 className="mt-5 text-2xl font-semibold" style={{ fontFamily: settings.headingFont }}>Una nueva partida</h2><p className="mt-3 text-sm leading-6" style={{ color: settings.mutedColor, fontFamily: settings.bodyFont }}>Así se verán los títulos, el contenido y los detalles principales de tu blog.</p><button type="button" className="mt-5 rounded-md px-3 py-2 text-sm font-medium text-white" style={{ background: settings.primaryColor, fontFamily: settings.bodyFont }}>Leer publicación</button></div></aside>
		</div>
	</div>;
}

export const pages = { "/appearance": AppearancePage };
