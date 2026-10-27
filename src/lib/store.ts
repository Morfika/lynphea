import { useCallback, useEffect, useState } from "react";
import {
  getCachedBusinessCollection,
  hasCachedBusinessCollection,
  refreshBusinessCollection,
  saveBusinessCollection,
  subscribeBusinessCollection,
} from "@/lib/supabase-data";

export type Producto = {
  id: string;
  sku: string;
  nombre: string;
  descripcion?: string;
  linea: "LYNPHEA DAILY" | "LYNPHEA PRO";
  proveedor?: (typeof PROVEEDORES)[number];
  categoria?: string;
  costo: number;
  precio: number;
  stock: number;
  stockInicial?: number;
  stockMinimo?: number;
  activo?: boolean;
};

export type Venta = {
  id: string;
  fecha: string;
  cliente: string;
  producto: string;
  cantidad: number;
  precio: number;
  total: number;
  abonado: number;
  estado: "Pagado" | "Abono" | "Pendiente" | "Regalo";
  descuento?: number;
  costo?: number;
  utilidad?: number;
  canal?: string;
  periodo?: string;
  items?: VentaItem[];
};

export type VentaItem = {
  productoId?: string;
  producto: string;
  cantidad: number;
  precio: number;
  costo?: number;
};

export type Compra = {
  id: string;
  fecha: string;
  proveedor: string;
  productos: string;
  total: number;
  recibida?: boolean;
  items?: CompraItem[];
};

export type CompraItem = {
  productoId?: string;
  producto: string;
  cantidad: number;
  costo: number;
};

export type CompraDraft = {
  compraId?: string;
  items: CompraItem[];
};

const compraDraftKey = "lynphea:compra-draft";

export const compraDraftService = {
  save(draft: CompraDraft) {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(compraDraftKey, JSON.stringify(draft));
    }
  },
  take(): CompraDraft | null {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(compraDraftKey);
    if (!raw) return null;
    window.sessionStorage.removeItem(compraDraftKey);
    return JSON.parse(raw) as CompraDraft;
  },
};

export type Gasto = {
  id: string;
  fecha: string;
  categoria: string;
  descripcion: string;
  valor: number;
  metodo?: string;
  periodo?: string;
};

export type Cliente = {
  id: string;
  nombre: string;
  telefono?: string;
  whatsapp?: string;
  instagram?: string;
  canal?: string;
  notas?: string;
  creadoEn: string;
};

export type Pago = {
  id: string;
  fecha: string;
  cliente: string;
  monto: number;
  metodo: string;
  concepto: string;
  ventaId?: string;
  notas?: string;
};

export type Periodo = {
  id: string;
  nombre: string;
  inicio?: string;
  fechaInicio?: string;
  final?: string;
  fechaFin?: string | null;
  estado?: "activo" | "cerrado";
  tipoCierre?: "rotacion_automatica" | "manual";
  metaRotacion: number;
  comprasInicialesIds?: string[];
  notas?: string;
};

export const LINEAS = ["LYNPHEA DAILY", "LYNPHEA PRO"] as const;
export const PROVEEDORES = ["TRENDY", "ATENEA", "OTRO"] as const;
export const CATEGORIAS = ["Marketing", "Empaques", "Domicilios", "Contenido", "Otros"] as const;
export const ESTADOS = ["Pagado", "Abono", "Pendiente", "Regalo"] as const;
export const CANALES = [
  "Instagram",
  "WhatsApp",
  "Referido",
  "Presencial",
  "TikTok",
  "Otro",
] as const;
export const METODOS_PAGO = ["Efectivo", "Transferencia", "Nequi", "Daviplata", "Otro"] as const;

export const hoy = () => new Date().toISOString().slice(0, 10);
export const uid = () => Math.random().toString(36).slice(2, 10);

export const money = (n: number) =>
  "$" + Math.round(n || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });

import { CATALOGO_ATENEA } from "@/data/catalogoAtenea";
import { CATALOGO_TRENDY } from "@/data/catalogoTrendy";

