import { useState } from "react";
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
import { LINEAS, PROVEEDORES, uid, type Producto } from "@/lib/store";

type Supplier = "ATENEA" | "TRENDY";

type ProductForm = {
  sku: string;
  nombre: string;
  descripcion: string;
  linea: Producto["linea"];
  proveedor: NonNullable<Producto["proveedor"]>;
  categoria: string;
  costo: string;
  precio: string;
  stock: string;
  stockInicial: string;
  stockMinimo: string;
  activo: boolean;
};

type ProductEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Producto[];
  product: Producto | null;
  supplier: Supplier;
  onSave: (product: Producto) => void;
};

function suggestedSku(products: Producto[], line: Producto["linea"]) {
  const prefix = line === "LYNPHEA DAILY" ? "LYN-DAI-" : "LYN-PRO-";
  const used = products
    .filter((product) => product.sku.toUpperCase().startsWith(prefix))
    .map((product) => Number(product.sku.slice(prefix.length)))
    .filter(Number.isInteger);
  return `${prefix}${String(Math.max(0, ...used) + 1).padStart(3, "0")}`;
}

function emptyForm(products: Producto[], supplier: Supplier): ProductForm {
  const linea = supplier === "ATENEA" ? "LYNPHEA PRO" : "LYNPHEA DAILY";
  return {
    sku: suggestedSku(products, linea),
    nombre: "",
    descripcion: "",
    linea,
    proveedor: supplier,
    categoria: "",
    costo: "0",
    precio: "0",
    stock: "0",
    stockInicial: "",
    stockMinimo: "5",
    activo: true,
  };
}

function formForProduct(product: Producto, products: Producto[], supplier: Supplier): ProductForm {
  return {
    ...emptyForm(products, supplier),
    sku: product.sku,
    nombre: product.nombre,
    descripcion: product.descripcion ?? "",
    linea: product.linea,
    proveedor: product.proveedor ?? supplier,
    categoria: product.categoria ?? "",
    costo: String(product.costo),
    precio: String(product.precio),
    stock: String(product.stock ?? 0),
    stockInicial: product.stockInicial == null ? "" : String(product.stockInicial),
    stockMinimo: String(product.stockMinimo ?? 5),
    activo: product.activo !== false,
  };
}

export function ProductEditorDialog({
  open,
  onOpenChange,
  products,
  product,
  supplier,
  onSave,
}: ProductEditorDialogProps) {
  const [form, setForm] = useState<ProductForm>(() =>
    product ? formForProduct(product, products, supplier) : emptyForm(products, supplier),
  );

  const update = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    const sku = form.sku.trim().toUpperCase();
    const nombre = form.nombre.trim();
    if (!sku || !nombre) {
      toast.error("SKU y nombre son obligatorios.");
      return;
    }
    if (
      products.some((entry) => entry.id !== product?.id && entry.sku.trim().toUpperCase() === sku)
    ) {
      toast.error("Ya existe un producto con ese SKU.");
      return;
    }

    const cost = Number(form.costo);
    const price = Number(form.precio);
    const stock = Number(form.stock);
    const minimumStock = Number(form.stockMinimo);
    const initialStock = form.stockInicial.trim() ? Number(form.stockInicial) : undefined;
    if (
      [cost, price, stock, minimumStock, initialStock].some(
        (value) => value !== undefined && (!Number.isFinite(value) || value < 0),
      ) ||
      !Number.isInteger(stock) ||
      !Number.isInteger(minimumStock) ||
      (initialStock !== undefined && !Number.isInteger(initialStock))
    ) {
      toast.error(
        "Verifica que los precios sean positivos y las unidades sean enteros no negativos.",
      );
      return;
    }

    onSave({
      id: product?.id ?? uid(),
      sku,
      nombre,
      linea: form.linea,
      proveedor: form.proveedor,
      costo: cost,
      precio: price,
      stock,
      stockMinimo: minimumStock,
      activo: form.activo,
      ...(form.descripcion.trim() ? { descripcion: form.descripcion.trim() } : {}),
      ...(form.categoria.trim() ? { categoria: form.categoria.trim() } : {}),
      ...(initialStock === undefined ? {} : { stockInicial: initialStock }),
    });
    onOpenChange(false);
  };

  const field = (
    key: keyof ProductForm,
    label: string,
    options: { type?: string; min?: string; step?: string; required?: boolean } = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`product-${key}`}>{label}</Label>
      <Input
        id={`product-${key}`}
        type={options.type ?? "text"}
        min={options.min}
        step={options.step}
        required={options.required}
        value={String(form[key])}
        onChange={(event) => update(key, event.target.value as ProductForm[typeof key])}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? "Editar producto" : "Crear producto"}</DialogTitle>
          <DialogDescription>
            Completa toda la información del producto. Los productos nuevos se asignan inicialmente
            a {supplier}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("sku", "SKU", { required: true })}
          {field("nombre", "Nombre", { required: true })}
          {field("descripcion", "Descripción")}
          {field("categoria", "Categoría")}
          <div className="space-y-1.5">
            <Label htmlFor="product-line">Línea</Label>
            <select
              id="product-line"
              value={form.linea}
              onChange={(event) => update("linea", event.target.value as Producto["linea"])}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              {LINEAS.map((line) => (
                <option key={line} value={line}>
                  {line}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-supplier">Proveedor</Label>
            <select
              id="product-supplier"
              value={form.proveedor}
              onChange={(event) =>
                update("proveedor", event.target.value as NonNullable<Producto["proveedor"]>)
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              {PROVEEDORES.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </div>
          {field("costo", "Costo", { type: "number", min: "0", step: "1" })}
          {field("precio", "Precio de venta", { type: "number", min: "0", step: "1" })}
          {field("stock", "Stock actual", { type: "number", min: "0", step: "1" })}
          {field("stockInicial", "Stock inicial", { type: "number", min: "0", step: "1" })}
          {field("stockMinimo", "Stock mínimo", { type: "number", min: "0", step: "1" })}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(event) => update("activo", event.target.checked)}
              className="h-4 w-4 accent-rose"
            />
            Producto activo
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save}>{product ? "Guardar cambios" : "Crear producto"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
