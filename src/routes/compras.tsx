import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ExternalLink, FileSpreadsheet } from "lucide-react";
import { ConfirmDialog, Empty, PageHeader, Panel, SearchInput } from "@/components/ui-bits";
import {
  emptyData,
  hoy,
  money,
  compraDraftService,
  PROVEEDORES,
  uid,
  useStored,
  type Compra,
  type CompraItem,
  type Producto,
} from "@/lib/store";

export const Route = createFileRoute("/compras")({
  head: () => ({
    meta: [
      { title: "Compras — LYNPHEA" },
      { name: "description", content: "Registro de compras a proveedores de LYNPHEA." },
      { property: "og:title", content: "Compras — LYNPHEA" },
      { property: "og:description", content: "Compras por proveedor y total invertido." },
    ],
  }),
  component: ComprasPage,
});

type FormItem = { productoId: string; cantidad: string; costo: string };
const nuevoItem = (): FormItem => ({ productoId: "", cantidad: "1", costo: "" });
const vacio = { proveedor: "TRENDY", productos: "", total: "" };
const stockValue = (value: unknown) => {
  const stock = Number(value);
  return Number.isFinite(stock) && stock > 0 ? stock : 0;
};

function itemsDeCompra(compra: Compra, productos: Producto[]): CompraItem[] | null {
  if (compra.items?.length) {
    const resolved = compra.items.flatMap((item) => {
      const product =
        productos.find((entry) => entry.id === item.productoId) ??
        productos.find(
          (entry) =>
            entry.nombre.trim().toLocaleLowerCase() === item.producto.trim().toLocaleLowerCase(),
        );
      return product ? [{ ...item, productoId: product.id }] : [];
    });
    return resolved.length === compra.items.length ? resolved : null;
  }

  const productTexts = compra.productos.split(",").filter((text) => text.trim());
  const resolved = productTexts.flatMap((text): CompraItem[] => {
    const match = text.trim().match(/^(.+?)\s*x\s*(\d+)$/i);
    const name = (match?.[1] ?? text).trim().toLocaleLowerCase();
    const product = productos.find((entry) => entry.nombre.trim().toLocaleLowerCase() === name);
    return product
      ? [
          {
            productoId: product.id,
            producto: product.nombre,
            cantidad: Number(match?.[2]) || 1,
            costo: product.costo ?? 0,
          },
        ]
      : [];
  });
  return resolved.length === productTexts.length ? resolved : null;
}