export const ateneaProductosDefault: Producto[] = CATALOGO_ATENEA.map((item) => ({
  id: item.id,
  sku: item.sku,
  nombre: item.nombre,
  descripcion: item.descripcion,
  linea: "LYNPHEA PRO",
  proveedor: "ATENEA",
  costo: item.costo,
  precio: item.precioSugerido || (item.costo > 0 ? Math.round((item.costo * 1.5) / 500) * 500 : 0),
  stock: 0,
}));

export const trendyProductosDefault: Producto[] = CATALOGO_TRENDY.map((item) => ({
  id: item.id,
  sku: item.sku,
  nombre: item.nombre,
  descripcion: item.descripcion,
  categoria: item.categoria,
  linea: "LYNPHEA DAILY",
  proveedor: "TRENDY",
  costo: item.costo,
  precio: item.precioSugerido || 0,
  stock: 0,
}));

export const catalogDefaultProducts = [...ateneaProductosDefault, ...trendyProductosDefault];

function mergeDefaultProducts(products: Producto[]) {
  const existingSkus = new Set(products.map((product) => product.sku.trim().toUpperCase()));
  const missing = catalogDefaultProducts.filter(
    (product) => !existingSkus.has(product.sku.trim().toUpperCase()),
  );
  return [...products, ...missing];
}

export const demoProductos: Producto[] = [
  ...ateneaProductosDefault,
  {
    id: "p1",
    sku: "LYN-DAI-001",
    nombre: "Pestañina Fortalecedora",
    linea: "LYNPHEA DAILY",
    proveedor: "TRENDY",
    costo: 7000,
    precio: 15000,
    stock: 12,
  },
  {
    id: "p2",
    sku: "LYN-DAI-002",
    nombre: "Labial Eclipse",
    linea: "LYNPHEA DAILY",
    proveedor: "TRENDY",
    costo: 6500,
    precio: 15000,
    stock: 8,
  },
];

const d = (offset: number) => {
  const x = new Date();
  x.setDate(x.getDate() - offset);
  return x.toISOString().slice(0, 10);
};

export const demoVentas: Venta[] = [
  {
    id: "v1",
    fecha: d(0),
    cliente: "Claudia Contreras",
    producto: "Kit pestañina + fortalecedora",
    cantidad: 1,
    precio: 25000,
    total: 25000,
    abonado: 25000,
    estado: "Pagado",
  },
  {
    id: "v2",
    fecha: d(0),
    cliente: "Erika Tatiana",
    producto: "Labial Eclipse",
    cantidad: 1,
    precio: 15000,
    total: 15000,
    abonado: 15000,
    estado: "Pagado",
  },
  {
    id: "v3",
    fecha: d(0),
    cliente: "Alejandra Barranca",
    producto: "Polvos Jack",
    cantidad: 1,
    precio: 30000,
    total: 30000,
    abonado: 0,
    estado: "Pendiente",
  },
  {
    id: "v4",
    fecha: d(1),
    cliente: "Dayana Dorada",
    producto: "Labial Eclipse",
    cantidad: 2,
    precio: 15000,
    total: 30000,
    abonado: 30000,
    estado: "Pagado",
  },
  {
    id: "v5",
    fecha: d(2),
    cliente: "Tiffany Dorada",
    producto: "Pestañina Fortalecedora",
    cantidad: 3,
    precio: 15000,
    total: 45000,
    abonado: 20000,
    estado: "Abono",
  },
  {
    id: "v6",
    fecha: d(4),
    cliente: "Claudia Contreras",
    producto: "Polvos Jack",
    cantidad: 1,
    precio: 30000,
    total: 30000,
    abonado: 30000,
    estado: "Pagado",
  },
];

