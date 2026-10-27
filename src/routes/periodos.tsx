import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Lock,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Boxes,
  ShoppingBag,
  Receipt,
  Plus,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog, Empty, PageHeader, Panel, Pill } from "@/components/ui-bits";
import {
  emptyData,
  hoy,
  money,
  uid,
  useStored,
  type Compra,
  type Gasto,
  type Periodo,
  type Producto,
  type Venta,
} from "@/lib/store";

export const Route = createFileRoute("/periodos")({
  head: () => ({
    meta: [
      { title: "Periodos — LYNPHEA" },
      {
        name: "description",
        content: "Control de campañas, rotación de inventario y rentabilidad.",
      },
      { property: "og:title", content: "Periodos — LYNPHEA" },
      {
        property: "og:description",
        content: "Gestión de períodos con liquidación de inventario y rotación.",
      },
    ],
  }),
  component: PeriodosPage,
});

type PeriodoFormState = {
  nombre: string;
  fechaInicio: string;
  tipoCierre: "rotacion_automatica" | "manual";
  metaRotacion: number;
  comprasSeleccionadas: string[];
  notas: string;
};

const defaultForm: PeriodoFormState = {
  nombre: "",
  fechaInicio: hoy(),
  tipoCierre: "rotacion_automatica",
  metaRotacion: 80,
  comprasSeleccionadas: [],
  notas: "",
};

