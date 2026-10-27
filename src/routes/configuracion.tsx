import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/ui-bits";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración — LYNPHEA" },
      { name: "description", content: "Preferencias y datos locales del panel LYNPHEA." },
      { property: "og:title", content: "Configuración — LYNPHEA" },
      { property: "og:description", content: "Ajustes del panel de LYNPHEA." },
    ],
  }),
  component: ConfiguracionPage,
});

function ConfiguracionPage() {
  return (
    <>
      <PageHeader title="Configuración" subtitle="Preferencias del panel" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Marca">
          <div className="space-y-3 px-4 py-5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nombre</span>
              <span>LYNPHEA</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtítulo</span>
              <span>MAKEUP • BEAUTY</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Moneda</span>
              <span>COP</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Líneas</span>
              <span>DAILY · PRO</span>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