function ComprasPage() {
  const navigate = useNavigate();
  const [compras, setCompras] = useStored<Compra[]>("compras", emptyData.compras);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(vacio);
  const [editando, setEditando] = useState<string | null>(null);
  const [productos, setProductos] = useStored<Producto[]>("productos", emptyData.productos);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<Compra | null>(null);
  const [items, setItems] = useState<FormItem[]>([nuevoItem()]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const comprasFiltradas = useMemo(
    () =>
      compras.filter(
        (compra) =>
          (!desde || compra.fecha >= desde) &&
          (!hasta || compra.fecha <= hasta) &&
          (!busqueda ||
            `${compra.proveedor} ${compra.productos} ${compra.id}`
              .toLowerCase()
              .includes(busqueda.toLowerCase())),
      ),
    [compras, desde, hasta, busqueda],
  );

  useEffect(() => {
    const migrated = compras.map((compra) => {
      if (compra.items?.length) return compra;
      const parsed = compra.productos.split(",").flatMap((text): CompraItem[] => {
        const match = text.trim().match(/^(.+?)\s*x(\d+)$/i);
        const name = (match?.[1] ?? text).trim().toLowerCase();
        const product = productos.find((item) => {
          const firstWord = item.nombre.toLowerCase().split(" ")[0] ?? "";
          return (
            item.nombre.toLowerCase().includes(name) ||
            (firstWord.length > 0 && name.includes(firstWord))
          );
        });
        return product
          ? [
              {
                productoId: product.id,
                producto: product.nombre,
                cantidad: Number(match?.[2]) || 1,
                costo: product.costo ?? 0,
              },
            ]
          : [];
      });
      return parsed.length
        ? {
            ...compra,
            productos: parsed.map((item) => `${item.producto} x${item.cantidad}`).join(", "),
            items: parsed,
          }
        : compra;
    });
    if (
      migrated.some((compra, index) => {
        const original = compras[index];
        return !original || compra.items !== original.items;
      })
    )
      setCompras(migrated);
  }, [compras, productos, setCompras]);

  const guardar = () => {
    const validItems = items.filter(
      (item) => item.productoId && Number(item.cantidad) > 0 && Number(item.costo) > 0,
    );
    if (!validItems.length) {
      toast.error("Añade al menos un producto válido al pedido");
      return;
    }
    const parsed: CompraItem[] = validItems.map((item) => {
      const product = productos.find((productItem) => productItem.id === item.productoId)!;
      return {
        productoId: product.id,
        producto: product.nombre,
        cantidad: Number(item.cantidad),
        costo: Number(item.costo),
      };
    });
    const orderTotal = parsed.reduce((sum, item) => sum + item.cantidad * item.costo, 0);
    const compraEditada = editando ? compras.find((compra) => compra.id === editando) : undefined;
    const afectaInventario = compraEditada ? compraEditada.recibida !== false : false;
    const oldItems = afectaInventario ? (compraEditada?.items ?? []) : [];
    const stockDelta = new Map<string, number>();
    oldItems.forEach(
      (item) =>
        item.productoId &&
        stockDelta.set(item.productoId, (stockDelta.get(item.productoId) ?? 0) - item.cantidad),
    );
    if (afectaInventario) {
      parsed.forEach(
        (item) =>
          item.productoId &&
          stockDelta.set(item.productoId, (stockDelta.get(item.productoId) ?? 0) + item.cantidad),
      );
    }
    setCompras((prev) =>
      editando
        ? prev.map((compra) =>
            compra.id === editando
              ? {
                  ...compra,
                  proveedor: form.proveedor,
                  productos: parsed.map((item) => `${item.producto} x${item.cantidad}`).join(", "),
                  total: orderTotal,
                  items: parsed,
                }
              : compra,
          )
        : [
            {
              id: uid(),
              fecha: hoy(),
              proveedor: form.proveedor,
              productos: parsed.map((item) => `${item.producto} x${item.cantidad}`).join(", "),
              total: orderTotal,
              recibida: false,
              items: parsed,
            },
            ...prev,
          ],
    );
    setProductos((current) =>
      current.map((product) =>
        stockDelta.has(product.id)
          ? { ...product, stock: product.stock + (stockDelta.get(product.id) ?? 0) }
          : product,
      ),
    );
    setForm(vacio);
    setItems([nuevoItem()]);
    setEditando(null);
    setOpen(false);
    toast.success(editando ? "Compra actualizada" : "Compra registrada");
  };

  const abrirCatalogo = (proveedor: "ATENEA" | "TRENDY", compra?: Compra) => {
    compraDraftService.save({
      ...(compra ? { compraId: compra.id } : {}),
      items: compra?.items ?? [],
    });
    navigate({ to: proveedor === "ATENEA" ? "/catalogo-atenea" : "/catalogo-trendy" });
  };

  const nuevaCompraManual = () => {
    setEditando(null);
    setForm({ ...vacio, proveedor: "OTRO" });
    setItems([nuevoItem()]);
    setOpen(true);
  };

  const editar = (compra: Compra) => {
    const proveedor = compra.proveedor.toUpperCase();
    if (compra.items?.length && (proveedor === "ATENEA" || proveedor === "TRENDY")) {
      abrirCatalogo(proveedor, compra);
      return;
    }

    setEditando(compra.id);
    setForm({
      proveedor: compra.proveedor,
      productos: compra.productos,
      total: String(compra.total),
    });
    setItems(
      (compra.items ?? []).map((item) => ({
        productoId: item.productoId ?? "",
        cantidad: String(item.cantidad),
        costo: String(item.costo),
      })),
    );
    setOpen(true);
  };

  const eliminar = (compra: Compra) => {
    const delta = new Map<string, number>();
    const recibida = compra.recibida !== false;
    if (recibida) {
      (compra.items ?? []).forEach(
        (item) =>
          item.productoId &&
          delta.set(item.productoId, (delta.get(item.productoId) ?? 0) - item.cantidad),
      );
    }
    if (
      [...delta].some(
        ([id, change]) => (productos.find((product) => product.id === id)?.stock ?? 0) + change < 0,
      )
    ) {
      toast.error("No se puede eliminar este pedido porque parte de sus unidades ya fue vendida");
      return;
    }
    setCompras((prev) => prev.filter((item) => item.id !== compra.id));
    setProductos((current) =>
      current.map((product) =>
        delta.has(product.id)
          ? { ...product, stock: product.stock + (delta.get(product.id) ?? 0) }
          : product,
      ),
    );
    toast.success(recibida ? "Pedido eliminado y stock ajustado" : "Pedido pendiente eliminado");
  };

  const cambiarRecepcion = (compra: Compra) => {
    const recibida = compra.recibida !== false;
    const delta = new Map<string, number>();
    const items = itemsDeCompra(compra, productos);
    if (items === null || (compra.productos.trim() && items.length === 0)) {
      toast.error(
        "No se pudo relacionar esta compra con productos del inventario; no se cambió su estado.",
      );
      return;
    }
    items.forEach((item) => {
      if (!item.productoId) return;
      const cambio = recibida ? -item.cantidad : item.cantidad;
      delta.set(item.productoId, (delta.get(item.productoId) ?? 0) + cambio);
    });

    if (
      [...delta].some(
        ([id, change]) =>
          stockValue(productos.find((product) => product.id === id)?.stock) + change < 0,
      )
    ) {
      toast.error(
        "No se puede desactivar esta compra: parte de sus unidades ya fue vendida. El stock no puede quedar negativo.",
      );
      return;
    }

    setCompras((prev) =>
      prev.map((item) => (item.id === compra.id ? { ...item, recibida: !recibida } : item)),
    );
    setProductos((current) =>
      current.map((product) =>
        delta.has(product.id)
          ? { ...product, stock: stockValue(product.stock) + (delta.get(product.id) ?? 0) }
          : product,
      ),
    );
    toast.success(
      recibida ? "Compra desactivada y stock ajustado" : "Compra recibida y stock actualizado",
    );
  };

  return (
    <>
      <PageHeader
        title="Compras"
        subtitle="Reposiciones y pedidos a proveedores"
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  + Registrar compra
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => abrirCatalogo("ATENEA")}>
                  Catálogo Atenea
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => abrirCatalogo("TRENDY")}>
                  Catálogo Trendy
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={nuevaCompraManual}>
                  Compra manual (Otro proveedor)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <Panel title="Historial de compras">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3">
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar pedido o producto"
          />
          <div className="grid gap-1">
            <Label className="text-[10px]">Desde</Label>
            <Input
              className="h-8 w-36 text-xs"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Hasta</Label>
            <Input
              className="h-8 w-36 text-xs"
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
          {(desde || hasta) && (
            <Button
              className="h-8 px-3 text-xs"
              variant="outline"
              onClick={() => {
                setDesde("");
                setHasta("");
              }}
            >
              Limpiar
            </Button>
          )}
        </div>
        {comprasFiltradas.length === 0 ? (
          <Empty text="Aún no hay compras registradas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Fecha", "Proveedor", "Productos", "Total", "Estado", "Acciones"].map((h) => (
                    <th key={h} className="label-caps px-4 py-3 text-left font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comprasFiltradas.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">{c.fecha}</td>
                    <td className="px-4 py-3">{c.proveedor}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <button
                        className="text-left underline"
                        onClick={() => setExpandido(expandido === c.id ? null : c.id)}
                      >
                        {c.productos} {c.items ? (expandido === c.id ? "−" : "+") : ""}
                      </button>
                      {expandido === c.id && c.items ? (
                        <div className="mt-2 space-y-1 text-xs">
                          {c.items.map((item) => (
                            <div key={item.producto}>
                              {item.producto} × {item.cantidad}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{money(c.total)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${
                          c.recibida !== false
                            ? "border-border bg-muted text-foreground"
                            : "border-rose/40 bg-blush text-foreground"
                        }`}
                      >
                        {c.recibida !== false ? "Recibida" : "Pendiente"}
                      </span>
                    </td>
                    <td className="flex gap-3 px-4 py-3">
                      <button
                        className="text-xs text-rose underline"
                        onClick={() => cambiarRecepcion(c)}
                      >
                        {c.recibida !== false ? "Desactivar" : "Marcar recibida"}
                      </button>
                      <button className="text-xs underline" onClick={() => editar(c)}>
                        Editar
                      </button>
                      <button
                        className="text-xs text-muted-foreground underline"
                        onClick={() => setEliminando(c)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {editando ? "Editar compra" : "Registrar compra"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Proveedor</Label>
              <div className="flex gap-2">
                {PROVEEDORES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setForm({ ...form, proveedor: p })}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      form.proveedor === p
                        ? "border-rose bg-blush text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Productos del pedido</Label>
                <Button
                  className="shrink-0"
                  variant="outline"
                  size="sm"
                  onClick={() => setItems([...items, nuevoItem()])}
                >
                  + Añadir producto
                </Button>
              </div>
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_56px_82px_20px] gap-2"
                >
                  <select
                    className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-xs"
                    value={item.productoId}
                    onChange={(e) => {
                      const product = productos.find((entry) => entry.id === e.target.value);
                      if (product?.proveedor) setForm({ ...form, proveedor: product.proveedor });
                      setItems(
                        items.map((current, i) =>
                          i === index
                            ? {
                                ...current,
                                productoId: e.target.value,
                                costo: product ? String(product.costo) : "",
                              }
                            : current,
                        ),
                      );
                    }}
                  >
                    <option value="">Producto por SKU</option>
                    {productos
                      .filter((product) => product.activo !== false)
                      .map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.sku} · {product.nombre}
                        </option>
                      ))}
                  </select>
                  <Input
                    className="min-w-0 px-2"
                    type="number"
                    min="1"
                    value={item.cantidad}
                    onChange={(e) =>
                      setItems(
                        items.map((current, i) =>
                          i === index ? { ...current, cantidad: e.target.value } : current,
                        ),
                      )
                    }
                  />
                  <Input
                    className="min-w-0 px-2"
                    type="number"
                    min="1"
                    value={item.costo}
                    onChange={(e) =>
                      setItems(
                        items.map((current, i) =>
                          i === index ? { ...current, costo: e.target.value } : current,
                        ),
                      )
                    }
                  />
                  <button
                    className="h-9 w-5 text-muted-foreground"
                    aria-label="Eliminar producto"
                    onClick={() => setItems(items.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <p className="text-right text-sm text-muted-foreground">
                Total pedido:{" "}
                {money(
                  items.reduce(
                    (sum, item) => sum + (Number(item.cantidad) || 0) * (Number(item.costo) || 0),
                    0,
                  ),
                )}
              </p>
            </div>
          </div>
          <DialogFooter className="flex flex-wrap justify-between items-center gap-2">
            {editando ? (
              <Button
                variant="destructive"
                onClick={() => {
                  const c = compras.find((item) => item.id === editando);
                  if (c) {
                    setOpen(false);
                    setEliminando(c);
                  }
                }}
              >
                Eliminar compra
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={guardar}>{editando ? "Actualizar compra" : "Guardar compra"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(eliminando)}
        onOpenChange={(open) => !open && setEliminando(null)}
        title="¿Eliminar este pedido?"
        description="Sus unidades se descontarán del inventario. Esta acción no se puede deshacer."
        onConfirm={() => {
          if (eliminando) eliminar(eliminando);
          setEliminando(null);
        }}
      />
    </>
  );
}