function PeriodosPage() {
  const [periodos, setPeriodos] = useStored<Periodo[]>("periodos", emptyData.periodos);
  const [compras] = useStored<Compra[]>("compras", emptyData.compras);
  const [productos] = useStored<Producto[]>("productos", emptyData.productos);
  const comprasRecibidas = useMemo(
    () => compras.filter((compra) => compra.recibida !== false),
    [compras],
  );
  const [ventas] = useStored<Venta[]>("ventas", emptyData.ventas);
  const [gastos] = useStored<Gasto[]>("gastos", emptyData.gastos);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"resumen" | "inventario" | "ventas" | "gastos">(
    "resumen",
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<PeriodoFormState>(defaultForm);
  const [eliminando, setEliminando] = useState<Periodo | null>(null);
  const [finalizando, setFinalizando] = useState<Periodo | null>(null);

  // Map each period to its calculated metrics dynamically and reactively
  const periodosCalculados = useMemo(() => {
    return periodos.map((p) => {
      const fechaInicio = p.fechaInicio || p.inicio || hoy();
      const fechaFin = p.fechaFin || p.final || null;
      const comprasInicialesIds = p.comprasInicialesIds || [];
      const estado = p.estado || (fechaFin ? "cerrado" : "activo");
      const tipoCierre = p.tipoCierre || "manual";
      const metaRotacion = p.metaRotacion || 100;

      // 1. Compras iniciales seleccionadas
      const comprasIniciales = comprasRecibidas.filter((c) => comprasInicialesIds.includes(c.id));
      const costoInicial = comprasIniciales.reduce((sum, c) => sum + (c.total || 0), 0);
      const unidadesIniciales = comprasIniciales.reduce(
        (sum, c) =>
          sum +
          (c.items && c.items.length > 0
            ? c.items.reduce((is, item) => is + Number(item.cantidad || 0), 0)
            : 0),
        0,
      );

      // 2. Compras adicionales del período (registradas dentro del período pero no marcadas como iniciales)
      const comprasAdicionales = compras.filter((c) => {
        if (c.recibida === false) return false;
        if (comprasInicialesIds.includes(c.id)) return false;
        if (!c.fecha) return false;
        if (c.fecha < fechaInicio) return false;
        if (fechaFin && c.fecha > fechaFin) return false;
        return true;
      });
      const costoAdicional = comprasAdicionales.reduce((sum, c) => sum + (c.total || 0), 0);
      const unidadesAdicionales = comprasAdicionales.reduce(
        (sum, c) =>
          sum +
          (c.items && c.items.length > 0
            ? c.items.reduce((is, item) => is + Number(item.cantidad || 0), 0)
            : 0),
        0,
      );

      // Total Inventario asociado al período
      const todasCompras = [...comprasIniciales, ...comprasAdicionales];
      const costoTotalInventario = costoInicial + costoAdicional;
      const unidadesTotalesInventario = unidadesIniciales + unidadesAdicionales;
      const nombresProductosPeriodo = new Set(
        todasCompras.flatMap((compra) =>
          (compra.items ?? []).map((item) => item.producto.trim().toLocaleLowerCase()),
        ),
      );
      const idsProductosPeriodo = new Set(
        todasCompras.flatMap((compra) =>
          (compra.items ?? [])
            .map(
              (item) =>
                item.productoId ??
                productos.find(
                  (producto) =>
                    producto.nombre.trim().toLocaleLowerCase() ===
                    item.producto.trim().toLocaleLowerCase(),
                )?.id,
            )
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const inventarioRestanteActual = productos
        .filter(
          (producto) =>
            idsProductosPeriodo.has(producto.id) ||
            nombresProductosPeriodo.has(producto.nombre.trim().toLocaleLowerCase()),
        )
        .reduce(
          (sum, producto) =>
            sum +
            Math.max(0, Number(producto.stock) || 0) * Math.max(0, Number(producto.costo) || 0),
          0,
        );

      // 3. Ventas asociadas al período
      const ventasPeriodo = ventas.filter((v) => {
        if (!v.fecha) return false;
        if (v.fecha < fechaInicio) return false;
        if (fechaFin && v.fecha > fechaFin) return false;
        return true;
      });

      const ventasComerciales = ventasPeriodo.filter((venta) => venta.estado !== "Regalo");
      const regalosEntregados = ventasPeriodo
        .filter((venta) => venta.estado === "Regalo")
        .reduce((sum, venta) => {
          if (venta.items?.length) {
            return (
              sum +
              venta.items.reduce(
                (itemSum, item) => itemSum + Number(item.costo ?? 0) * Number(item.cantidad || 0),
                0,
              )
            );
          }
          return sum + Number(venta.costo ?? 0) * Number(venta.cantidad || 0);
        }, 0);
      const totalVendido = ventasComerciales.reduce((sum, v) => sum + (v.total || 0), 0);
      const totalCobrado = ventasComerciales.reduce((sum, v) => sum + (v.abonado || 0), 0);
      const totalPorCobrar = ventasComerciales.reduce(
        (sum, v) => sum + Math.max((v.total || 0) - (v.abonado || 0), 0),
        0,
      );
      const unidadesVendidas = ventasPeriodo.reduce((sum, v) => sum + (v.cantidad || 0), 0);

      // Costo de la mercancía vendida (COGS)
      const costoVendido = ventasComerciales.reduce((sum, v) => {
        if (v.items && v.items.length > 0) {
          return (
            sum +
            v.items.reduce(
              (is, item) => is + Number(item.cantidad || 0) * Number(item.costo || 0),
              0,
            )
          );
        }
        return sum + Number(v.cantidad || 0) * Number(v.costo || 0);
      }, 0);

      // 4. Gastos asociados al período
      const gastosPeriodo = gastos.filter((g) => {
        if (!g.fecha) return false;
        if (g.fecha < fechaInicio) return false;
        if (fechaFin && g.fecha > fechaFin) return false;
        return true;
      });
      const totalGastos = gastosPeriodo.reduce((sum, g) => sum + (g.valor || 0), 0);

      // 5. Rotación de inventario
      const rotacionPorcentaje =
        unidadesTotalesInventario > 0
          ? Math.min(100, Math.round((unidadesVendidas / unidadesTotalesInventario) * 100))
          : 0;
      const metaAlcanzada = rotacionPorcentaje >= metaRotacion;

      // 6. Utilidades
      const utilidadBruta = totalVendido - costoVendido;
      const utilidadNeta = utilidadBruta - totalGastos;
      const balanceInventario = totalVendido - costoTotalInventario - totalGastos;

      return {
        ...p,
        fechaInicio,
        fechaFin,
        estado,
        tipoCierre,
        metaRotacion,
        comprasIniciales,
        comprasAdicionales,
        todasCompras,
        costoInicial,
        costoAdicional,
        costoTotalInventario,
        inventarioRestanteActual,
        unidadesIniciales,
        unidadesAdicionales,
        unidadesTotalesInventario,
        ventasPeriodo,
        regalosEntregados,
        totalVendido,
        totalCobrado,
        totalPorCobrar,
        unidadesVendidas,
        costoVendido,
        gastosPeriodo,
        totalGastos,
        rotacionPorcentaje,
        metaAlcanzada,
        utilidadBruta,
        utilidadNeta,
        balanceInventario,
      };
    });
  }, [periodos, compras, comprasRecibidas, productos, ventas, gastos]);

  // Selected period to display
  const activePeriodo = useMemo(() => {
    if (selectedId) {
      const found = periodosCalculados.find((p) => p.id === selectedId);
      if (found) return found;
    }
    // Default to first active period or first period in list
    const firstActive = periodosCalculados.find((p) => p.estado === "activo");
    return firstActive || periodosCalculados[0] || null;
  }, [selectedId, periodosCalculados]);

  // Modal Open Handlers
  const abrirNuevoPeriodo = () => {
    setEditandoId(null);
    setForm({
      nombre: `Campaña ${new Date().toLocaleDateString("es-CO", { month: "long" }).toUpperCase()} ${new Date().getFullYear()}`,
      fechaInicio: hoy(),
      tipoCierre: "rotacion_automatica",
      metaRotacion: 80,
      comprasSeleccionadas: comprasRecibidas.map((c) => c.id),
      notas: "",
    });
    setModalOpen(true);
  };

  const abrirEditarPeriodo = (periodo: Periodo) => {
    setEditandoId(periodo.id);
    setForm({
      nombre: periodo.nombre,
      fechaInicio: periodo.fechaInicio || periodo.inicio || hoy(),
      tipoCierre: periodo.tipoCierre || "manual",
      metaRotacion: periodo.metaRotacion || 80,
      comprasSeleccionadas: periodo.comprasInicialesIds || [],
      notas: periodo.notas || "",
    });
    setModalOpen(true);
  };

  const guardarPeriodo = () => {
    if (!form.nombre.trim()) {
      toast.error("El nombre del período es obligatorio");
      return;
    }
    if (!form.fechaInicio) {
      toast.error("La fecha de inicio es obligatoria");
      return;
    }

    if (editandoId) {
      setPeriodos((prev) =>
        prev.map((p) =>
          p.id === editandoId
            ? {
                ...p,
                nombre: form.nombre.trim(),
                fechaInicio: form.fechaInicio,
                inicio: form.fechaInicio,
                tipoCierre: form.tipoCierre,
                metaRotacion: Number(form.metaRotacion) || 80,
                comprasInicialesIds: form.comprasSeleccionadas,
                notas: form.notas.trim() || undefined,
              }
            : p,
        ),
      );
      toast.success("Período actualizado con éxito");
    } else {
      const nuevo: Periodo = {
        id: uid(),
        nombre: form.nombre.trim(),
        fechaInicio: form.fechaInicio,
        inicio: form.fechaInicio,
        fechaFin: null,
        final: undefined,
        estado: "activo",
        tipoCierre: form.tipoCierre,
        metaRotacion: Number(form.metaRotacion) || 80,
        comprasInicialesIds: form.comprasSeleccionadas,
        notas: form.notas.trim() || undefined,
      };
      setPeriodos((prev) => [nuevo, ...prev]);
      setSelectedId(nuevo.id);
      toast.success("¡Período iniciado con éxito!");
    }

    setModalOpen(false);
    setEditandoId(null);
  };

  const finalizarPeriodo = (id: string) => {
    const fechaActual = hoy();
    setPeriodos((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              estado: "cerrado",
              fechaFin: fechaActual,
              final: fechaActual,
            }
          : p,
      ),
    );
    toast.success("Período finalizado y liquidado");
    setFinalizando(null);
  };

  const reabrirPeriodo = (id: string) => {
    setPeriodos((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              estado: "activo",
              fechaFin: null,
              final: undefined,
            }
          : p,
      ),
    );
    toast.success("Período reabierto como activo");
  };

  const eliminarPeriodo = (id: string) => {
    setPeriodos((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
    toast.success("Período eliminado");
    setEliminando(null);
  };

  const toggleCompraSeleccionada = (compraId: string) => {
    setForm((prev) => ({
      ...prev,
      comprasSeleccionadas: prev.comprasSeleccionadas.includes(compraId)
        ? prev.comprasSeleccionadas.filter((id) => id !== compraId)
        : [...prev.comprasSeleccionadas, compraId],
    }));
  };

  const seleccionarTodasCompras = () => {
    setForm((prev) => ({
      ...prev,
      comprasSeleccionadas: comprasRecibidas.map((c) => c.id),
    }));
  };

  const deseleccionarTodasCompras = () => {
    setForm((prev) => ({
      ...prev,
      comprasSeleccionadas: [],
    }));
  };

  // Resumen del modal de creación en tiempo real
  const comprasSeleccionadasItems = comprasRecibidas.filter((c) =>
    form.comprasSeleccionadas.includes(c.id),
  );
  const costoTotalSeleccionadoModal = comprasSeleccionadasItems.reduce(
    (sum, c) => sum + (c.total || 0),
    0,
  );
  const unidadesTotalesSeleccionadasModal = comprasSeleccionadasItems.reduce(
    (sum, c) =>
      sum +
      (c.items && c.items.length > 0
        ? c.items.reduce((is, item) => is + Number(item.cantidad || 0), 0)
        : 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Periodos"
        subtitle="Control de campañas, lotes de inventario, rotación y rentabilidad"
        action={
          <Button onClick={abrirNuevoPeriodo} className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            Iniciar período
          </Button>
        }
      />

      {periodosCalculados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blush text-rose">
            <CalendarDays className="h-8 w-8" />
          </div>
          <h3 className="mt-4 font-display text-2xl">Aún no has iniciado ningún período</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Inicia un período para agrupar compras e inventario, seguir ventas y cobros en tiempo
            real, y liquidar la utilidad con metas de rotación automáticas o manuales.
          </p>
          <div className="mt-6">
            <Button onClick={abrirNuevoPeriodo} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Iniciar mi primer período
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Selector de Períodos Activos e Historial */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-caps mr-1 text-xs text-muted-foreground">Tus períodos:</span>
              {periodosCalculados.map((p) => {
                const isSelected = activePeriodo?.id === p.id;
                const isActivo = p.estado === "activo";
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedId(p.id);
                      setActiveTab("resumen");
                    }}
                    className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs transition-all ${
                      isSelected
                        ? "border-rose bg-blush font-medium text-foreground shadow-sm ring-1 ring-rose/30"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${isActivo ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`}
                    />
                    <span>{p.nombre}</span>
                    <span className="text-[10px] opacity-70">({p.rotacionPorcentaje}% rot.)</span>
                  </button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={abrirNuevoPeriodo}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo período
            </Button>
          </div>

          {activePeriodo && (
            <div className="space-y-6">
              {/* Tarjeta Principal del Período Activo */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="font-display text-3xl text-foreground">
                        {activePeriodo.nombre}
                      </h2>
                      <Pill estado={activePeriodo.estado === "activo" ? "Disponible" : "Pagado"} />
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        {activePeriodo.tipoCierre === "rotacion_automatica"
                          ? `Cierre Automático (Meta: ${activePeriodo.metaRotacion}%)`
                          : "Cierre Manual"}
                      </span>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5 text-rose" strokeWidth={1.5} />
                      <span>
                        Período desde el <strong>{activePeriodo.fechaInicio}</strong>
                        {activePeriodo.fechaFin ? (
                          <>
                            {" "}
                            hasta el <strong>{activePeriodo.fechaFin}</strong> (Cerrado)
                          </>
                        ) : (
                          <>
                            {" "}
                            hasta la <strong>actualidad (En curso)</strong>
                          </>
                        )}
                        {activePeriodo.notas ? ` · ${activePeriodo.notas}` : null}
                      </span>
                    </p>
                  </div>

                  {/* Acciones de gestión del período */}
                  <div className="flex flex-wrap items-center gap-2">
                    {activePeriodo.estado === "activo" ? (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setFinalizando(activePeriodo)}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Finalizar período
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => reabrirPeriodo(activePeriodo.id)}
                        className="gap-1.5"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Reabrir período
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => abrirEditarPeriodo(activePeriodo)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setEliminando(activePeriodo)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>

                {/* Banner de meta alcanzada en modo automático */}
                {activePeriodo.estado === "activo" &&
                  activePeriodo.tipoCierre === "rotacion_automatica" &&
                  activePeriodo.metaAlcanzada && (
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                      <div className="flex items-center gap-3">
                        <Sparkles className="h-5 w-5 text-emerald-600" />
                        <div>
                          <p className="text-sm font-semibold">
                            Meta de rotación alcanzada ({activePeriodo.rotacionPorcentaje}% /{" "}
                            {activePeriodo.metaRotacion}%)
                          </p>
                          <p className="text-xs opacity-85">
                            El inventario asignado a este período ha cumplido el objetivo de ventas.
                            Puedes finalizar y liquidar el período.
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => finalizarPeriodo(activePeriodo.id)}
                      >
                        Cerrar período ahora
                      </Button>
                    </div>
                  )}

                {/* Barra de progreso de rotación */}
                <div className="mt-6 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      Rotación de inventario ({activePeriodo.unidadesVendidas} de{" "}
                      {activePeriodo.unidadesTotalesInventario} unidades vendidas)
                    </span>
                    <span className="font-mono text-muted-foreground">
                      <strong>{activePeriodo.rotacionPorcentaje}%</strong> alcanzado (Meta:{" "}
                      {activePeriodo.metaRotacion}%)
                    </span>
                  </div>
                  <Progress value={activePeriodo.rotacionPorcentaje} className="h-2.5" />
                </div>
              </div>

              {/* Tarjetas de Métricas Clave del Período */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                {/* 1. Costo Inventario */}
                <div className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <p className="label-caps">Costo Inventario</p>
                    <Boxes className="h-4 w-4 text-rose" strokeWidth={1.5} />
                  </div>
                  <p className="mt-2 font-display text-2xl text-foreground sm:text-3xl">
                    {money(activePeriodo.costoTotalInventario)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Inicial: {money(activePeriodo.costoInicial)} · Adicional:{" "}
                    {money(activePeriodo.costoAdicional)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/80">
                    Regalos entregados (al costo): {money(activePeriodo.regalosEntregados)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/80">
                    Inventario restante actual (al costo):{" "}
                    {money(activePeriodo.inventarioRestanteActual)}
                  </p>
                  <div className="mt-3 h-0.5 w-6 bg-rose" />
                </div>

                {/* 2. Ventas */}
                <div className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <p className="label-caps">Ventas Período</p>
                    <ShoppingBag className="h-4 w-4 text-rose" strokeWidth={1.5} />
                  </div>
                  <p className="mt-2 font-display text-2xl text-foreground sm:text-3xl">
                    {money(activePeriodo.totalVendido)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Cobrado:{" "}
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {money(activePeriodo.totalCobrado)}
                    </strong>{" "}
                    · Por cobrar:{" "}
                    <strong className="text-amber-600 dark:text-amber-400">
                      {money(activePeriodo.totalPorCobrar)}
                    </strong>
                  </p>
                  <div className="mt-3 h-0.5 w-6 bg-rose" />
                </div>

                {/* 3. Gastos */}
                <div className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <p className="label-caps">Gastos Operativos</p>
                    <Receipt className="h-4 w-4 text-rose" strokeWidth={1.5} />
                  </div>
                  <p className="mt-2 font-display text-2xl text-foreground sm:text-3xl">
                    {money(activePeriodo.totalGastos)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {activePeriodo.gastosPeriodo.length} gastos registrados en este período
                  </p>
                  <div className="mt-3 h-0.5 w-6 bg-rose" />
                </div>

                {/* 4. Rotación */}
                <div className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <p className="label-caps">% Rotación</p>
                    <TrendingUp className="h-4 w-4 text-rose" strokeWidth={1.5} />
                  </div>
                  <p className="mt-2 font-display text-2xl text-foreground sm:text-3xl">
                    {activePeriodo.rotacionPorcentaje}%
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {activePeriodo.unidadesVendidas} de {activePeriodo.unidadesTotalesInventario}{" "}
                    uds vendidas
                  </p>
                  <div className="mt-3 h-0.5 w-6 bg-rose" />
                </div>

                {/* 5. Utilidad Neta */}
                <div className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <p className="label-caps">Utilidad Neta</p>
                    <Sparkles className="h-4 w-4 text-rose" strokeWidth={1.5} />
                  </div>
                  <p
                    className={`mt-2 font-display text-2xl sm:text-3xl ${
                      activePeriodo.utilidadNeta >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive"
                    }`}
                  >
                    {money(activePeriodo.utilidadNeta)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Margen bruto: {money(activePeriodo.utilidadBruta)}
                  </p>
                  <div className="mt-3 h-0.5 w-6 bg-rose" />
                </div>
              </div>

              {/* Pestañas de Detalle del Período */}
              <div className="space-y-4">
                <div className="flex flex-wrap border-b border-border">
                  {[
                    { key: "resumen" as const, label: "Liquidación & Resumen", icon: BarChart3 },
                    {
                      key: "inventario" as const,
                      label: "Inventario & Compras",
                      count: activePeriodo.todasCompras.length,
                      icon: Boxes,
                    },
                    {
                      key: "ventas" as const,
                      label: "Ventas Realizadas",
                      count: activePeriodo.ventasPeriodo.length,
                      icon: ShoppingBag,
                    },
                    {
                      key: "gastos" as const,
                      label: "Gastos Asociados",
                      count: activePeriodo.gastosPeriodo.length,
                      icon: Receipt,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
                        activeTab === tab.key
                          ? "border-rose text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <tab.icon className="h-4 w-4 text-rose" strokeWidth={1.5} />
                      <span>{tab.label}</span>
                      {typeof tab.count === "number" && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* TAB 1: Liquidación Financiera */}
                {activeTab === "resumen" && (
                  <Panel title="Desglose Financiero y Liquidación del Período">
                    <div className="grid gap-6 p-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <h4 className="label-caps text-xs text-muted-foreground">
                          Flujo de Ventas y Cobros
                        </h4>
                        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4 text-sm">
                          <div className="flex justify-between border-b border-border/50 pb-2">
                            <span className="text-muted-foreground">Total Ventas Facturadas</span>
                            <span className="font-medium">{money(activePeriodo.totalVendido)}</span>
                          </div>
                          <div className="flex justify-between border-b border-border/50 pb-2 text-emerald-600 dark:text-emerald-400">
                            <span>Total Efectivo Cobrado</span>
                            <span className="font-medium">{money(activePeriodo.totalCobrado)}</span>
                          </div>
                          <div className="flex justify-between pb-1 text-amber-600 dark:text-amber-400">
                            <span>Cartera / Saldo Pendiente por Cobrar</span>
                            <span className="font-medium">
                              {money(activePeriodo.totalPorCobrar)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="label-caps text-xs text-muted-foreground">
                          Costos, Inversión y Rentabilidad
                        </h4>
                        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4 text-sm">
                          <div className="flex justify-between border-b border-border/50 pb-2">
                            <span className="text-muted-foreground">
                              Costo Inventario Inicial Seleccionado
                            </span>
                            <span>{money(activePeriodo.costoInicial)}</span>
                          </div>
                          <div className="flex justify-between border-b border-border/50 pb-2">
                            <span className="text-muted-foreground">
                              Costo Compras Adicionales del Período
                            </span>
                            <span>{money(activePeriodo.costoAdicional)}</span>
                          </div>
                          <div className="flex justify-between border-b border-border/50 pb-2">
                            <span className="text-muted-foreground">
                              Gastos Operativos del Período
                            </span>
                            <span className="text-destructive">
                              -{money(activePeriodo.totalGastos)}
                            </span>
                          </div>
                          <div className="flex justify-between pt-1 font-semibold">
                            <span>Utilidad Neta del Período</span>
                            <span
                              className={
                                activePeriodo.utilidadNeta >= 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-destructive"
                              }
                            >
                              {money(activePeriodo.utilidadNeta)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Panel>
                )}

                {/* TAB 2: Inventario & Compras */}
                {activeTab === "inventario" && (
                  <Panel title="Pedidos y Compras Asociadas al Período">
                    {activePeriodo.todasCompras.length === 0 ? (
                      <Empty text="No hay compras asociadas a este período aún." />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              {[
                                "Origen",
                                "Fecha",
                                "Proveedor",
                                "Productos / Detalle",
                                "Unidades",
                                "Total Pedido",
                              ].map((h) => (
                                <th key={h} className="label-caps px-4 py-3 text-left font-normal">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activePeriodo.todasCompras.map((compra) => {
                              const esInicial = (activePeriodo.comprasInicialesIds || []).includes(
                                compra.id,
                              );
                              const unidades =
                                compra.items?.reduce((s, i) => s + Number(i.cantidad || 0), 0) || 0;
                              return (
                                <tr
                                  key={compra.id}
                                  className="border-b border-border/60 last:border-0"
                                >
                                  <td className="px-4 py-3">
                                    {esInicial ? (
                                      <span className="inline-flex rounded-full bg-rose/15 px-2.5 py-0.5 text-[11px] font-medium text-rose">
                                        Inicial Seleccionado
                                      </span>
                                    ) : (
                                      <span className="inline-flex rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                        Adicional Período
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                    {compra.fecha}
                                  </td>
                                  <td className="px-4 py-3 font-medium">{compra.proveedor}</td>
                                  <td className="px-4 py-3 text-muted-foreground">
                                    {compra.productos}
                                  </td>
                                  <td className="px-4 py-3">{unidades} uds</td>
                                  <td className="px-4 py-3 font-semibold">{money(compra.total)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                )}

                {/* TAB 3: Ventas Asociadas */}
                {activeTab === "ventas" && (
                  <Panel title="Ventas Realizadas en este Período">
                    {activePeriodo.ventasPeriodo.length === 0 ? (
                      <Empty text="No hay ventas registradas en las fechas de este período." />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              {[
                                "Fecha",
                                "Cliente",
                                "Productos",
                                "Cantidad",
                                "Total Venta",
                                "Abonado",
                                "Saldo",
                                "Estado",
                              ].map((h) => (
                                <th key={h} className="label-caps px-4 py-3 text-left font-normal">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activePeriodo.ventasPeriodo.map((venta) => (
                              <tr
                                key={venta.id}
                                className="border-b border-border/60 last:border-0"
                              >
                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                  {venta.fecha}
                                </td>
                                <td className="px-4 py-3 font-medium">{venta.cliente}</td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {venta.producto}
                                </td>
                                <td className="px-4 py-3">{venta.cantidad}</td>
                                <td className="px-4 py-3 font-medium">{money(venta.total)}</td>
                                <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">
                                  {money(venta.abonado)}
                                </td>
                                <td className="px-4 py-3 text-amber-600 dark:text-amber-400">
                                  {money(Math.max(0, venta.total - venta.abonado))}
                                </td>
                                <td className="px-4 py-3">
                                  <Pill estado={venta.estado} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                )}

                {/* TAB 4: Gastos Asociados */}
                {activeTab === "gastos" && (
                  <Panel title="Gastos Operacionales del Período">
                    {activePeriodo.gastosPeriodo.length === 0 ? (
                      <Empty text="No hay gastos registrados en este período." />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              {["Fecha", "Categoría", "Descripción", "Valor"].map((h) => (
                                <th key={h} className="label-caps px-4 py-3 text-left font-normal">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activePeriodo.gastosPeriodo.map((gasto) => (
                              <tr
                                key={gasto.id}
                                className="border-b border-border/60 last:border-0"
                              >
                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                  {gasto.fecha}
                                </td>
                                <td className="px-4 py-3">{gasto.categoria}</td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {gasto.descripcion}
                                </td>
                                <td className="px-4 py-3 font-semibold text-destructive">
                                  {money(gasto.valor)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Iniciar / Editar Período */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {editandoId ? "Editar Período" : "Iniciar Nuevo Período"}
            </DialogTitle>
            <DialogDescription>
              Configura el período, selecciona qué compras forman el inventario inicial y elige el
              tipo de cierre.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Nombre y Fecha */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nombre del Período</Label>
                <Input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Campaña Colección Eclipse"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de Inicio</Label>
                <Input
                  type="date"
                  value={form.fechaInicio}
                  onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })}
                />
              </div>
            </div>

            {/* Tipo de Cierre */}
            <div className="space-y-2">
              <Label>Modalidad de Cierre del Período</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div
                  onClick={() => setForm({ ...form, tipoCierre: "rotacion_automatica" })}
                  className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                    form.tipoCierre === "rotacion_automatica"
                      ? "border-rose bg-blush/60 ring-1 ring-rose"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <TrendingUp className="h-4 w-4 text-rose" />
                    <span>Cierre por % de Rotación</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    El período alerta y permite el cierre automático cuando el inventario alcanza tu
                    % de rotación meta.
                  </p>
                </div>

                <div
                  onClick={() => setForm({ ...form, tipoCierre: "manual" })}
                  className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                    form.tipoCierre === "manual"
                      ? "border-rose bg-blush/60 ring-1 ring-rose"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Lock className="h-4 w-4 text-rose" />
                    <span>Cierre Manual</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tú decides exactamente en qué momento finalizar y liquidar el período con el
                    botón de cierre.
                  </p>
                </div>
              </div>
            </div>

            {/* Meta de Rotación */}
            {form.tipoCierre === "rotacion_automatica" && (
              <div className="space-y-1.5 rounded-lg border border-rose/30 bg-blush/20 p-4">
                <Label>Meta de Rotación de Inventario (%)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={form.metaRotacion}
                    onChange={(e) =>
                      setForm({ ...form, metaRotacion: Number(e.target.value) || 0 })
                    }
                    className="max-w-[120px]"
                  />
                  <span className="text-xs text-muted-foreground">
                    El período se considerará cumplido al vender el {form.metaRotacion}% del
                    inventario asociado.
                  </span>
                </div>
              </div>
            )}

            {/* Selector de Compras e Inventario Inicial */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Seleccionar Compras / Pedidos de Inventario Inicial</Label>
                  <p className="text-xs text-muted-foreground">
                    Elige qué compras forman el inventario base. Las compras no seleccionadas no se
                    tomarán en cuenta.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={seleccionarTodasCompras}
                    className="text-xs text-rose hover:underline"
                  >
                    Seleccionar todas
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={deseleccionarTodasCompras}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Deseleccionar todas
                  </button>
                </div>
              </div>

              {comprasRecibidas.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  Aún no hay compras recibidas registradas. Puedes iniciar el período y las compras
                  recibidas futuras se asociarán automáticamente.
                </div>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
                  {comprasRecibidas.map((compra) => {
                    const isChecked = form.comprasSeleccionadas.includes(compra.id);
                    const units =
                      compra.items?.reduce((s, i) => s + Number(i.cantidad || 0), 0) || 0;
                    return (
                      <label
                        key={compra.id}
                        className={`flex cursor-pointer items-center justify-between rounded-md border p-2.5 text-xs transition-colors ${
                          isChecked
                            ? "border-rose/60 bg-blush/30"
                            : "border-border hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCompraSeleccionada(compra.id)}
                            className="h-4 w-4 rounded border-border accent-rose"
                          />
                          <div>
                            <p className="font-medium text-foreground">
                              {compra.proveedor} ·{" "}
                              <span className="text-muted-foreground">{compra.fecha}</span>
                            </p>
                            <p className="line-clamp-1 text-[11px] text-muted-foreground">
                              {compra.productos}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-foreground">{money(compra.total)}</p>
                          <p className="text-[10px] text-muted-foreground">{units} unidades</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Resumen en vivo de compras seleccionadas */}
              <div className="flex justify-between rounded-md bg-muted/40 px-3 py-2 text-xs font-medium">
                <span>
                  Seleccionadas: {comprasSeleccionadasItems.length} de {comprasRecibidas.length}{" "}
                  compras ({unidadesTotalesSeleccionadasModal} unidades)
                </span>
                <span>Costo inicial: {money(costoTotalSeleccionadoModal)}</span>
              </div>
            </div>

            {/* Notas opcionales */}
            <div className="space-y-1.5">
              <Label>Notas u Observaciones (Opcional)</Label>
              <Input
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Ej: Lote de labiales y sombras para lanzamiento"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardarPeriodo}>
              {editandoId ? "Actualizar período" : "Iniciar período"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Confirmación: Finalizar Período */}
      <ConfirmDialog
        open={Boolean(finalizando)}
        onOpenChange={(open) => !open && setFinalizando(null)}
        title="¿Finalizar y liquidar este período?"
        description={
          finalizando
            ? `El período "${finalizando.nombre}" se marcará como cerrado con fecha de hoy (${hoy()}). Podrás consultar todas sus estadísticas en el historial o reabrirlo cuando desees.`
            : "Esta acción finalizará el período actual."
        }
        onConfirm={() => {
          if (finalizando) finalizarPeriodo(finalizando.id);
        }}
      />

      {/* Diálogo de Confirmación: Eliminar Período */}
      <ConfirmDialog
        open={Boolean(eliminando)}
        onOpenChange={(open) => !open && setEliminando(null)}
        title="¿Eliminar este período?"
        description={
          eliminando
            ? `¿Estás seguro de eliminar "${eliminando.nombre}"? Tus ventas, compras y gastos no se borrarán, pero se eliminará el registro de este período.`
            : "Esta acción no se puede deshacer."
        }
        onConfirm={() => {
          if (eliminando) eliminarPeriodo(eliminando.id);
        }}
      />
    </>
  );
}
