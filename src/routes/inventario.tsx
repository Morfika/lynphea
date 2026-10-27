import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Empty, PageHeader, Panel, Pill, SearchInput, StatCard } from "@/components/ui-bits";
import { emptyData, money, useStored, type Producto } from "@/lib/store";

export const Route = createFileRoute("/inventario")({
  head: () => ({
    meta: [
      { title: "Inventario — LYNPHEA" },
      { name: "description", content: "Stock, valor de inventario y productos bajos." },
      { property: "og:title", content: "Inventario — LYNPHEA" },
      { property: "og:description", content: "Control de stock por SKU y línea." },
    ],
  }),
  component: InventarioPage,
});

function InventarioPage() {
  const [productos, setProductos] = useStored<Producto[]>("productos", emptyData.productos);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [stock, setStock] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroLinea, setFiltroLinea] = useState<"TODAS" | Producto["linea"]>("TODAS");
  const [filtroEstado, setFiltroEstado] = useState<"DISPONIBLE" | "BAJO" | "TODOS">("DISPONIBLE");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState<number | "TODOS">(50);

  // Solo se cuentan productos que tienen existencia física real (> 0)
  const productosEnStock = useMemo(() => productos.filter((p) => (p.stock || 0) > 0), [productos]);
  const unidades = useMemo(() => productos.reduce((s, p) => s + (p.stock || 0), 0), [productos]);
  const valorCosto = useMemo(
    () => productos.reduce((s, p) => s + (p.stock || 0) * (p.costo || 0), 0),
    [productos],
  );
  const valorVentaPVP = useMemo(
    () => productos.reduce((s, p) => s + (p.stock || 0) * (p.precio || 0), 0),
    [productos],
  );
  // Stock bajo solo considera productos con 1 a 5 unidades (0 no genera alerta ni se cuenta)
  const bajos = useMemo(
    () =>
      productos.filter((p) => (p.stock || 0) >= 1 && (p.stock || 0) <= (p.stockMinimo ?? 5)).length,
    [productos],
  );

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const currentStock = p.stock || 0;
      const min = p.stockMinimo ?? 5;

      const matchesBusqueda =
        !busqueda ||
        `${p.sku} ${p.nombre} ${p.linea} ${p.proveedor ?? ""}`
          .toLowerCase()
          .includes(busqueda.toLowerCase());
      const matchesLinea = filtroLinea === "TODAS" || p.linea === filtroLinea;

      let matchesEstado = true;
      if (filtroEstado === "DISPONIBLE") matchesEstado = currentStock > 0;
      if (filtroEstado === "BAJO") matchesEstado = currentStock >= 1 && currentStock <= min;
      if (filtroEstado === "TODOS") matchesEstado = true;

      return matchesBusqueda && matchesLinea && matchesEstado;
    });
  }, [productos, busqueda, filtroLinea, filtroEstado]);

  const totalPaginas = porPagina === "TODOS" ? 1 : Math.ceil(productosFiltrados.length / porPagina);
  const productosPaginados = useMemo(() => {
    if (porPagina === "TODOS") return productosFiltrados;
    const inicio = (pagina - 1) * porPagina;
    return productosFiltrados.slice(inicio, inicio + porPagina);
  }, [productosFiltrados, pagina, porPagina]);

  return (
    <>
      <PageHeader title="Inventario" subtitle="Control de existencias físicas y valor de stock" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Referencias en Stock"
          value={String(productosEnStock.length)}
          hint="Productos con existencias > 0"
        />
        <StatCard
          label="Unidades Físicas"
          value={String(unidades)}
          hint="Unidades totales disponibles"
        />

        {/* Tarjeta con Valor al Costo y Valor en Verde al PVP */}
        <div className="rounded-lg border border-border bg-card p-5 transition-shadow hover:shadow-[0_1px_24px_-12px_var(--rose)] flex flex-col justify-between">
          <div>
            <p className="label-caps">Valor de Inventario</p>
            <div className="mt-2 flex items-baseline justify-between gap-2 flex-wrap">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-medium block">
                  Al Costo
                </span>
                <p className="font-display text-2xl text-foreground font-semibold">
                  {money(valorCosto)}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase font-semibold block">
                  Al PVP (Venta)
                </span>
                <p className="font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {money(valorVentaPVP)}
                </p>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Ganancia potencial:{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                +{money(Math.max(0, valorVentaPVP - valorCosto))}
              </span>
            </div>
          </div>
          <div className="mt-3 h-px w-8 bg-rose" />
        </div>

        <StatCard
          label="Stock Bajo (1-5 u.)"
          value={String(bajos)}
          hint={bajos > 0 ? "Requieren reposición pronto" : "Niveles de stock óptimos"}
        />
      </div>

      <div className="mt-10">
        <Panel title="Detalle de existencias">
          {/* Barra de búsqueda y filtros */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <SearchInput
              value={busqueda}
              onChange={(val) => {
                setBusqueda(val);
                setPagina(1);
              }}
              placeholder="Buscar por SKU, producto o proveedor..."
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5">
                {(["TODAS", "LYNPHEA DAILY", "LYNPHEA PRO"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => {
                      setFiltroLinea(l);
                      setPagina(1);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      filtroLinea === l
                        ? "border-rose bg-blush font-medium text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {l === "TODAS" ? "Todas las líneas" : l === "LYNPHEA DAILY" ? "Daily" : "Pro"}
                  </button>
                ))}
              </div>

              <div className="hidden h-4 w-px bg-border sm:block" />

              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["DISPONIBLE", "En Stock (>0)"],
                    ["BAJO", `Stock Bajo (1-5)${bajos > 0 ? ` (${bajos})` : ""}`],
                    ["TODOS", `Catálogo Completo (${productos.length})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setFiltroEstado(key);
                      setPagina(1);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      filtroEstado === key
                        ? "border-rose bg-blush font-medium text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tabla de Productos / Stock */}
          {productosFiltrados.length === 0 ? (
            <Empty
              text={
                productos.length === 0
                  ? "Aún no hay productos registrados en el inventario."
                  : "No se encontraron productos con los filtros aplicados."
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {[
                        "#",
                        "SKU",
                        "Producto",
                        "Línea",
                        "Stock",
                        "Costo",
                        "Precio",
                        "Estado",
                        "Acción",
                      ].map((h) => (
                        <th key={h} className="label-caps px-4 py-3 text-left font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {productosPaginados.map((p, idx) => {
                      const indexGlobal =
                        porPagina === "TODOS" ? idx + 1 : (pagina - 1) * porPagina + idx + 1;
                      const currentStock = p.stock || 0;
                      const esAgotado = currentStock === 0;
                      const esBajo = currentStock > 0 && currentStock <= (p.stockMinimo ?? 5);

                      return (
                        <tr
                          key={p.id}
                          className="border-b border-border/60 transition-colors hover:bg-muted/30 last:border-0"
                        >
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {indexGlobal}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">
                            {p.sku}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{p.nombre}</div>
                            {p.descripcion && p.descripcion !== p.nombre && (
                              <div className="truncate max-w-xs text-xs text-muted-foreground font-normal">
                                {p.descripcion}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{p.linea}</td>
                          <td className="px-4 py-3 font-semibold text-foreground">
                            <span
                              className={
                                esAgotado
                                  ? "text-muted-foreground font-normal"
                                  : esBajo
                                    ? "text-amber-600 font-bold dark:text-amber-400"
                                    : "text-emerald-700 font-bold"
                              }
                            >
                              {currentStock}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {money(p.costo || 0)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-medium">
                            {money(p.precio)}
                          </td>
                          <td className="px-4 py-3">
                            <Pill
                              estado={esAgotado ? "Pendiente" : esBajo ? "Bajo" : "Disponible"}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              className="rounded px-2 py-1 text-xs font-medium text-rose hover:bg-blush/60 hover:underline transition-colors"
                              onClick={() => {
                                setEditando(p);
                                setStock(String(p.stock || 0));
                              }}
                            >
                              Ajustar stock
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Barra de paginación */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs">
                <div className="text-muted-foreground">
                  Mostrando{" "}
                  <span className="font-semibold text-foreground">{productosPaginados.length}</span>{" "}
                  de{" "}
                  <span className="font-semibold text-foreground">{productosFiltrados.length}</span>{" "}
                  productos
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={porPagina}
                    onChange={(e) => {
                      const val = e.target.value === "TODOS" ? "TODOS" : Number(e.target.value);
                      setPorPagina(val);
                      setPagina(1);
                    }}
                    className="rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:border-rose"
                  >
                    <option value={25}>25 por pág.</option>
                    <option value={50}>50 por pág.</option>
                    <option value={100}>100 por pág.</option>
                    <option value="TODOS">Todos ({productosFiltrados.length})</option>
                  </select>

                  {totalPaginas > 1 && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPagina((p) => Math.max(1, p - 1))}
                        disabled={pagina <= 1}
                        className="h-7 text-xs px-2.5"
                      >
                        Anterior
                      </Button>
                      <span className="font-mono text-xs px-1 text-muted-foreground">
                        {pagina} / {totalPaginas}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                        disabled={pagina >= totalPaginas}
                        className="h-7 text-xs px-2.5"
                      >
                        Siguiente
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* Modal de ajuste de stock */}
      <Dialog open={Boolean(editando)} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Ajustar inventario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              <strong className="font-mono text-foreground">{editando?.sku}</strong> ·{" "}
              {editando?.nombre}
            </p>
            <div className="grid gap-2">
              <Label>Unidades disponibles en stock</Label>
              <Input
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const value = Number(stock);
                if (!Number.isInteger(value) || value < 0) {
                  toast.error("El stock debe ser un número entero positivo (0 o mayor)");
                  return;
                }
                setProductos((current) =>
                  current.map((product) =>
                    product.id === editando?.id ? { ...product, stock: value } : product,
                  ),
                );
                setEditando(null);
                toast.success("Stock actualizado con éxito");
              }}
            >
              Guardar stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
