import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Download } from "lucide-react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog, Empty, PageHeader, Panel, Pill, SearchInput } from "@/components/ui-bits";
import { fuzzySearchScore } from "@/lib/product-search";
import {
  emptyData,
  ESTADOS,
  hoy,
  money,
  uid,
  useStored,
  type Producto,
  type Venta,
  type VentaItem,
  type Cliente,
} from "@/lib/store";

export const Route = createFileRoute("/ventas")({ component: VentasPage });
type FormItem = { productoId: string; cantidad: string; precio: string };
const newItem = (): FormItem => ({ productoId: "", cantidad: "1", precio: "" });
const emptyForm = {
  cliente: "",
  telefono: "",
  whatsapp: "",
  instagram: "",
  estado: "Pagado" as Venta["estado"],
  abonado: "",
};
const itemsOf = (venta: Venta): VentaItem[] =>
  venta.items ?? [{ producto: venta.producto, cantidad: venta.cantidad, precio: venta.precio }];

const stockValue = (value: unknown) => {
  const stock = Number(value);
  return Number.isFinite(stock) && stock > 0 ? stock : 0;
};

function productIdForSaleItem(item: VentaItem, products: Producto[]) {
  if (item.productoId && products.some((product) => product.id === item.productoId))
    return item.productoId;
  const normalizedName = item.producto.trim().toLocaleLowerCase();
  return products.find((product) => product.nombre.trim().toLocaleLowerCase() === normalizedName)
    ?.id;
}

function fuzzyProductScore(product: Producto, search: string) {
  return fuzzySearchScore(search, [product.nombre, product.sku, product.categoria ?? ""]);
}

