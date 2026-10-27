import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Minus,
  PenLine,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { ProductEditorDialog } from "@/components/product-editor-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  emptyData,
  hoy,
  compraDraftService,
  money,
  uid,
  useStored,
  type Compra,
  type CompraItem,
  type Producto,
} from "@/lib/store";
import { ConfirmDialog } from "@/components/ui-bits";
import { fuzzySearchScore } from "@/lib/product-search";
import { useSupabaseAuth } from "@/lib/auth";

export const Route = createFileRoute("/catalogo-atenea")({
  head: () => ({
    meta: [
      { title: "Catálogo Mayorista Atenea — Hoja de Pedido | LYNPHEA" },
      {
        name: "description",
        content: "Hoja de pedido interactiva estilo Excel para compras mayoristas a Atenea.",
      },
      { property: "og:title", content: "Catálogo Mayorista Atenea — Hoja de Pedido" },
    ],
  }),
  component: CatalogoAteneaPage,
});

type QuickMargin = number;

function CatalogoAteneaPage() {
  const navigate = useNavigate();
  const [productos, setProductos, productosReady] = useStored<Producto[]>(
    "productos",
    emptyData.productos,
  );
  const [compras, setCompras, comprasReady] = useStored<Compra[]>("compras", emptyData.compras);
  const { authenticated } = useSupabaseAuth();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Producto | null>(null);

  // Cantidades en memoria del pedido actual: { [productoId]: cantidad }
  const [cantidades, setCantidades] = useState<Record<string, number>>({});

  const [margenPersonalizado, setMargenPersonalizado] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroVista, setFiltroVista] = useState<
    "TODOS" | "SELECCIONADOS" | "SIN_PRECIO" | "CON_STOCK"
  >("TODOS");
  const [orden, setOrden] = useState<
    "defecto" | "nombre" | "costo_asc" | "costo_desc" | "cantidad_desc"
  >("defecto");

  // Paginación
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState<number | "TODOS">(50);

  // Estados de modales
  const [modalConfirmar, setModalConfirmar] = useState(false);
  const [modalExito, setModalExito] = useState(false);
  const [modalVaciar, setModalVaciar] = useState(false);
  const [referenciaPedido, setReferenciaPedido] = useState(`ORD-ATENEA-${hoy().replace(/-/g, "")}`);
  const [ultimoPedidoId, setUltimoPedidoId] = useState<string | null>(null);
  const [editandoCompraId, setEditandoCompraId] = useState<string | null>(null);
  const [compraActualizada, setCompraActualizada] = useState(false);
  const [resumenPedido, setResumenPedido] = useState<{
    totalItems: number;
    totalUnidades: number;
    totalCosto: number;
    totalVenta: number;
    items: {
      producto: Producto;
      cantidad: number;
      costo: number;
      precio: number;
      subtotal: number;
    }[];
  } | null>(null);

  useEffect(() => {
    if (!productosReady || !comprasReady) return;
    const draft = compraDraftService.take();
    if (!draft) return;
    if (draft.compraId && !compras.some((compra) => compra.id === draft.compraId)) {
      toast.error("No se encontró la compra que intentabas editar.");
      return;
    }

    const cantidadesIniciales: Record<string, number> = {};
    const faltantes: string[] = [];
    draft.items.forEach((item) => {
      const product =
        productos.find((entry) => entry.id === item.productoId) ??
        productos.find((entry) => entry.nombre.toLowerCase() === item.producto.toLowerCase());
      if (!product || product.proveedor?.toUpperCase() !== "ATENEA") {
        faltantes.push(item.producto);
        return;
      }
      cantidadesIniciales[product.id] = (cantidadesIniciales[product.id] ?? 0) + item.cantidad;
    });

    setCantidades(cantidadesIniciales);
    setEditandoCompraId(draft.compraId ?? null);
    setCompraActualizada(false);
    if (faltantes.length) {
      toast.error(`No se pudieron precargar estos productos: ${faltantes.join(", ")}`);
    }
  }, [productosReady, comprasReady, productos, compras]);

  // Productos de Atenea
  const productosAtenea = useMemo(() => {
    return productos.filter((p) => (p.proveedor ?? "OTRO").toUpperCase() === "ATENEA");
  }, [productos]);

  // Actualizar cantidad de un producto
  const cambiarCantidad = useCallback((productoId: string, cantidad: number) => {
    const qty = Math.max(0, Math.floor(cantidad || 0));
    setCantidades((prev) => {
      const next = { ...prev };
      if (qty === 0) {
        delete next[productoId];
      } else {
        next[productoId] = qty;
      }
      return next;
    });
  }, []);

  const saveCatalogProduct = (product: Producto) => {
    setProductos((prev) =>
      editingProduct
        ? prev.map((entry) => (entry.id === editingProduct.id ? product : entry))
        : [...prev, product],
    );
    toast.success(
      editingProduct ? "Producto de Atenea actualizado." : "Producto de Atenea creado.",
    );
    setEditingProduct(null);
  };

  const openProductEditor = (product: Producto | null = null) => {
    setEditingProduct(product);
    setEditorOpen(true);
  };

  // Actualizar precio de venta (sincroniza con store y vista)
  const cambiarPrecioVenta = useCallback(
    (productoId: string, nuevoPrecio: number) => {
      const price = Math.max(0, Math.round(nuevoPrecio || 0));
      // Sincronizar directamente con el store global de productos
      setProductos((prev) => prev.map((p) => (p.id === productoId ? { ...p, precio: price } : p)));
    },
    [setProductos],
  );

  // Aplicar margen global sugerido a productos seleccionados o a todos
  const aplicarMargenSugerido = (porcentaje: number) => {
    if (!porcentaje || porcentaje <= 0) {
      toast.error("Ingresa un porcentaje de margen válido mayor a 0");
      return;
    }
    const factor = 1 + porcentaje / 100;
    let actualizados = 0;

    setProductos((prev) =>
      prev.map((p) => {
        if ((p.proveedor ?? "OTRO").toUpperCase() !== "ATENEA") return p;
        const isSelected = Boolean(cantidades[p.id]);
        const shouldUpdate = Object.keys(cantidades).length > 0 ? isSelected : true;

        if (shouldUpdate && p.costo > 0) {
          actualizados++;
          const nuevoPrecio = Math.round((p.costo * factor) / 500) * 500;
          return { ...p, precio: nuevoPrecio };
        }
        return p;
      }),
    );

    toast.success(`Margen del +${porcentaje}% aplicado a ${actualizados} producto(s)`);
  };

  // Filtrado y ordenamiento de la lista
  const listaFiltrada = useMemo(() => {
    return productosAtenea
      .filter((p) => {
        const qty = cantidades[p.id] || 0;
        const precio = p.precio;

        // Filtro de vista
        if (filtroVista === "SELECCIONADOS" && qty <= 0) return false;
        if (filtroVista === "SIN_PRECIO" && precio > 0) return false;
        if (filtroVista === "CON_STOCK" && (p.stock || 0) <= 0) return false;

        return (
          !busqueda.trim() || fuzzySearchScore(busqueda, [p.nombre, p.sku, p.descripcion ?? ""]) > 0
        );
      })
      .sort((a, b) => {
        if (busqueda.trim()) {
          const relevance =
            fuzzySearchScore(busqueda, [b.nombre, b.sku, b.descripcion ?? ""]) -
            fuzzySearchScore(busqueda, [a.nombre, a.sku, a.descripcion ?? ""]);
          if (relevance !== 0) return relevance;
        }
        if (orden === "nombre") return a.nombre.localeCompare(b.nombre);
        if (orden === "costo_asc") return a.costo - b.costo;
        if (orden === "costo_desc") return b.costo - a.costo;
        if (orden === "cantidad_desc") {
          const qtyA = cantidades[a.id] || 0;
          const qtyB = cantidades[b.id] || 0;
          return qtyB - qtyA;
        }
        return 0;
      });
  }, [productosAtenea, cantidades, filtroVista, busqueda, orden]);

  // Cálculos en vivo del pedido
  const calculos = useMemo(() => {
    let totalItems = 0;
    let totalUnidades = 0;
    let totalCosto = 0;
    let totalVenta = 0;

    const items: {
      producto: Producto;
      cantidad: number;
      costo: number;
      precio: number;
      subtotal: number;
    }[] = [];

    for (const [productoId, cantidad] of Object.entries(cantidades)) {
      if (cantidad > 0) {
        const prod = productosAtenea.find((p) => p.id === productoId);
        if (prod) {
          const precio = prod.precio;
          const subtotal = prod.costo * cantidad;
          const subtotalVenta = precio * cantidad;

          totalItems++;
          totalUnidades += cantidad;
          totalCosto += subtotal;
          totalVenta += subtotalVenta;

          items.push({
            producto: prod,
            cantidad,
            costo: prod.costo,
            precio,
            subtotal,
          });
        }
      }
    }

    const utilidadEstimada = totalVenta - totalCosto;
    const margenPorcentaje = totalVenta > 0 ? Math.round((utilidadEstimada / totalVenta) * 100) : 0;

    return {
      totalItems,
      totalUnidades,
      totalCosto,
      totalVenta,
      utilidadEstimada,
      margenPorcentaje,
      items,
    };
  }, [cantidades, productosAtenea]);

  // Paginación efectiva
  const totalPaginas = porPagina === "TODOS" ? 1 : Math.ceil(listaFiltrada.length / porPagina);
  const itemsPaginados = useMemo(() => {
    if (porPagina === "TODOS") return listaFiltrada;
    const inicio = (pagina - 1) * porPagina;
    return listaFiltrada.slice(inicio, inicio + porPagina);
  }, [listaFiltrada, pagina, porPagina]);

  // Resetear cantidades
  const limpiarCantidades = () => {
    if (Object.keys(cantidades).length === 0) return;
    setModalVaciar(true);
  };

  // Abrir confirmación de pedido
  const handleIniciarPedido = () => {
    if (calculos.totalUnidades === 0) {
      toast.error("Coloca una cantidad mayor a 0 en al menos un producto para hacer el pedido.");
      return;
    }
    setResumenPedido(calculos);
    setModalConfirmar(true);
  };

  // Confirmar y procesar el pedido
  const procesarPedido = () => {
    if (!resumenPedido || resumenPedido.items.length === 0) return;

    const compraAnterior = editandoCompraId
      ? compras.find((compra) => compra.id === editandoCompraId)
      : undefined;
    if (editandoCompraId && !compraAnterior) {
      toast.error("No se encontró la compra que intentabas actualizar.");
      return;
    }

    const compraItems: CompraItem[] = resumenPedido.items.map((item) => ({
      productoId: item.producto.id,
      producto: item.producto.nombre,
      cantidad: item.cantidad,
      costo: item.costo,
    }));

    const compraId = compraAnterior?.id ?? uid();
    const recibida = compraAnterior ? compraAnterior.recibida !== false : false;
    const nuevaCompra: Compra = {
      ...compraAnterior,
      id: compraId,
      fecha: compraAnterior?.fecha ?? hoy(),
      proveedor: "ATENEA",
      productos: resumenPedido.items
        .map((item) => `${item.producto.nombre} x${item.cantidad}`)
        .join(", "),
      total: resumenPedido.totalCosto,
      recibida,
      items: compraItems,
    };

    const stockDelta = new Map<string, number>();
    if (recibida) {
      (compraAnterior?.items ?? []).forEach((item) => {
        if (item.productoId) {
          stockDelta.set(item.productoId, (stockDelta.get(item.productoId) ?? 0) - item.cantidad);
        }
      });
      compraItems.forEach((item) => {
        if (item.productoId) {
          stockDelta.set(item.productoId, (stockDelta.get(item.productoId) ?? 0) + item.cantidad);
        }
      });
      if (
        [...stockDelta].some(
          ([id, change]) =>
            (productos.find((product) => product.id === id)?.stock ?? 0) + change < 0,
        )
      ) {
        toast.error("No se puede editar la compra porque parte de sus unidades ya fue vendida.");
        return;
      }
    }

    setCompras((prev) =>
      compraAnterior
        ? prev.map((compra) => (compra.id === compraId ? nuevaCompra : compra))
        : [nuevaCompra, ...prev],
    );
    setProductos((prev) =>
      prev.map((prod) => {
        const itemComprado = resumenPedido.items.find((i) => i.producto.id === prod.id);
        return {
          ...prod,
          ...(stockDelta.has(prod.id)
            ? { stock: prod.stock + (stockDelta.get(prod.id) ?? 0) }
            : {}),
          ...(itemComprado && itemComprado.precio > 0 ? { precio: itemComprado.precio } : {}),
        };
      }),
    );

    setUltimoPedidoId(compraId);
    setCompraActualizada(Boolean(compraAnterior));
    setEditandoCompraId(null);
    setModalConfirmar(false);
    setModalExito(true);
    toast.success(
      compraAnterior
        ? "Compra de Atenea actualizada."
        : "Pedido a Atenea registrado. Márcalo como recibido en Compras cuando llegue.",
    );
  };

  // Exportar pedido actual a Excel (.xlsx)
  const exportarAExcel = () => {
    const dataToExport = (
      calculos.items.length > 0
        ? calculos.items
        : listaFiltrada.map((p) => ({
            producto: p,
            cantidad: cantidades[p.id] || 0,
            costo: p.costo,
            precio: p.precio,
            subtotal: (cantidades[p.id] || 0) * p.costo,
          }))
    ).map((item, index) => ({
      "#": index + 1,
      "SKU LYNPHEA": item.producto.sku,
      "SKU ATENEA": item.producto.sku.replace("LYN-PRO-", ""),
      PRODUCTO: item.producto.nombre,
      DESCRIPCION: item.producto.descripcion || "",
      "STOCK ACTUAL": item.producto.stock || 0,
      "COSTO MAYORISTA": item.costo,
      "PRECIO VENTA (PVP)": item.precio,
      "CANTIDAD A PEDIR": item.cantidad,
      "SUBTOTAL COMPRA": item.subtotal,
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedido Atenea");
    XLSX.writeFile(wb, `Pedido_Atenea_${hoy()}.xlsx`);
    toast.success("Archivo Excel exportado con éxito");
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {/* 1. Barra Superior Principal */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="mx-auto flex flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  if (window.history.length > 1) {
                    window.history.back();
                  } else {
                    window.close();
                  }
                }
              }}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Volver</span>
            </button>

            <div className="h-4 w-px bg-border" />

            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-medium tracking-tight text-foreground sm:text-2xl">
                  Catálogo Oficial Atenea
                </span>
                <span className="rounded-full bg-rose/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-rose">
                  693 Ref. Mayorista
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Hoja de cálculo interactiva de pedidos mayoristas con actualización de precios y
                stock.
              </p>
            </div>
          </div>

          {/* Acciones Rápidas del Encabezado */}
          <div className="flex flex-wrap items-center gap-2">
            {authenticated && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openProductEditor()}
                className="h-8 gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nuevo producto</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={exportarAExcel}
              className="h-8 gap-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5 text-rose" />
              <span>Exportar Excel</span>
            </Button>

            {calculos.totalUnidades > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={limpiarCantidades}
                className="h-8 gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Vaciar Cantidades</span>
              </Button>
            )}

            <Button
              size="sm"
              onClick={handleIniciarPedido}
              disabled={calculos.totalUnidades === 0}
              className="h-8 gap-2 bg-foreground px-4 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              <ShoppingCart className="h-3.5 w-3.5 text-rose" />
              <span>Hacer Pedido ({calculos.totalUnidades})</span>
            </Button>
          </div>
        </div>

        {/* 2. Barra de Control de Filtros y Búsqueda */}
        <div className="border-t border-border/70 bg-muted/30 px-4 py-2.5 sm:px-6">
          <div className="mx-auto flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Buscador */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setPagina(1);
                }}
                placeholder="Buscar por SKU (LYN o Atenea), nombre o descripción..."
                className="w-full rounded-md border border-input bg-background pl-9 pr-8 py-1.5 text-xs placeholder:text-muted-foreground focus:border-rose focus:outline-none focus:ring-1 focus:ring-rose"
              />
              {busqueda && (
                <button
                  onClick={() => setBusqueda("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  title="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Pestañas de Filtro */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "TODOS", label: `Todos (${productosAtenea.length})` },
                  { id: "SELECCIONADOS", label: `Seleccionados (${calculos.totalItems})` },
                  { id: "SIN_PRECIO", label: "Sin Precio de Venta" },
                  { id: "CON_STOCK", label: "Con Stock" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setFiltroVista(tab.id);
                    setPagina(1);
                  }}
                  className={`rounded-md px-3 py-1 text-xs transition-colors ${
                    filtroVista === tab.id
                      ? "border border-rose bg-blush font-medium text-foreground"
                      : "border border-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Herramienta de margen */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-rose shrink-0" />
              <span className="font-medium text-foreground">Margen PVP:</span>
              {([30, 40, 50, 60, 100] as const).map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setMargenPersonalizado(String(pct));
                    aplicarMargenSugerido(pct);
                  }}
                  title={`Establecer precio con margen de +${pct}% sobre el costo`}
                  className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-mono hover:border-rose hover:text-foreground cursor-pointer transition-colors"
                >
                  +{pct}%
                </button>
              ))}

              {/* Margen personalizado a mano */}
              <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-border/80">
                <div className="relative inline-flex items-center">
                  <span className="absolute left-1.5 text-[11px] font-mono text-muted-foreground pointer-events-none">
                    +
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    placeholder="Otro"
                    value={margenPersonalizado}
                    onChange={(e) => setMargenPersonalizado(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = Number(margenPersonalizado);
                        if (val > 0) aplicarMargenSugerido(val);
                      }
                    }}
                    className="w-16 rounded border border-border bg-background pl-4 pr-3.5 py-0.5 text-[11px] font-mono text-foreground focus:border-rose focus:outline-none focus:ring-1 focus:ring-rose placeholder:text-muted-foreground/60"
                    title="Escribe un porcentaje de margen manual (ej: 65)"
                  />
                  <span className="absolute right-1 text-[11px] font-mono text-muted-foreground pointer-events-none">
                    %
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const val = Number(margenPersonalizado);
                    if (val > 0) {
                      aplicarMargenSugerido(val);
                    } else {
                      toast.error("Ingresa un porcentaje de margen válido (ej. 65)");
                    }
                  }}
                  title="Aplicar margen personalizado a los productos"
                  className="rounded border border-rose/50 bg-rose/10 px-2 py-0.5 text-[11px] font-semibold text-rose hover:bg-rose hover:text-white transition-colors cursor-pointer"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 3. Panel de Métricas / Resumen Flotante */}
      <div className="sticky top-[108px] z-30 border-b border-border bg-background/90 px-4 py-2 backdrop-blur sm:px-6 shadow-xs">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <div>
              <span className="text-muted-foreground">Referencias en orden: </span>
              <span className="font-semibold text-foreground">{calculos.totalItems}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Unidades a pedir: </span>
              <span className="font-semibold text-foreground">{calculos.totalUnidades}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Inversión (Costo): </span>
              <span className="font-mono font-bold text-foreground text-sm sm:text-base">
                {money(calculos.totalCosto)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Venta Proyectada (PVP): </span>
              <span className="font-mono font-semibold text-muted-foreground">
                {money(calculos.totalVenta)}
              </span>
            </div>
            {calculos.totalVenta > 0 && (
              <div className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                <TrendingUp className="h-3 w-3" />
                <span>
                  Ganancia Est.: {money(calculos.utilidadEstimada)} ({calculos.margenPorcentaje}%)
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              Mostrando {itemsPaginados.length} de {listaFiltrada.length} referencias
            </span>

            {/* Selector de items por página */}
            <select
              value={porPagina}
              onChange={(e) => {
                const val = e.target.value === "TODOS" ? "TODOS" : Number(e.target.value);
                setPorPagina(val);
                setPagina(1);
              }}
              className="rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:border-rose"
            >
              <option value={25}>25 filas</option>
              <option value={50}>50 filas</option>
              <option value={100}>100 filas</option>
              <option value={250}>250 filas</option>
              <option value="TODOS">Todas ({listaFiltrada.length})</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Tabla de Datos Estilo Excel */}
      <main className="mx-auto px-4 py-4 sm:px-6">
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
                <th className="w-10 px-3 py-2.5 text-center font-mono text-[11px]">#</th>
                <th className="px-3 py-2.5 font-mono text-[11px]">SKU LYNPHEA</th>
                <th className="px-3 py-2.5 font-mono text-[11px]">SKU ATENEA</th>
                <th className="min-w-[240px] px-3 py-2.5">PRODUCTO / DESCRIPCIÓN</th>
                <th className="px-3 py-2.5 text-center">STOCK</th>
                <th className="px-3 py-2.5 text-right">COSTO MAY.</th>
                <th className="min-w-[140px] px-3 py-2.5 text-right font-semibold text-foreground">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    <span>PRECIO DE VENTA</span>
                    <PenLine className="h-3 w-3 text-rose" />
                  </div>
                </th>
                <th className="px-3 py-2.5 text-center">MARGEN</th>
                <th className="min-w-[180px] px-3 py-2.5 text-center font-semibold text-foreground">
                  CANTIDAD A PEDIR
                </th>
                <th className="px-3 py-2.5 text-right font-semibold text-foreground">SUBTOTAL</th>
                <th className="px-2 py-2.5 text-center">{authenticated ? "ACCIONES" : ""}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {itemsPaginados.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground">
                    <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 opacity-30 text-rose" />
                    <p className="text-sm font-medium text-foreground">
                      No se encontraron productos
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Intenta ajustar los términos de búsqueda o cambiar los filtros.
                    </p>
                  </td>
                </tr>
              ) : (
                itemsPaginados.map((item, idx) => {
                  const indexGlobal =
                    porPagina === "TODOS" ? idx + 1 : (pagina - 1) * porPagina + idx + 1;
                  const qty = cantidades[item.id] || 0;
                  const precio = item.precio;
                  const subtotal = item.costo * qty;
                  const isSelected = qty > 0;
                  const margen =
                    precio > 0 && item.costo > 0
                      ? Math.round(((precio - item.costo) / item.costo) * 100)
                      : 0;

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-muted/40 ${
                        isSelected ? "bg-blush/40 font-medium" : ""
                      }`}
                    >
                      {/* # Index */}
                      <td className="px-3 py-2 text-center font-mono text-[11px] text-muted-foreground">
                        {indexGlobal}
                      </td>

                      {/* SKU LYNPHEA */}
                      <td className="px-3 py-2 font-mono text-[11px] font-medium text-foreground">
                        {item.sku}
                      </td>

                      {/* SKU ATENEA */}
                      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                        {item.sku.replace("LYN-PRO-", "")}
                      </td>

                      {/* Nombre & Descripción */}
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{item.nombre}</div>
                        {item.descripcion && item.descripcion !== item.nombre && (
                          <div className="truncate max-w-sm text-[11px] text-muted-foreground font-normal">
                            {item.descripcion}
                          </div>
                        )}
                      </td>

                      {/* Stock Actual */}
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-mono ${
                            (item.stock || 0) > 0
                              ? "bg-emerald-100/80 text-emerald-800 font-semibold"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {item.stock || 0} u.
                        </span>
                      </td>

                      {/* Costo Mayorista */}
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {money(item.costo)}
                      </td>

                      {/* PRECIO VENTA (PVP) - EDITABLE EN CELDA */}
                      <td className="px-3 py-2 text-right">
                        <div className="relative inline-flex items-center justify-end">
                          <span className="absolute left-2 text-muted-foreground pointer-events-none">
                            $
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="500"
                            value={precio === 0 ? "" : precio}
                            placeholder="Definir..."
                            onChange={(e) => {
                              const val = e.target.value === "" ? 0 : Number(e.target.value);
                              cambiarPrecioVenta(item.id, val);
                            }}
                            className={`w-28 rounded border pl-5 pr-2 py-1 text-right font-mono text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-rose ${
                              precio > 0
                                ? "border-border bg-background text-foreground hover:border-rose/60"
                                : "border-amber-300 bg-amber-50/50 text-amber-900 placeholder:text-amber-500/70"
                            }`}
                          />
                        </div>
                      </td>

                      {/* Margen % */}
                      <td className="px-3 py-2 text-center font-mono text-[11px]">
                        {precio > 0 ? (
                          <span
                            className={
                              margen >= 40
                                ? "text-emerald-600 font-semibold"
                                : margen >= 20
                                  ? "text-amber-600 font-medium"
                                  : "text-destructive font-medium"
                            }
                            title={`Ganancia: ${money(precio - item.costo)} (+${margen}% sobre costo)`}
                          >
                            +{margen}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">-</span>
                        )}
                      </td>

                      {/* CANTIDAD A PEDIR - CELDA INTERACTIVA ESTILO EXCEL */}
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(item.id, qty - 1)}
                            disabled={qty <= 0}
                            className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                          >
                            <Minus className="h-3 w-3" />
                          </button>

                          <input
                            type="number"
                            min="0"
                            value={qty === 0 ? "" : qty}
                            placeholder="0"
                            onChange={(e) => {
                              const val = e.target.value === "" ? 0 : Number(e.target.value);
                              cambiarCantidad(item.id, val);
                            }}
                            className={`h-7 w-16 rounded border text-center font-mono text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-rose ${
                              isSelected
                                ? "border-rose bg-white font-bold text-foreground ring-1 ring-rose/40"
                                : "border-border bg-background text-foreground"
                            }`}
                          />

                          <button
                            type="button"
                            onClick={() => cambiarCantidad(item.id, qty + 1)}
                            className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Plus className="h-3 w-3" />
                          </button>

                          {/* Botones rápidos de volumen */}
                          <div className="hidden sm:flex items-center gap-0.5 ml-1">
                            {[6, 12].map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => cambiarCantidad(item.id, qty + v)}
                                className="rounded border border-border/80 bg-muted/60 px-1 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-muted hover:text-foreground"
                                title={`Añadir +${v} unidades`}
                              >
                                +{v}
                              </button>
                            ))}
                          </div>
                        </div>
                      </td>

                      {/* Subtotal Compra */}
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {isSelected ? (
                          <span className="text-foreground">{money(subtotal)}</span>
                        ) : (
                          <span className="text-muted-foreground/40">$0</span>
                        )}
                      </td>

                      {/* Botón vaciar fila */}
                      <td className="px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {authenticated && (
                            <button
                              type="button"
                              onClick={() => openProductEditor(item)}
                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title={`Editar ${item.nombre}`}
                              aria-label={`Editar ${item.nombre}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isSelected && (
                            <button
                              type="button"
                              onClick={() => cambiarCantidad(item.id, 0)}
                              className="p-1 text-muted-foreground/60 transition-colors hover:text-destructive"
                              title="Limpiar cantidad"
                              aria-label={`Quitar ${item.nombre} del pedido`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 5. Controles de Paginación */}
        {totalPaginas > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs">
            <div className="text-muted-foreground">
              Página <span className="font-semibold text-foreground">{pagina}</span> de{" "}
              <span className="font-semibold text-foreground">{totalPaginas}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="h-8 text-xs"
              >
                Anterior
              </Button>

              {/* Botones numéricos de páginas cercanas */}
              {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                let pNum = pagina - 2 + i;
                if (pagina < 3) pNum = i + 1;
                if (pagina > totalPaginas - 2) pNum = totalPaginas - 4 + i;
                if (pNum < 1 || pNum > totalPaginas) return null;

                return (
                  <button
                    key={pNum}
                    onClick={() => setPagina(pNum)}
                    className={`h-8 w-8 rounded-md font-mono text-xs transition-colors ${
                      pagina === pNum
                        ? "bg-foreground text-background font-bold"
                        : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {pNum}
                  </button>
                );
              })}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
                className="h-8 text-xs"
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* 6. Modal de Confirmación de Pedido */}
      <ProductEditorDialog
        key={editorOpen ? (editingProduct?.id ?? "new") : "closed"}
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingProduct(null);
        }}
        products={productos}
        product={editingProduct}
        supplier="ATENEA"
        onSave={saveCatalogProduct}
      />

      <Dialog open={modalConfirmar} onOpenChange={setModalConfirmar}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              Confirmar Pedido de Compra a Atenea
            </DialogTitle>
            <DialogDescription>
              Revisa los productos seleccionados y el total de la inversión antes de procesar el
              pedido.
            </DialogDescription>
          </DialogHeader>

          {resumenPedido && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-4">
                <div>
                  <span className="text-muted-foreground">Proveedor</span>
                  <p className="font-semibold text-foreground">ATENEA (Mayorista)</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha</span>
                  <p className="font-semibold text-foreground">{hoy()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Referencias</span>
                  <p className="font-semibold text-foreground">
                    {resumenPedido.totalItems} productos
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Unidades Totales</span>
                  <p className="font-semibold text-foreground">
                    {resumenPedido.totalUnidades} unidades
                  </p>
                </div>
              </div>

              {/* Lista compacta de items */}
              <div className="max-h-60 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 sticky top-0 border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-mono">SKU</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-center">Cant.</th>
                      <th className="px-3 py-2 text-right">Costo Unit.</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {resumenPedido.items.map((item) => (
                      <tr key={item.producto.id}>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {item.producto.sku}
                        </td>
                        <td className="px-3 py-2 font-medium">{item.producto.nombre}</td>
                        <td className="px-3 py-2 text-center font-mono font-bold">
                          {item.cantidad}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{money(item.costo)}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">
                          {money(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totales y notas */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-rose/30 bg-blush/30 p-3">
                <div className="flex-1">
                  <Label htmlFor="ref-input" className="text-[11px] text-muted-foreground">
                    Referencia / N° Factura (Opcional)
                  </Label>
                  <Input
                    id="ref-input"
                    value={referenciaPedido}
                    onChange={(e) => setReferenciaPedido(e.target.value)}
                    className="h-8 text-xs bg-background mt-1"
                    placeholder="Ej. ORD-ATENEA-2026-01"
                  />
                </div>
                <div className="text-right sm:pl-6">
                  <span className="text-xs text-muted-foreground">TOTAL A PAGAR (INVERSIÓN)</span>
                  <div className="font-mono text-2xl font-bold text-foreground">
                    {money(resumenPedido.totalCosto)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 text-rose" />
                <span>
                  Al confirmar, se guardará el pedido en <strong>Compras</strong>. El inventario se
                  actualizará cuando marques la compra como recibida.
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setModalConfirmar(false)}>
              Cancelar
            </Button>
            <Button
              onClick={procesarPedido}
              className="bg-foreground text-background hover:bg-foreground/90 gap-2"
            >
              <CheckCircle2 className="h-4 w-4 text-rose" />
              <span>{editandoCompraId ? "Guardar cambios de la compra" : "Confirmar pedido"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. Modal de Éxito */}
      <Dialog open={modalExito} onOpenChange={setModalExito}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-left">
            <div className="mx-auto sm:mx-0 mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <DialogTitle className="font-display text-2xl">
              {compraActualizada ? "¡Compra Actualizada!" : "¡Pedido Registrado con Éxito!"}
            </DialogTitle>
            <DialogDescription>
              {compraActualizada
                ? "Los cambios de la compra se guardaron correctamente."
                : "El pedido quedó registrado como pendiente. Márcalo como recibido en Compras cuando lleguen los productos para actualizar el inventario."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID de Registro:</span>
              <span className="font-mono font-semibold">{ultimoPedidoId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Invertido:</span>
              <span className="font-mono font-bold text-foreground">
                {money(resumenPedido?.totalCosto || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unidades pendientes de recepción:</span>
              <span className="font-semibold">{resumenPedido?.totalUnidades || 0} unidades</span>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setCantidades({});
                setModalExito(false);
              }}
              className="w-full sm:w-auto"
            >
              Nuevo Pedido en Hoja
            </Button>
            <Button
              onClick={() => navigate({ to: "/compras" })}
              className="w-full sm:w-auto bg-foreground text-background hover:bg-foreground/90"
            >
              Ir a Compras
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={modalVaciar}
        onOpenChange={setModalVaciar}
        title="¿Vaciar todas las cantidades?"
        description="Esta acción restablecerá a 0 las unidades de todos los productos que habías seleccionado para este pedido."
        onConfirm={() => {
          setCantidades({});
          setModalVaciar(false);
          toast.info("Cantidades del pedido restablecidas a cero");
        }}
      />
    </div>
  );
}
