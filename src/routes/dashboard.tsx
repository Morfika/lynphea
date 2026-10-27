import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ShoppingBag,
  Receipt,
  Boxes,
  CalendarDays,
  ArrowUpRight,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, PageHeader, Panel, Pill, StatCard } from "@/components/ui-bits";
import { emptyData, money, useStored, type Gasto, type Producto, type Venta } from "@/lib/store";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — LYNPHEA Makeup & Beauty" },
      {
        name: "description",
        content: "Panel de control general, métricas de ventas y rendimiento financiero.",
      },
      { property: "og:title", content: "Dashboard — LYNPHEA" },
      { property: "og:description", content: "Resumen del negocio LYNPHEA Makeup & Beauty." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const [ventas] = useStored<Venta[]>("ventas", emptyData.ventas);
  const [productos] = useStored<Producto[]>("productos", emptyData.productos);
  const [gastos] = useStored<Gasto[]>("gastos", emptyData.gastos);

  // Totales financieros
  const ventasComerciales = ventas.filter((venta) => venta.estado !== "Regalo");
  const totalVentas = ventasComerciales.reduce((s, v) => s + v.total, 0);
  const totalCobrado = ventasComerciales.reduce((s, v) => s + (v.abonado || 0), 0);
  const totalPorCobrar = ventasComerciales.reduce(
    (s, v) => s + Math.max(v.total - (v.abonado || 0), 0),
    0,
  );
  const totalGastos = gastos.reduce((s, g) => s + g.valor, 0);

  // Cálculo de costos reales de ventas
  const costoTotalVentas = ventasComerciales.reduce((sum, v) => {
    if (v.items && v.items.length > 0) {
      return sum + v.items.reduce((s, it) => s + (it.costo ?? 0) * it.cantidad, 0);
    }
    return sum + (v.costo ?? v.total * 0.45);
  }, 0);

  const utilidadBruta = totalVentas - costoTotalVentas;
  const utilidadOperativa = utilidadBruta - totalGastos;
  const margen = totalVentas > 0 ? Math.round((utilidadOperativa / totalVentas) * 100) : 0;
  const valorInventario = productos.reduce((s, p) => s + (p.stock || 0) * (p.costo || 0), 0);
  const totalUnidades = ventas.reduce((s, v) => s + (v.cantidad || 1), 0);
  const ticketPromedio = ventasComerciales.length > 0 ? totalVentas / ventasComerciales.length : 0;

  // Tendencia de ventas de los últimos 7 días
  const dias = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - i));
    const key = day.toISOString().slice(0, 10);
    const ventasDelDia = ventas.filter((v) => v.fecha === key);
    return {
      dia: day.toLocaleDateString("es-CO", { weekday: "short" }),
      total: ventasDelDia
        .filter((venta) => venta.estado !== "Regalo")
        .reduce((s, v) => s + v.total, 0),
      count: ventasDelDia.length,
    };
  });

  // Comparativa de flujo (antiguo Reportes)
  const flujoFinanciero = [
    { nombre: "Ventas", valor: totalVentas },
    { nombre: "Cobrado", valor: totalCobrado },
    { nombre: "Por cobrar", valor: totalPorCobrar },
    { nombre: "Gastos", valor: totalGastos },
  ];

  // Productos con stock bajo (solo productos con 1 a 5 unidades físicas; 0 unidades no generan alertas)
  const stockBajo = productos.filter(
    (p) => (p.stock || 0) >= 1 && (p.stock || 0) <= (p.stockMinimo ?? 5) && p.activo !== false,
  );
  const productosEnStock = productos.filter((p) => (p.stock || 0) > 0);

  // Ventas recientes (ordenadas por fecha descendente)
  const recientes = [...ventas]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    .slice(0, 5);

  // Gastos recientes
  const gastosRecientes = [...gastos]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    .slice(0, 4);

  return (
    <>
      <PageHeader
        title="Hola, LYNPHEA"
        subtitle="Panel general de administración y métricas de negocio"
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/ventas">
              <Button className="gap-2 shadow-sm">
                <ShoppingBag className="h-4 w-4" />
                <span>Nueva Venta</span>
              </Button>
            </Link>
            <Link to="/gastos">
              <Button variant="outline" className="gap-2">
                <Receipt className="h-4 w-4" />
                <span>Registrar Gasto</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Alerta de Stock Bajo (solo si hay productos con existencias entre 1 y 5 unidades) */}
      {stockBajo.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-50/50 p-4 dark:bg-amber-950/20">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-foreground">
              <strong className="font-medium">{stockBajo.length} producto(s)</strong> con inventario
              bajo (
              {stockBajo
                .map((p) => p.nombre)
                .slice(0, 3)
                .join(", ")}
              {stockBajo.length > 3 ? "..." : ""}).
            </p>
          </div>
          <Link
            to="/inventario"
            className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            Revisar inventario <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Métricas Principales */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Ventas Totales"
          value={money(totalVentas)}
          hint={`${ventas.length} transacciones registradas`}
        />
        <StatCard
          label="Utilidad Neta Estimada"
          value={money(utilidadOperativa)}
          hint={`Margen operativo: ${margen}%`}
        />
        <StatCard
          label="Por Cobrar"
          value={money(totalPorCobrar)}
          hint={`Recaudado: ${money(totalCobrado)}`}
        />
        <StatCard
          label="Valor Inventario"
          value={money(valorInventario)}
          hint={`${productosEnStock.length} referencias en stock`}
        />
        <StatCard
          label="Ticket Promedio"
          value={money(ticketPromedio)}
          hint={`${totalUnidades} unidades vendidas`}
        />
      </div>

      {/* Sección de Gráficas */}
      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        {/* Gráfica 1: Ventas últimos 7 días */}
        <div className="lg:col-span-3">
          <Panel title="Tendencia de ventas · últimos 7 días">
            <div className="h-72 px-2 pb-4 pt-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dias}>
                  <defs>
                    <linearGradient id="roseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--rose)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--rose)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="dia"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tick={{ fill: "var(--color-muted-foreground)" }}
                  />
                  <YAxis hide domain={[0, "auto"]} />
                  <Tooltip
                    formatter={(value: number) => [money(value), "Ventas"]}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--rose)"
                    strokeWidth={2.5}
                    fill="url(#roseGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        {/* Gráfica 2: Desglose Operativo (Reportes Integrados) */}
        <div className="lg:col-span-2">
          <Panel title="Desglose operativo y flujo">
            <div className="h-72 px-2 pb-4 pt-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flujoFinanciero}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="nombre"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tick={{ fill: "var(--color-muted-foreground)" }}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value: number) => [money(value), "Monto"]}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                    }}
                  />
                  <Bar dataKey="valor" fill="var(--rose)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </div>

      {/* Sección Inferior: Ventas Recientes & Gastos / Accesos */}
      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        {/* Tabla de Ventas Recientes */}
        <div className="lg:col-span-3">
          <Panel title="Ventas recientes">
            {recientes.length === 0 ? (
              <Empty text="Aún no hay ventas registradas." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["Cliente", "Producto", "Total", "Estado", "Fecha"].map((h) => (
                        <th key={h} className="label-caps px-4 py-3 text-left font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recientes.map((v) => (
                      <tr
                        key={v.id}
                        className="border-b border-border/60 transition-colors hover:bg-muted/40 last:border-0"
                      >
                        <td className="px-4 py-3 font-medium">{v.cliente}</td>
                        <td className="px-4 py-3 text-muted-foreground truncate max-w-[180px]">
                          {v.producto}
                        </td>
                        <td className="px-4 py-3 font-medium">{money(v.total)}</td>
                        <td className="px-4 py-3">
                          <Pill estado={v.estado} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{v.fecha}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-border p-3 text-right">
              <Link
                to="/ventas"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Ver todas las ventas <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Panel>
        </div>

        {/* Panel lateral: Gastos Recientes & Enlaces Rápidos */}
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Gastos recientes">
            {gastosRecientes.length === 0 ? (
              <Empty text="No hay gastos registrados." />
            ) : (
              <div className="divide-y divide-border/60">
                {gastosRecientes.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-muted/40"
                  >
                    <div>
                      <p className="font-medium text-foreground">{g.descripcion}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.categoria} • {g.fecha}
                      </p>
                    </div>
                    <span className="font-medium text-foreground">{money(g.valor)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-border p-3 text-right">
              <Link
                to="/gastos"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Ver todos los gastos <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Panel>

          {/* Accesos rápidos a secciones del sistema */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/inventario"
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 transition-all hover:bg-blush/60 hover:border-rose/40"
            >
              <div className="rounded-md bg-muted p-2 text-rose">
                <Boxes className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">Inventario</p>
                <p className="text-[11px] text-muted-foreground">Control de stock</p>
              </div>
            </Link>

            <Link
              to="/periodos"
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 transition-all hover:bg-blush/60 hover:border-rose/40"
            >
              <div className="rounded-md bg-muted p-2 text-rose">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">Periodos</p>
                <p className="text-[11px] text-muted-foreground">Cierres y metas</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
