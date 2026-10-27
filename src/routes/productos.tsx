import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ExternalLink, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog, Empty, PageHeader, Panel, SearchInput } from "@/components/ui-bits";
import { LINEAS, money, PROVEEDORES, uid, type Producto } from "@/lib/store";
import { deleteAdminProduct, fetchAdminProductPage, saveAdminProduct } from "@/lib/supabase-data";

export const Route = createFileRoute("/productos")({
  head: () => ({
    meta: [
      { title: "Productos — LYNPHEA" },
      { name: "description", content: "Catálogo de productos LYNPHEA Daily y Pro." },
      { property: "og:title", content: "Productos — LYNPHEA" },
      { property: "og:description", content: "Catálogo con SKU, costo, precio y stock." },
    ],
  }),
  component: ProductosPage,
});

const vacio = {
  sku: "",
  nombre: "",
  linea: "LYNPHEA DAILY" as Producto["linea"],
  costo: "",
  precio: "",
  proveedor: "TRENDY" as Producto["proveedor"],
};

function skuSugerido(productos: Producto[], linea: Producto["linea"]) {
  const prefijo = linea === "LYNPHEA DAILY" ? "LYN-DAI-" : "LYN-PRO-";
  const usados = productos
    .filter((producto) => producto.sku.toUpperCase().startsWith(prefijo))
    .map((producto) => Number(producto.sku.slice(prefijo.length)))
    .filter(Number.isInteger);
  return `${prefijo}${String(Math.max(0, ...usados) + 1).padStart(3, "0")}`;
}