export const demoCompras: Compra[] = [
  {
    id: "c1",
    fecha: d(6),
    proveedor: "TRENDY",
    productos: "Pestañina Fortalecedora x20",
    total: 140000,
    items: [{ productoId: "p1", producto: "Pestañina Fortalecedora", cantidad: 20, costo: 7000 }],
  },
  {
    id: "c2",
    fecha: d(3),
    proveedor: "ATENEA",
    productos: "Polvos Jack x10",
    total: 140000,
    items: [{ productoId: "p3", producto: "Polvos Jack", cantidad: 10, costo: 14000 }],
  },
];

export const demoGastos: Gasto[] = [
  { id: "g1", fecha: d(2), categoria: "Marketing", descripcion: "Pauta Instagram", valor: 40000 },
  { id: "g2", fecha: d(1), categoria: "Empaques", descripcion: "Bolsas rosadas", valor: 25000 },
];

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const storageService = {
  get<T>(key: string, fallback: T) {
    return read(`lynphea:${key}`, fallback);
  },
  set<T>(key: string, value: T) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`lynphea:${key}`, JSON.stringify(value));
    } catch {
      // Storage can be unavailable in private browsing or when full.
    }
  },
  remove(key: string) {
    if (typeof window !== "undefined") window.localStorage.removeItem(`lynphea:${key}`);
  },
  ensureDefaultProducts(): Producto[] {
    if (typeof window === "undefined")
      return [...ateneaProductosDefault, ...trendyProductosDefault];
    let current = this.get<Producto[]>("productos", []);
    // Limpiar SKUs antiguos LYN-TRD- o líneas incorrectas
    if (
      current.some((p) => p.sku.startsWith("LYN-TRD-") || (p.linea as string) === "LYNPHEA TRENDY")
    ) {
      current = current.filter(
        (p) => !p.sku.startsWith("LYN-TRD-") && (p.linea as string) !== "LYNPHEA TRENDY",
      );
    }
    // Deduplicar productos por id único
    const seenIds = new Set<string>();
    const originalLen = current.length;
    current = current.filter((p) => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });
    const hadDups = current.length !== originalLen;

    // Sincronizar precios de Trendy si están en 0 con el precio sugerido oficial
    const trendyMap = new Map(CATALOGO_TRENDY.map((t) => [t.sku.toUpperCase(), t.precioSugerido]));
    let updatedPrice = false;
    current = current.map((p) => {
      if ((p.proveedor ?? "").toUpperCase() === "TRENDY" && (!p.precio || p.precio === 0)) {
        const sugerido = trendyMap.get(p.sku.toUpperCase()) || 0;
        if (sugerido > 0) {
          updatedPrice = true;
          return { ...p, precio: sugerido };
        }
      }
      return p;
    });

    const merged = mergeDefaultProducts(current);
    if (merged.length > current.length || updatedPrice || hadDups) {
      this.set("productos", merged);
      return merged;
    }
    return current;
  },
  exportAll() {
    const keys = [
      "productos",
      "ventas",
      "compras",
      "gastos",
      "clientes",
      "pagos",
      "periodos",
      "documentos",
      "settings",
    ];
    return Object.fromEntries(keys.map((key) => [key, this.get(key, [])]));
  },
};

export const emptyData = {
  productos: [] as Producto[],
  ventas: [] as Venta[],
  compras: [] as Compra[],
  gastos: [] as Gasto[],
  periodos: [] as Periodo[],
};

export function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => getCachedBusinessCollection(key, fallback));
  const [ready, setReady] = useState(() => hasCachedBusinessCollection(key));

  useEffect(() => {
    const syncValue = () => {
      setValue(getCachedBusinessCollection(key, fallback));
      setReady(true);
    };
    const unsubscribe = subscribeBusinessCollection(key, syncValue);
    setValue(getCachedBusinessCollection(key, fallback));
    setReady(true);
    const refresh = () => {
      void refreshBusinessCollection(key).catch((error: unknown) => {
        console.error(`No se pudo sincronizar "${key}" con Supabase:`, error);
      });
    };
    refresh();
    const onFocus = () => refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        saveBusinessCollection(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, update, ready] as const;
}