function ProductPicker({
  products,
  value,
  onChange,
}: {
  products: Producto[];
  value: string;
  onChange: (product: Producto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = products.find((product) => product.id === value);
  const rankedProducts = useMemo(
    () =>
      products
        .map((product) => ({
          product,
          score: fuzzyProductScore(product, search),
        }))
        .filter(({ score }) => !search.trim() || score > 0)
        .sort(
          (left, right) =>
            right.score +
            (right.product.stock > 0 ? 0.08 : 0) -
            (left.score + (left.product.stock > 0 ? 0.08 : 0)),
        )
        .map(({ product }) => product),
    [products, search],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 min-w-0 w-full justify-between px-2 text-xs font-normal"
        >
          <span className="truncate text-left">
            {selected ? `${selected.nombre} · ${selected.sku}` : "Buscar producto..."}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-3rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Busca por nombre, SKU o escribe parecido..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No se encontraron productos.</CommandEmpty>
            {rankedProducts.map((product) => (
              <CommandItem
                key={product.id}
                value={product.id}
                onSelect={() => {
                  onChange(product);
                  setOpen(false);
                  setSearch("");
                }}
                className="gap-2 py-2"
              >
                <Check
                  className={`h-4 w-4 shrink-0 ${value === product.id ? "opacity-100" : "opacity-0"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{product.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {product.sku} · {product.stock > 0 ? `${product.stock} en stock` : "Sin stock"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {money(product.precio)}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function VentasPage() {
  const [ventas, setVentas] = useStored<Venta[]>("ventas", emptyData.ventas);
  const [productos, setProductos] = useStored<Producto[]>("productos", emptyData.productos);
  const [clientes, setClientes] = useStored<Cliente[]>("clientes", []);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<FormItem[]>([newItem()]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [eliminando, setEliminando] = useState<Venta | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const filtered = useMemo(
    () =>
      ventas.filter(
        (v) =>
          (!desde || v.fecha >= desde) &&
          (!hasta || v.fecha <= hasta) &&
          (!busqueda ||
            `${v.cliente} ${v.producto} ${v.id} ${v.fecha}`
              .toLowerCase()
              .includes(busqueda.toLowerCase())),
      ),
    [ventas, desde, hasta, busqueda],
  );
  const total = items.reduce((sum, item) => {
    if (!item.productoId) return sum;
    const quantity = Number(item.cantidad);
    const price = Number(item.precio);
    return sum + (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(price) ? price : 0);
  }, 0);
  const paid =
    form.estado === "Regalo"
      ? 0
      : form.estado === "Pagado"
        ? total
        : form.estado === "Pendiente"
          ? 0
          : Math.min(Number(form.abonado) || 0, total);

  const downloadSalesPdf = () => {
    if (filtered.length === 0) {
      toast.error("No hay ventas para descargar con los filtros actuales.");
      return;
    }

    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginLeft = 12;
      const marginRight = 12;
      const marginBottom = 14;
      const columns = { date: 12, client: 39, products: 82, total: 224, status: 254 };
      const formatMoney = (amount: number) =>
        `$${Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString("es-CO")}`;
      const drawTableHeader = (y: number) => {
        pdf.setFillColor(248, 241, 239);
        pdf.rect(marginLeft, y - 5, pageWidth - marginLeft - marginRight, 8, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.text("FECHA", columns.date, y);
        pdf.text("CLIENTE", columns.client, y);
        pdf.text("PRODUCTOS", columns.products, y);
        pdf.text("TOTAL", columns.total, y);
        pdf.text("ESTADO", columns.status, y);
        pdf.setFont("helvetica", "normal");
        return y + 7;
      };

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(17);
      pdf.text("Reporte de ventas", marginLeft, 13);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const filters = [
        desde ? `Desde: ${desde}` : "",
        hasta ? `Hasta: ${hasta}` : "",
        busqueda.trim() ? `Búsqueda: "${busqueda.trim()}"` : "",
      ].filter(Boolean);
      pdf.text(filters.length ? filters.join("   |   ") : "Todas las ventas", marginLeft, 20);
      pdf.text(`Ventas: ${filtered.length}`, pageWidth - marginRight, 20, { align: "right" });

      let y = drawTableHeader(29);
      const lineHeight = 4.2;
      for (const sale of filtered) {
        const productLines = itemsOf(sale).flatMap((item) =>
          pdf.splitTextToSize(
            `- ${item.producto} x ${item.cantidad} (${formatMoney(item.precio)} c/u)`,
            137,
          ),
        );
        const clientLines = pdf.splitTextToSize(sale.cliente, 38);
        const rowLineCount = Math.max(productLines.length, clientLines.length, 1);
        let offset = 0;

        while (offset < rowLineCount) {
          if (y > pageHeight - marginBottom) {
            pdf.addPage();
            y = drawTableHeader(16);
          }
          const linesAvailable = Math.max(
            1,
            Math.floor((pageHeight - marginBottom - y) / lineHeight),
          );
          const chunkSize = Math.min(linesAvailable, rowLineCount - offset);
          const firstChunk = offset === 0;
          pdf.setFontSize(8);
          if (firstChunk) {
            pdf.setFont("helvetica", "bold");
            pdf.text(sale.fecha, columns.date, y);
            pdf.text(formatMoney(sale.total), columns.total, y);
            pdf.text(sale.estado, columns.status, y);
          }
          pdf.setFont("helvetica", "normal");
          const clientChunk = clientLines.slice(offset, offset + chunkSize);
          const productChunk = productLines.slice(offset, offset + chunkSize);
          if (clientChunk.length) pdf.text(clientChunk, columns.client, y);
          if (productChunk.length) pdf.text(productChunk, columns.products, y);

          y += chunkSize * lineHeight + 3;
          offset += chunkSize;
          if (offset < rowLineCount) {
            pdf.addPage();
            y = drawTableHeader(16);
          }
        }
        pdf.setDrawColor(225, 218, 215);
        pdf.line(marginLeft, y - 1, pageWidth - marginRight, y - 1);
      }

      const totalFiltered = filtered.reduce((sum, sale) => sum + sale.total, 0);
      if (y > pageHeight - marginBottom) {
        pdf.addPage();
        y = 18;
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(`Total de ventas filtradas: ${formatMoney(totalFiltered)}`, marginLeft, y + 5);

      const pageCount = pdf.getNumberOfPages();
      for (let page = 1; page <= pageCount; page++) {
        pdf.setPage(page);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(120);
        pdf.text(`Página ${page} de ${pageCount}`, pageWidth - marginRight, pageHeight - 6, {
          align: "right",
        });
      }

      pdf.save(`ventas-${hoy()}.pdf`);
    } catch (error) {
      console.error("No se pudo generar el PDF de ventas:", error);
      toast.error("No se pudo generar el PDF de ventas.");
    }
  };

  const edit = (venta: Venta) => {
    setEditing(venta.id);
    const contact = clientes.find((item) => item.nombre === venta.cliente);
    setForm({
      cliente: venta.cliente,
      telefono: contact?.telefono ?? "",
      whatsapp: contact?.whatsapp ?? "",
      instagram: contact?.instagram ?? "",
      estado: venta.estado,
      abonado: String(venta.abonado),
    });
    setItems(
      itemsOf(venta).map((item) => ({
        productoId: item.productoId ?? productos.find((p) => p.nombre === item.producto)?.id ?? "",
        cantidad: String(item.cantidad),
        precio: String(item.precio),
      })),
    );
    setOpen(true);
  };
  const save = () => {
    const valid = items
      .map((item) => ({ ...item, quantity: Number(item.cantidad), price: Number(item.precio) }))
      .filter(
        (item) =>
          item.productoId &&
          Number.isFinite(item.quantity) &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0 &&
          Number.isFinite(item.price) &&
          item.price > 0,
      );
    if (
      items.some(
        (item) =>
          item.productoId &&
          (!Number.isInteger(Number(item.cantidad)) ||
            Number(item.cantidad) <= 0 ||
            !Number.isFinite(Number(item.precio)) ||
            Number(item.precio) <= 0),
      )
    ) {
      toast.error("Revisa que cada producto tenga una cantidad entera y un precio válido.");
      return;
    }
    if (!form.cliente || !valid.length || (!total && form.estado !== "Regalo")) {
      toast.error("Completa cliente y al menos un producto");
      return;
    }
    const old = editing ? ventas.find((v) => v.id === editing) : undefined;
    const delta = new Map<string, number>();
    if (old) {
      itemsOf(old).forEach((item) => {
        const productId = productIdForSaleItem(item, productos);
        if (productId)
          delta.set(productId, (delta.get(productId) ?? 0) + stockValue(item.cantidad));
      });
    }
    valid.forEach((item) => {
      delta.set(item.productoId, (delta.get(item.productoId) ?? 0) - item.quantity);
    });
    if (
      [...delta].some(
        ([id, change]) =>
          stockValue(productos.find((product) => product.id === id)?.stock) + change < 0,
      )
    ) {
      toast.error("No hay suficiente inventario para registrar esta venta.");
      return;
    }
    const saleItems: VentaItem[] = valid.map((item) => {
      const product = productos.find((p) => p.id === item.productoId);
      if (!product)
        throw new Error(`No se encontró el producto seleccionado (${item.productoId}).`);
      return {
        productoId: item.productoId,
        producto: product.nombre,
        cantidad: item.quantity,
        precio: item.price,
        ...(Number.isFinite(Number(product.costo)) ? { costo: Number(product.costo) } : {}),
      };
    });
    const record: Venta = {
      id: editing ?? uid(),
      fecha: old?.fecha ?? hoy(),
      cliente: form.cliente,
      producto: saleItems.map((item) => item.producto).join(", "),
      cantidad: saleItems.reduce((sum, item) => sum + item.cantidad, 0),
      precio: total / saleItems.reduce((sum, item) => sum + item.cantidad, 0),
      total: form.estado === "Regalo" ? 0 : total,
      abonado: paid,
      estado:
        form.estado === "Regalo"
          ? "Regalo"
          : paid >= total
            ? "Pagado"
            : paid > 0
              ? "Abono"
              : "Pendiente",
      items: saleItems,
    };
    const existingClient = clientes.find(
      (client) => client.nombre.toLowerCase() === form.cliente.trim().toLowerCase(),
    );
    const clientRecord: Cliente = {
      id: existingClient?.id ?? uid(),
      nombre: form.cliente.trim(),
      telefono: form.telefono.trim(),
      whatsapp: form.whatsapp.trim(),
      instagram: form.instagram.trim(),
      creadoEn: existingClient?.creadoEn ?? hoy(),
    };
    setClientes((current) =>
      existingClient
        ? current.map((client) => (client.id === existingClient.id ? clientRecord : client))
        : [clientRecord, ...current],
    );
    setVentas((current) =>
      editing ? current.map((v) => (v.id === editing ? record : v)) : [record, ...current],
    );
    setProductos((current) =>
      current.map((product) =>
        delta.has(product.id)
          ? { ...product, stock: stockValue(product.stock) + (delta.get(product.id) ?? 0) }
          : product,
      ),
    );
    setOpen(false);
    toast.success(editing ? "Venta actualizada" : "Venta registrada");
  };

  const deleteSale = (sale: Venta) => {
    const restored = new Map<string, number>();
    itemsOf(sale).forEach((item) => {
      const productId = productIdForSaleItem(item, productos);
      if (productId) restored.set(productId, (restored.get(productId) ?? 0) + item.cantidad);
    });
    setVentas((current) => current.filter((item) => item.id !== sale.id));
    setProductos((current) =>
      current.map((product) =>
        restored.has(product.id)
          ? { ...product, stock: stockValue(product.stock) + (restored.get(product.id) ?? 0) }
          : product,
      ),
    );
    toast.success("Venta eliminada y stock restaurado");
  };

  return (
    <>
      <PageHeader
        title="Ventas"
        subtitle="Pedidos, productos y estado de pago"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setForm(emptyForm);
              setItems([newItem()]);
              setOpen(true);
            }}
          >
            + Nueva venta
          </Button>
        }
      />
      <Panel title="Todas las ventas">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3">
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar venta, cliente o producto"
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={downloadSalesPdf}
            disabled={filtered.length === 0}
            title="Descargar ventas filtradas en PDF"
            aria-label="Descargar ventas filtradas en PDF"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
        {filtered.length === 0 ? (
          <Empty text="Aún no hay ventas registradas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["", "Fecha", "Cliente", "Productos", "Total", "Estado", "Acciones"].map((h) => (
                    <th key={h} className="label-caps px-4 py-3 text-left font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((venta) => (
                  <>
                    {
                      <tr key={venta.id} className="border-b border-border/60">
                        <td className="px-4 py-3">
                          <button
                            className="text-rose"
                            onClick={() => setExpanded(expanded === venta.id ? null : venta.id)}
                          >
                            {expanded === venta.id ? "−" : "+"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{venta.fecha}</td>
                        <td className="px-4 py-3">{venta.cliente}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {itemsOf(venta).length} ítem(s)
                        </td>
                        <td className="px-4 py-3">{money(venta.total)}</td>
                        <td className="px-4 py-3">
                          <Pill estado={venta.estado} />
                        </td>
                        <td className="flex gap-3 px-4 py-3">
                          <button className="text-xs underline" onClick={() => edit(venta)}>
                            Editar
                          </button>
                          <button
                            className="text-xs text-muted-foreground underline"
                            onClick={() => setEliminando(venta)}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    }
                    {expanded === venta.id && (
                      <tr key={`${venta.id}-items`} className="bg-muted/30">
                        <td colSpan={7} className="px-12 py-3">
                          <div className="space-y-2">
                            {itemsOf(venta).map((item) => (
                              <div
                                key={`${item.producto}-${item.precio}`}
                                className="flex justify-between text-xs"
                              >
                                <span>
                                  {item.producto} × {item.cantidad}
                                </span>
                                <span>{money(item.cantidad * item.precio)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
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
              {editing ? "Editar venta" : "Nueva venta"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid min-w-0 gap-4">
            <div className="grid min-w-0 gap-2">
              <Label>Cliente</Label>
              <Input
                className="w-full min-w-0"
                value={form.cliente}
                onChange={(e) => setForm({ ...form, cliente: e.target.value })}
                placeholder="Claudia Contreras"
              />
            </div>
            <div className="grid min-w-0 gap-3 border-t border-border pt-3">
              <div>
                <p className="text-sm font-medium">Contacto para recompras</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Guárdalo para preparar promociones por WhatsApp.
                </p>
              </div>
              <div className="grid min-w-0 grid-cols-1 sm:grid-cols-3 gap-2">
                <Input
                  className="min-w-0"
                  placeholder="Teléfono"
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                />
                <Input
                  className="min-w-0"
                  placeholder="WhatsApp"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                />
                <Input
                  className="min-w-0"
                  placeholder="Instagram"
                  value={form.instagram}
                  onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                />
              </div>
            </div>
            <div className="grid min-w-0 gap-3 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <Label>Productos del pedido</Label>
                <Button variant="outline" size="sm" onClick={() => setItems([...items, newItem()])}>
                  + Añadir ítem
                </Button>
              </div>
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_64px_96px_28px] items-center gap-2"
                >
                  <ProductPicker
                    products={productos.filter((product) => product.activo !== false)}
                    value={item.productoId}
                    onChange={(product) =>
                      setItems(
                        items.map((current, i) =>
                          i === index
                            ? {
                                ...current,
                                productoId: product.id,
                                precio: String(product.precio),
                              }
                            : current,
                        ),
                      )
                    }
                  />
                  <Input
                    type="number"
                    min="1"
                    className="h-9 min-w-0 px-1.5 text-center text-xs"
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
                    type="number"
                    className="h-9 min-w-0 px-2 text-right text-xs"
                    placeholder="Precio"
                    value={item.precio}
                    onChange={(e) =>
                      setItems(
                        items.map((current, i) =>
                          i === index ? { ...current, precio: e.target.value } : current,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="flex h-9 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive text-base font-bold transition-colors cursor-pointer"
                    title="Eliminar producto de la venta"
                    onClick={() => setItems(items.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="grid gap-2">
              <Label>Estado de pago</Label>
              <div className="flex flex-wrap gap-2">
                {ESTADOS.map((estado) => (
                  <button
                    key={estado}
                    onClick={() => setForm({ ...form, estado })}
                    className={`rounded-full border px-3 py-1.5 text-xs ${form.estado === estado ? "border-rose bg-blush" : "border-border text-muted-foreground"}`}
                  >
                    {estado}
                  </button>
                ))}
              </div>
            </div>
            {form.estado === "Abono" && (
              <div className="grid gap-2">
                <Label>Abonado</Label>
                <Input
                  type="number"
                  value={form.abonado}
                  onChange={(e) => setForm({ ...form, abonado: e.target.value })}
                />
              </div>
            )}
            <div className="rounded-md border border-border bg-muted/60 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span>{form.estado === "Regalo" ? "Valor referencial" : "Total pedido"}</span>
                <span>{money(total)}</span>
              </div>
              {form.estado === "Regalo" && (
                <div className="mt-1 flex justify-between font-medium text-rose">
                  <span>Total cobrado por este regalo</span>
                  <span>{money(0)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between text-muted-foreground">
                <span>Saldo</span>
                <span>{money(form.estado === "Regalo" ? 0 : total - paid)}</span>
              </div>
            </div>
          </div>
          <DialogFooter className="flex flex-wrap justify-between items-center gap-2">
            {editing ? (
              <Button
                variant="destructive"
                onClick={() => {
                  const toDelete = ventas.find((sale) => sale.id === editing);
                  if (!toDelete) {
                    toast.error("No se encontró la venta para eliminar.");
                    return;
                  }
                  setOpen(false);
                  setEliminando(toDelete);
                }}
              >
                Eliminar venta
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={save}>{editing ? "Actualizar venta" : "Guardar venta"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(eliminando)}
        onOpenChange={(open) => !open && setEliminando(null)}
        title="¿Eliminar esta venta?"
        description="La venta se eliminará y sus unidades regresarán al inventario."
        onConfirm={() => {
          if (eliminando) deleteSale(eliminando);
          setEliminando(null);
        }}
      />
    </>
  );
}