function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [totalProductos, setTotalProductos] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [recargar, setRecargar] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(vacio);
  const [editando, setEditando] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<Producto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroLinea, setFiltroLinea] = useState<"TODAS" | Producto["linea"]>("TODAS");
  const [filtroProveedor, setFiltroProveedor] = useState<"TODOS" | (typeof PROVEEDORES)[number]>(
    "TODOS",
  );
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(
      () => {
        setCargando(true);
        setErrorCarga(null);
        void fetchAdminProductPage({
          search: busqueda,
          linea: filtroLinea,
          proveedor: filtroProveedor,
          page: pagina,
          pageSize: porPagina,
        })
          .then((result) => {
            if (!active) return;
            setTotalProductos(result.totalCount);
            const lastPage = Math.max(1, Math.ceil(result.totalCount / porPagina));
            if (pagina > lastPage) {
              setPagina(lastPage);
              return;
            }
            setProductos(result.products);
          })
          .catch((error: unknown) => {
            console.error("No se pudieron consultar los productos:", error);
            if (active) {
              setErrorCarga(
                error instanceof Error ? error.message : "No se pudieron cargar los productos.",
              );
            }
          })
          .finally(() => {
            if (active) setCargando(false);
          });
      },
      busqueda.trim() ? 300 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [busqueda, filtroLinea, filtroProveedor, pagina, porPagina, recargar]);

  const guardar = async () => {
    if (!form.sku || !form.nombre) {
      toast.error("SKU y nombre son obligatorios");
      return;
    }
    const sku = form.sku.trim().toUpperCase();
    const duplicate = productos.some(
      (producto) => producto.id !== editando && producto.sku.trim().toUpperCase() === sku,
    );
    if (duplicate) {
      toast.error("Ya existe un producto con ese SKU");
      return;
    }
    const proveedor = (form.proveedor ?? "OTRO") as (typeof PROVEEDORES)[number];
    const productoOriginal = productos.find((producto) => producto.id === editando);
    const producto: Producto = {
      ...(productoOriginal ?? {
        id: uid(),
        stock: 0,
      }),
      sku,
      nombre: form.nombre,
      linea: form.linea,
      proveedor,
      costo: Number(form.costo) || 0,
      precio: Number(form.precio) || 0,
    };
    setGuardando(true);
    try {
      await saveAdminProduct(producto);
      setForm(vacio);
      setEditando(null);
      setOpen(false);
      setRecargar((value) => value + 1);
      toast.success(editando ? "Producto actualizado" : "Producto creado");
    } catch (error) {
      console.error("No se pudo guardar el producto:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el producto.");
    } finally {
      setGuardando(false);
    }
  };

  const editar = (producto: Producto) => {
    setEditando(producto.id);
    setForm({
      sku: producto.sku,
      nombre: producto.nombre,
      linea: producto.linea,
      proveedor: producto.proveedor ?? "OTRO",
      costo: String(producto.costo),
      precio: String(producto.precio),
    });
    setOpen(true);
  };

  const eliminar = async (id: string) => {
    try {
      await deleteAdminProduct(id);
      setRecargar((value) => value + 1);
      toast.success("Producto eliminado del catálogo");
    } catch (error) {
      console.error("No se pudo eliminar el producto:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el producto.");
    }
  };

  const totalPaginas = Math.max(1, Math.ceil(totalProductos / porPagina));

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle={`Catálogo de referencias (${totalProductos.toLocaleString("es-CO")} productos registrados)`}
        action={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 border-border text-foreground hover:bg-blush/60"
                >
                  <FileSpreadsheet className="h-4 w-4 text-rose" />
                  <span>Ver catálogos</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 p-1.5">
                <DropdownMenuItem asChild>
                  <a
                    href="/catalogo-atenea"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between cursor-pointer rounded-md p-2 hover:bg-blush/50"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-xs text-foreground">
                        Catálogo Mayorista Atenea
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        693 referencias • Hoja Excel
                      </span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-rose ml-2 shrink-0" />
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href="/catalogo-trendy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between cursor-pointer rounded-md p-2 hover:bg-blush/50"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-xs text-foreground">
                        Catálogo Mayorista Trendy
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        466 referencias • Hoja Excel
                      </span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-rose ml-2 shrink-0" />
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={() => {
                setEditando(null);
                setForm({ ...vacio, sku: skuSugerido(productos, vacio.linea) });
                setOpen(true);
              }}
            >
              + Nuevo producto
            </Button>
          </div>
        }
      />

      <Panel title="Catálogo de Productos">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <SearchInput
            value={busqueda}
            onChange={(val) => {
              setBusqueda(val);
              setPagina(1);
            }}
            placeholder="Buscar por SKU, nombre o proveedor..."
          />
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro por Proveedor */}
            <div className="flex flex-wrap gap-1">
              {(["TODOS", "ATENEA", "TRENDY", "OTRO"] as const).map((prov) => (
                <button
                  key={prov}
                  onClick={() => {
                    setFiltroProveedor(prov);
                    setPagina(1);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    filtroProveedor === prov
                      ? "border-rose bg-blush font-medium text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {prov === "TODOS" ? "Todos Prov." : prov}
                </button>
              ))}
            </div>

            <div className="hidden h-4 w-px bg-border sm:block" />

            {/* Filtro por Línea */}
            <div className="flex flex-wrap gap-1">
              {(["TODAS", "LYNPHEA DAILY", "LYNPHEA PRO"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => {
                    setFiltroLinea(l);
                    setPagina(1);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    filtroLinea === l
                      ? "border-rose bg-blush font-medium text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {l === "TODAS" ? "Todas las líneas" : l === "LYNPHEA DAILY" ? "Daily" : "Pro"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {errorCarga ? (
          <div className="flex flex-wrap items-center justify-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-destructive" role="alert">
              No se pudieron cargar los productos: {errorCarga}
            </p>
            <Button variant="outline" size="sm" onClick={() => setRecargar((value) => value + 1)}>
              Reintentar
            </Button>
          </div>
        ) : cargando && productos.length === 0 ? (
          <Empty text="Cargando productos..." />
        ) : productos.length === 0 ? (
          <Empty
            text={totalProductos === 0 ? "No se encontraron productos." : "Cargando productos..."}
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
                      "Proveedor",
                      "Costo",
                      "Precio Venta",
                      "Stock",
                      "Acciones",
                    ].map((h) => (
                      <th key={h} className="label-caps px-4 py-3 text-left font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productos.map((p, idx) => {
                    const indexGlobal = (pagina - 1) * porPagina + idx + 1;
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {indexGlobal}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">
                          {p.sku}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{p.nombre}</div>
                          {p.descripcion && p.descripcion !== p.nombre && (
                            <div className="truncate max-w-xs text-xs text-muted-foreground font-normal">
                              {p.descripcion}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{p.linea}</td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                            {p.proveedor ?? "OTRO"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {money(p.costo)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                          {money(p.precio)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-mono ${
                              (p.stock || 0) > 0
                                ? "bg-emerald-100/80 text-emerald-800 font-semibold"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {p.stock || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => editar(p)}
                              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => setEliminando(p)}
                              className="text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
                            >
                              Eliminar
                            </button>
                          </div>
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
                Mostrando <span className="font-semibold text-foreground">{productos.length}</span>{" "}
                de <span className="font-semibold text-foreground">{totalProductos}</span> productos
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={porPagina}
                  onChange={(e) => {
                    setPorPagina(Number(e.target.value));
                    setPagina(1);
                  }}
                  className="rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:border-rose"
                >
                  <option value={25}>25 por pág.</option>
                  <option value={50}>50 por pág.</option>
                  <option value={100}>100 por pág.</option>
                </select>

                {totalPaginas > 1 && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPagina((p) => Math.max(1, p - 1))}
                      disabled={pagina <= 1 || cargando}
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
                      disabled={pagina >= totalPaginas || cargando}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {editando ? "Editar producto" : "Nuevo producto"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>SKU</Label>
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder={editando ? "SKU actual" : skuSugerido(productos, form.linea)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Nombre</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Línea</Label>
              <div className="flex gap-2">
                {LINEAS.map((l) => (
                  <button
                    key={l}
                    onClick={() =>
                      setForm({
                        ...form,
                        linea: l,
                        sku: editando ? form.sku : skuSugerido(productos, l),
                      })
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      form.linea === l
                        ? "border-rose bg-blush text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Proveedor</Label>
              <div className="flex flex-wrap gap-2">
                {PROVEEDORES.map((proveedor) => (
                  <button
                    key={proveedor}
                    onClick={() => setForm({ ...form, proveedor })}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      form.proveedor === proveedor
                        ? "border-rose bg-blush text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {proveedor}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Costo</Label>
                <Input
                  type="number"
                  value={form.costo}
                  onChange={(e) => setForm({ ...form, costo: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Precio</Label>
                <Input
                  type="number"
                  value={form.precio}
                  onChange={(e) => setForm({ ...form, precio: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {editando ? (
              <Button
                type="button"
                variant="ghost"
                className="px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  const prod = productos.find((p) => p.id === editando);
                  if (prod) {
                    setOpen(false);
                    setEliminando(prod);
                  }
                }}
              >
                Eliminar producto
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void guardar()} disabled={guardando}>
                {editando ? "Actualizar producto" : "Crear producto"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(eliminando)}
        onOpenChange={(open) => !open && setEliminando(null)}
        title="¿Eliminar este producto?"
        description={
          eliminando
            ? `¿Estás seguro de que deseas eliminar "${eliminando.nombre}" (${eliminando.sku})? Esta acción lo removerá del catálogo.`
            : "Esta acción no se puede deshacer."
        }
        onConfirm={() => {
          if (eliminando) eliminar(eliminando.id);
          setEliminando(null);
        }}
      />
    </>
  );
}
