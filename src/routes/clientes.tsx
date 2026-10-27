import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { Download, Plus, Trash2, UserPlus, Users, Wallet } from "lucide-react";
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
  CANALES,
  emptyData,
  hoy,
  METODOS_PAGO,
  money,
  uid,
  useStored,
  type Cliente,
  type Pago,
  type Venta,
  type VentaItem,
} from "@/lib/store";
import {
  ConfirmDialog,
  Empty,
  PageHeader,
  Panel,
  Pill,
  SearchInput,
  StatCard,
} from "@/components/ui-bits";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — LYNPHEA" },
      {
        name: "description",
        content: "Gestión de clientes, historial de compras y cuentas de cobro.",
      },
      { property: "og:title", content: "Clientes — LYNPHEA" },
    ],
  }),
  component: ClientesPage,
});

const nuevoClienteForm = {
  nombre: "",
  telefono: "",
  whatsapp: "",
  instagram: "",
  canal: "Instagram" as (typeof CANALES)[number],
  notas: "",
};

function ClientesPage() {
  const [ventas, setVentas] = useStored<Venta[]>("ventas", emptyData.ventas);
  const [clientesRegistrados, setClientesRegistrados] = useStored<Cliente[]>("clientes", []);
  const [, setPagos] = useStored<Pago[]>("pagos", []);

  // Modales
  const [cliente, setCliente] = useState<string | null>(null);
  const [modalNuevoCliente, setModalNuevoCliente] = useState(false);
  const [formCliente, setFormCliente] = useState(nuevoClienteForm);
  const [eliminandoCliente, setEliminandoCliente] = useState<string | null>(null);

  // Cobros y Facturación
  const [modo, setModo] = useState<"abono" | "factura">("abono");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("Efectivo");
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  const [filtro, setFiltro] = useState<"todos" | "pagados" | "cobrar">("todos");
  const [busqueda, setBusqueda] = useState("");

  // Nombres únicos derivados de clientes registrados y ventas reales
  const nombres = useMemo(() => {
    const fromVentas = ventas.map((v) => v.cliente?.trim()).filter(Boolean);
    const fromRegistrados = clientesRegistrados.map((c) => c.nombre?.trim()).filter(Boolean);
    return Array.from(new Set([...fromRegistrados, ...fromVentas])).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [ventas, clientesRegistrados]);

  const filas = useMemo(() => {
    return nombres.map((nombre) => {
      const own = ventas.filter((v) => v.cliente === nombre);
      const reg = clientesRegistrados.find((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
      return {
        id: reg?.id ?? uid(),
        nombre,
        telefono: reg?.telefono || reg?.whatsapp || "",
        instagram: reg?.instagram || "",
        canal: reg?.canal || "",
        compras: own.length,
        acumulado: own.reduce((s, v) => s + v.total, 0),
        saldo: own.reduce((s, v) => s + Math.max(v.total - (v.abonado || 0), 0), 0),
        ultima:
          own
            .map((v) => v.fecha)
            .sort()
            .at(-1) ?? "—",
        obligations: own.filter((v) => v.total > (v.abonado || 0)),
      };
    });
  }, [nombres, ventas, clientesRegistrados]);

  const selectedClient = filas.find((row) => row.nombre === cliente);

  const clientesFiltrados = useMemo(() => {
    return filas.filter((row) => {
      const matchBusqueda =
        !busqueda ||
        `${row.nombre} ${row.telefono} ${row.instagram}`
          .toLowerCase()
          .includes(busqueda.toLowerCase());
      const matchFiltro =
        filtro === "todos" || (filtro === "pagados" ? row.saldo === 0 : row.saldo > 0);
      return matchBusqueda && matchFiltro;
    });
  }, [filas, busqueda, filtro]);

  // Métricas
  const totalClientes = filas.length;
  const clientesConSaldo = filas.filter((c) => c.saldo > 0).length;
  const totalCartera = filas.reduce((s, c) => s + c.saldo, 0);
  const totalVentasClientes = filas.reduce((s, c) => s + c.acumulado, 0);

  const guardarNuevoCliente = () => {
    if (!formCliente.nombre.trim()) {
      toast.error("El nombre del cliente es obligatorio");
      return;
    }
    const nombreLimpio = formCliente.nombre.trim();
    const yaExiste = clientesRegistrados.some(
      (c) => c.nombre.toLowerCase() === nombreLimpio.toLowerCase(),
    );
    if (yaExiste) {
      toast.error("Ya existe un cliente registrado con ese nombre");
      return;
    }

    const nuevo: Cliente = {
      id: uid(),
      nombre: nombreLimpio,
      telefono: formCliente.telefono.trim() || undefined,
      whatsapp: formCliente.whatsapp.trim() || undefined,
      instagram: formCliente.instagram.trim() || undefined,
      canal: formCliente.canal,
      notas: formCliente.notas.trim() || undefined,
      creadoEn: hoy(),
    };

    setClientesRegistrados((prev) => [...prev, nuevo]);
    setFormCliente(nuevoClienteForm);
    setModalNuevoCliente(false);
    toast.success("Cliente guardado correctamente");
  };

  const openCobro = (name: string) => {
    const row = filas.find((item) => item.nombre === name);
    setCliente(name);
    setModo("abono");
    setMonto("");
    setSeleccionadas(row?.obligations.map((v) => v.id) ?? []);
  };

  const abonar = () => {
    const amount = Number(monto);
    if (!selectedClient || !amount || amount > selectedClient.saldo) {
      toast.error("El abono debe ser mayor a 0 y no superar el saldo pendiente");
      return;
    }
    setVentas((current) => {
      let remaining = amount;
      return current.map((v) => {
        if (v.cliente !== cliente || remaining <= 0) return v;
        const pending = v.total - (v.abonado || 0);
        const applied = Math.min(pending, remaining);
        remaining -= applied;
        const newPaid = (v.abonado || 0) + applied;
        return { ...v, abonado: newPaid, estado: newPaid >= v.total ? "Pagado" : "Abono" };
      });
    });
    setPagos((current) => [
      ...current,
      { id: uid(), fecha: hoy(), cliente: cliente!, monto: amount, metodo, concepto: "Abono" },
    ]);
    setCliente(null);
    toast.success("Abono registrado con éxito");
  };

  const eliminarCliente = (nombre: string) => {
    setClientesRegistrados((prev) =>
      prev.filter((c) => c.nombre.toLowerCase() !== nombre.toLowerCase()),
    );
    setVentas((prev) => prev.filter((v) => v.cliente.toLowerCase() !== nombre.toLowerCase()));
    setPagos((prev) => prev.filter((p) => p.cliente.toLowerCase() !== nombre.toLowerCase()));
    if (cliente === nombre) {
      setCliente(null);
    }
    toast.success(`Cliente "${nombre}" eliminado`);
  };

  const descargarCuenta = (nombreCliente: string, obligations: Venta[]) => {
    if (!obligations.length) {
      toast.error("Selecciona al menos una venta para la cuenta de cobro");
      return;
    }
    const total = obligations.reduce((s, v) => s + v.total - (v.abonado || 0), 0);
    const invoiceLines = obligations.flatMap((sale) => {
      const items: VentaItem[] = sale.items?.length
        ? sale.items
        : [{ producto: sale.producto, cantidad: sale.cantidad, precio: sale.precio }];
      const weights = items.map((item) => Math.max(0, item.cantidad * item.precio));
      const grossTotal = weights.reduce((sum, value) => sum + value, 0);
      const outstanding = Math.max(0, sale.total - (sale.abonado || 0));
      let allocated = 0;

      return items.map((item, index) => {
        const value =
          index === items.length - 1
            ? outstanding - allocated
            : Math.min(
                outstanding - allocated,
                Math.round(
                  outstanding *
                    (grossTotal > 0
                      ? (weights[index] ?? 0) / grossTotal
                      : 1 / Math.max(1, items.length)),
                ),
              );
        allocated += value;
        return {
          product: item.producto,
          quantity: item.cantidad,
          unitPrice: item.precio,
          value,
          date: sale.fecha,
          period: sale.periodo,
        };
      });
    });
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const left = 18;
    const right = pageWidth - 18;
    const contentWidth = right - left;
    const bottomLimit = pageHeight - 24;
    const ink: [number, number, number] = [55, 43, 44];
    const muted: [number, number, number] = [125, 108, 109];
    const rose: [number, number, number] = [178, 91, 103];

    const drawTableHeader = (top: number) => {
      pdf.setFillColor(63, 48, 49);
      pdf.roundedRect(left, top, contentWidth, 11, 2, 2, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.text("PRODUCTO", left + 6, top + 7);
      pdf.text("VALOR", right - 6, top + 7, { align: "right" });
      pdf.setTextColor(...ink);
    };

    const drawContinuationPage = () => {
      pdf.addPage();
      pdf.setFillColor(249, 241, 240);
      pdf.rect(0, 0, pageWidth, 30, "F");
      pdf.setFillColor(...rose);
      pdf.rect(0, 0, 4, 30, "F");
      pdf.setTextColor(...ink);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("LYNPHEA", left, 14);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(...muted);
      pdf.text("CUENTA DE COBRO · CONTINUACIÓN", left, 22);
      pdf.setTextColor(...rose);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(nombreCliente.slice(0, 48), right, 17, { align: "right" });
      drawTableHeader(38);
      return 54;
    };

    pdf.setFillColor(249, 241, 240);
    pdf.roundedRect(left, 14, contentWidth, 38, 4, 4, "F");
    pdf.setFillColor(...rose);
    pdf.roundedRect(left, 14, 4, 38, 2, 2, "F");
    pdf.setTextColor(...ink);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(24);
    pdf.text("LYNPHEA", left + 10, 31);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...muted);
    pdf.text("MAKEUP · BEAUTY", left + 10, 39);
    pdf.setDrawColor(226, 207, 207);
    pdf.line(109, 22, 109, 44);
    pdf.setTextColor(...rose);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("CUENTA DE COBRO", right - 6, 29, { align: "right" });
    pdf.setTextColor(...muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`FECHA  ${hoy()}`, right - 6, 39, { align: "right" });

    pdf.setTextColor(...muted);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("PREPARADA PARA", left, 66);
    pdf.setTextColor(...ink);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    const clientLines = pdf.splitTextToSize(nombreCliente, 112);
    pdf.text(clientLines, left, 75);
    pdf.setTextColor(...muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(
      `${invoiceLines.length} ${invoiceLines.length === 1 ? "producto incluido" : "productos incluidos"}`,
      right,
      74,
      {
        align: "right",
      },
    );

    let y = Math.max(88, 72 + clientLines.length * 7 + 8);
    drawTableHeader(y);
    y += 16;
    invoiceLines.forEach((item, index) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      const productLines = pdf.splitTextToSize(item.product || "Producto", 116);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      const details = [
        `${item.quantity} ${item.quantity === 1 ? "unidad" : "unidades"} × ${money(item.unitPrice)}`,
        item.date,
        item.period,
      ].filter(Boolean);
      const detailLines = pdf.splitTextToSize(details.join("  ·  "), 122);
      const rowHeight = Math.max(21, productLines.length * 5 + detailLines.length * 4 + 8);
      if (y + rowHeight > bottomLimit) y = drawContinuationPage();

      if (index % 2 === 0) {
        pdf.setFillColor(252, 248, 247);
        pdf.roundedRect(left, y - 3, contentWidth, rowHeight, 1.5, 1.5, "F");
      }
      pdf.setTextColor(...ink);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(productLines, left + 6, y + 4);
      pdf.setTextColor(...muted);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(detailLines, left + 6, y + 7 + productLines.length * 5);
      pdf.setTextColor(...rose);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(money(item.value), right - 6, y + 5, { align: "right" });
      y += rowHeight;
    });

    if (y + 42 > bottomLimit) y = drawContinuationPage();
    y += 5;
    pdf.setFillColor(249, 241, 240);
    pdf.roundedRect(right - 77, y, 77, 26, 3, 3, "F");
    pdf.setTextColor(...muted);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("TOTAL A PAGAR", right - 70, y + 9);
    pdf.setTextColor(...rose);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text(money(total), right - 7, y + 20, { align: "right" });
    pdf.setTextColor(...ink);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Gracias por comprar en LYNPHEA.", left, y + 13);

    const pageCount = pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
      pdf.setPage(page);
      pdf.setDrawColor(230, 218, 217);
      pdf.line(left, pageHeight - 17, right, pageHeight - 17);
      pdf.setTextColor(...muted);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.text(
        "Este documento es una cuenta de cobro y no una factura electrónica.",
        left,
        pageHeight - 11,
      );
      pdf.text(`${page} / ${pageCount}`, right, pageHeight - 11, { align: "right" });
    }
    const safeName = nombreCliente
      .trim()
      .replace(/[<>:"/\\|?*]/g, "-")
      .replace(/\s+/g, "-");
    pdf.save(`cuenta-de-cobro-${safeName}.pdf`);
    toast.success("Cuenta de cobro generada");
  };

  const generar = () => {
    if (!selectedClient) return;
    const obligations = selectedClient.obligations.filter((v) => seleccionadas.includes(v.id));
    descargarCuenta(selectedClient.nombre, obligations);
    setCliente(null);
  };

  const descargarCuentaPendiente = (nombreCliente: string) => {
    const row = filas.find((item) => item.nombre === nombreCliente);
    if (!row || row.saldo <= 0) return;
    descargarCuenta(row.nombre, row.obligations);
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Tu comunidad y control de cartera de LYNPHEA"
        action={
          <Button
            onClick={() => {
              setFormCliente(nuevoClienteForm);
              setModalNuevoCliente(true);
            }}
            className="gap-2"
          >
            <UserPlus className="h-4 w-4 text-rose" />
            <span>+ Nuevo Cliente</span>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        <StatCard
          label="Total Clientes"
          value={String(totalClientes)}
          hint="Clientes registrados o activos"
        />
        <StatCard
          label="Clientes al Día"
          value={String(totalClientes - clientesConSaldo)}
          hint="Sin saldo pendiente"
        />
        <StatCard
          label="Por Cobrar (Cartera)"
          value={money(totalCartera)}
          hint={`${clientesConSaldo} cliente(s) con saldo`}
        />
        <StatCard
          label="Ventas Totales"
          value={money(totalVentasClientes)}
          hint="Historial acumulado"
        />
      </div>

      <Panel title="Listado de clientes">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar cliente por nombre..."
          />
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["todos", "Todos"],
                ["pagados", "Al día (Pagados)"],
                ["cobrar", "Por cobrar"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFiltro(value)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  filtro === value
                    ? "border-rose bg-blush font-medium text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {clientesFiltrados.length === 0 ? (
          <Empty
            text={
              filas.length === 0
                ? "Aún no hay clientes registrados. Añade uno con el botón '+ Nuevo Cliente' o al registrar ventas."
                : "No se encontraron clientes con los filtros aplicados."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {[
                    "Cliente",
                    "Compras",
                    "Ventas Acumuladas",
                    "Saldo Pendiente",
                    "Última Compra",
                    "Acciones",
                  ].map((h) => (
                    <th key={h} className="label-caps px-4 py-3 text-left font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((row) => (
                  <tr
                    key={row.nombre}
                    className="border-b border-border/60 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{row.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.compras}</td>
                    <td className="px-4 py-3 font-mono">{money(row.acumulado)}</td>
                    <td className="px-4 py-3 font-mono font-semibold">
                      {row.saldo > 0 ? (
                        <span className="text-destructive">{money(row.saldo)}</span>
                      ) : (
                        <span className="text-muted-foreground">$0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{row.ultima}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.saldo > 0 ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => openCobro(row.nombre)}
                              className="h-7 text-xs"
                            >
                              Cobrar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => descargarCuentaPendiente(row.nombre)}
                              title={`Descargar cuenta de cobro de ${row.nombre}`}
                              aria-label={`Descargar cuenta de cobro de ${row.nombre}`}
                              className="h-7 w-7"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <Pill estado="Pagado" />
                        )}
                        <button
                          type="button"
                          onClick={() => setEliminandoCliente(row.nombre)}
                          title={`Eliminar a ${row.nombre}`}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Modal Nuevo Cliente */}
      <Dialog open={modalNuevoCliente} onOpenChange={setModalNuevoCliente}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Nuevo Cliente</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 text-xs">
            <div className="grid gap-1">
              <Label>Nombre Completo *</Label>
              <Input
                value={formCliente.nombre}
                onChange={(e) => setFormCliente({ ...formCliente, nombre: e.target.value })}
                placeholder="Nombre del cliente"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label>WhatsApp / Teléfono</Label>
                <Input
                  value={formCliente.whatsapp}
                  onChange={(e) => setFormCliente({ ...formCliente, whatsapp: e.target.value })}
                  placeholder="3001234567"
                />
              </div>
              <div className="grid gap-1">
                <Label>Instagram</Label>
                <Input
                  value={formCliente.instagram}
                  onChange={(e) => setFormCliente({ ...formCliente, instagram: e.target.value })}
                  placeholder="@usuario"
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>Canal de Contacto</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                value={formCliente.canal}
                onChange={(e) =>
                  setFormCliente({
                    ...formCliente,
                    canal: e.target.value as (typeof CANALES)[number],
                  })
                }
              >
                {CANALES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>Notas</Label>
              <Input
                value={formCliente.notas}
                onChange={(e) => setFormCliente({ ...formCliente, notas: e.target.value })}
                placeholder="Preferencias o detalles..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalNuevoCliente(false)}>
              Cancelar
            </Button>
            <Button onClick={guardarNuevoCliente}>Guardar Cliente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Cobro / Factura */}
      <Dialog open={Boolean(cliente)} onOpenChange={(open) => !open && setCliente(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Cobrar saldo</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {cliente} · Saldo actual:{" "}
              <strong className="text-foreground font-mono">
                {money(selectedClient?.saldo ?? 0)}
              </strong>
            </p>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant={modo === "abono" ? "default" : "outline"}
              onClick={() => setModo("abono")}
              size="sm"
            >
              Registrar Abono
            </Button>
            <Button
              variant={modo === "factura" ? "default" : "outline"}
              onClick={() => setModo("factura")}
              size="sm"
            >
              Cuenta de Cobro PDF
            </Button>
          </div>
          {modo === "abono" ? (
            <div className="grid gap-3 py-2 text-xs">
              <div className="grid gap-1">
                <Label>Monto a abonar</Label>
                <Input
                  type="number"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="Ej. 30000"
                />
              </div>
              <div className="grid gap-1">
                <Label>Método de Pago</Label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value)}
                >
                  {METODOS_PAGO.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2 text-xs">
              {selectedClient?.obligations.map((v) => (
                <label
                  key={v.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"
                >
                  <span>
                    <input
                      type="checkbox"
                      className="mr-3"
                      checked={seleccionadas.includes(v.id)}
                      onChange={() =>
                        setSeleccionadas((current) =>
                          current.includes(v.id)
                            ? current.filter((id) => id !== v.id)
                            : [...current, v.id],
                        )
                      }
                    />
                    <strong className="text-foreground">{v.producto}</strong>
                    <small className="ml-2 block text-muted-foreground">
                      Total {money(v.total)} · Abonado {money(v.abonado || 0)} · Saldo{" "}
                      {money(v.total - (v.abonado || 0))} · {v.periodo ?? "Sin periodo"}
                    </small>
                  </span>
                  <span className="font-mono font-semibold">
                    {money(v.total - (v.abonado || 0))}
                  </span>
                </label>
              ))}
              <p className="text-right text-xs">
                Total Seleccionado:{" "}
                <strong className="font-mono text-foreground">
                  {money(
                    (selectedClient?.obligations ?? [])
                      .filter((v) => seleccionadas.includes(v.id))
                      .reduce((s, v) => s + v.total - (v.abonado || 0), 0),
                  )}
                </strong>
              </p>
            </div>
          )}
          <DialogFooter className="flex flex-wrap justify-between items-center gap-2">
            {cliente ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  const toDelete = cliente;
                  setCliente(null);
                  setEliminandoCliente(toDelete);
                }}
              >
                Eliminar cliente
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCliente(null)}>
                Cancelar
              </Button>
              <Button onClick={modo === "abono" ? abonar : generar}>
                {modo === "abono" ? "Confirmar Abono" : "Descargar Cuenta de Cobro"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(eliminandoCliente)}
        onOpenChange={(open) => !open && setEliminandoCliente(null)}
        title="¿Eliminar este cliente?"
        description={
          eliminandoCliente
            ? `¿Estás seguro de que deseas eliminar a "${eliminandoCliente}"? Esta acción borrará el registro de este cliente.`
            : "Esta acción no se puede deshacer."
        }
        onConfirm={() => {
          if (eliminandoCliente) eliminarCliente(eliminandoCliente);
          setEliminandoCliente(null);
        }}
      />
    </>
  );
}
