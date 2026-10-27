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
import { ConfirmDialog, Empty, PageHeader, Panel, SearchInput } from "@/components/ui-bits";
import { CATEGORIAS, emptyData, hoy, money, uid, useStored, type Gasto } from "@/lib/store";

export const Route = createFileRoute("/gastos")({
  head: () => ({
    meta: [
      { title: "Gastos — LYNPHEA" },
      { name: "description", content: "Control de gastos por categoría de LYNPHEA." },
      { property: "og:title", content: "Gastos — LYNPHEA" },
      { property: "og:description", content: "Marketing, empaques, domicilios y más." },
    ],
  }),
  component: GastosPage,
});

const vacio = { categoria: "Marketing", descripcion: "", valor: "" };

function GastosPage() {
  const [gastos, setGastos] = useStored<Gasto[]>("gastos", emptyData.gastos);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(vacio);
  const [editando, setEditando] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [eliminando, setEliminando] = useState<Gasto | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const gastosFiltrados = useMemo(
    () =>
      gastos.filter(
        (gasto) =>
          (!desde || gasto.fecha >= desde) &&
          (!hasta || gasto.fecha <= hasta) &&
          (!busqueda ||
            `${gasto.categoria} ${gasto.descripcion} ${gasto.fecha}`
              .toLowerCase()
              .includes(busqueda.toLowerCase())),
      ),
    [gastos, desde, hasta, busqueda],
  );

  const guardar = () => {
    if (!form.descripcion || !Number(form.valor)) {
      toast.error("Indica descripción y valor");
      return;
    }
    setGastos((prev) =>
      editando
        ? prev.map((gasto) =>
            gasto.id === editando
              ? {
                  ...gasto,
                  categoria: form.categoria,
                  descripcion: form.descripcion,
                  valor: Number(form.valor),
                }
              : gasto,
          )
        : [
            {
              id: uid(),
              fecha: hoy(),
              categoria: form.categoria,
              descripcion: form.descripcion,
              valor: Number(form.valor),
            },
            ...prev,
          ],
    );
    setForm(vacio);
    setEditando(null);
    setOpen(false);
    toast.success(editando ? "Gasto actualizado" : "Gasto registrado");
  };

  const editar = (gasto: Gasto) => {
    setEditando(gasto.id);
    setForm({
      categoria: gasto.categoria,
      descripcion: gasto.descripcion,
      valor: String(gasto.valor),
    });
    setOpen(true);
  };

  const eliminar = (id: string) => {
    setGastos((prev) => prev.filter((gasto) => gasto.id !== id));
    toast.success("Gasto eliminado");
  };

  return (
    <>
      <PageHeader
        title="Gastos"
        subtitle={`Total registrado: ${money(gastosFiltrados.reduce((s, g) => s + g.valor, 0))}`}
        action={
          <Button
            onClick={() => {
              setEditando(null);
              setForm(vacio);
              setOpen(true);
            }}
          >
            + Nuevo gasto
          </Button>
        }
      />

      <Panel title="Historial de gastos">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3">
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar gasto o categoría"
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
        {gastosFiltrados.length === 0 ? (
          <Empty text="Aún no hay gastos registrados." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Fecha", "Categoría", "Descripción", "Valor", "Acciones"].map((h) => (
                    <th key={h} className="label-caps px-4 py-3 text-left font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gastosFiltrados.map((g) => (
                  <tr key={g.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">{g.fecha}</td>
                    <td className="px-4 py-3">{g.categoria}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.descripcion}</td>
                    <td className="px-4 py-3">{money(g.valor)}</td>
                    <td className="flex gap-3 px-4 py-3">
                      <button onClick={() => editar(g)} className="text-xs underline">
                        Editar
                      </button>
                      <button
                        onClick={() => setEliminando(g)}
                        className="text-xs text-muted-foreground underline"
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {editando ? "Editar gasto" : "Nuevo gasto"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Categoría</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm({ ...form, categoria: c })}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      form.categoria === c
                        ? "border-rose bg-blush text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Descripción</Label>
              <Input
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Valor</Label>
              <Input
                type="number"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="flex flex-wrap justify-between items-center gap-2">
            {editando ? (
              <Button
                variant="destructive"
                onClick={() => {
                  const g = gastos.find((item) => item.id === editando);
                  if (g) {
                    setOpen(false);
                    setEliminando(g);
                  }
                }}
              >
                Eliminar gasto
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={guardar}>{editando ? "Actualizar gasto" : "Guardar gasto"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(eliminando)}
        onOpenChange={(open) => !open && setEliminando(null)}
        title="¿Eliminar este gasto?"
        description={
          eliminando
            ? `${eliminando.descripcion} · ${money(eliminando.valor)}`
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
