import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Producto } from "@/lib/store";

export const businessCollections = [
  "productos",
  "ventas",
  "compras",
  "gastos",
  "clientes",
  "pagos",
  "periodos",
  "documentos",
  "settings",
] as const;

export type BusinessCollection = (typeof businessCollections)[number];

type BusinessRecord = { record_id: string; payload: unknown };

const businessCache = new Map<string, unknown[]>();
const pendingWrites = new Map<string, Promise<void>>();
const businessListeners = new Map<string, Set<() => void>>();
const businessRevisions = new Map<string, number>();
const pendingRefreshes = new Map<string, Promise<unknown[]>>();

function notifyBusinessCollection(key: string) {
  queueMicrotask(() => {
    businessListeners.get(key)?.forEach((listener) => listener());
  });
}

export function subscribeBusinessCollection(key: string, listener: () => void) {
  const listeners = businessListeners.get(key) ?? new Set<() => void>();
  listeners.add(listener);
  businessListeners.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) businessListeners.delete(key);
  };
}

const isBusinessCollection = (key: string): key is BusinessCollection =>
  businessCollections.includes(key as BusinessCollection);

function recordsFor(value: unknown): BusinessRecord[] {
  if (!Array.isArray(value)) {
    if (value && typeof value === "object") {
      return Object.entries(value).map(([record_id, payload]) => ({ record_id, payload }));
    }
    return [];
  }

  return value.map((payload, index) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Cada registro de negocio debe ser un objeto.");
    }
    const id = "id" in payload ? payload.id : undefined;
    return {
      record_id: typeof id === "string" || typeof id === "number" ? String(id) : `record-${index}`,
      payload,
    };
  });
}

async function replaceCollection(key: BusinessCollection, value: unknown) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const records = recordsFor(value);
  const { error } = await supabase.rpc("replace_business_records", {
    p_collection: key,
    p_records: records,
  });
  if (error) throw error;
}

export function saveBusinessCollection(key: string, value: unknown): Promise<void> {
  if (!isBusinessCollection(key)) {
    const error = new Error(`La colección "${key}" no está habilitada para almacenamiento remoto.`);
    toast.error(error.message);
    return Promise.reject(error);
  }

  const records = recordsFor(value);
  businessRevisions.set(key, (businessRevisions.get(key) ?? 0) + 1);
  businessCache.set(key, Array.isArray(value) ? value : records.map((record) => record.payload));
  notifyBusinessCollection(key);

  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => replaceCollection(key, value))
    .catch((error: unknown) => {
      console.error(`No se pudo guardar la colección "${key}" en Supabase:`, error);
      toast.error(`No se pudieron guardar los cambios de ${key} en Supabase.`);
      throw error;
    });
  pendingWrites.set(key, current);
  void current
    .finally(() => {
      if (pendingWrites.get(key) === current) pendingWrites.delete(key);
    })
    .catch(() => undefined);
  return current;
}

export function getCachedBusinessCollection<T>(key: string, fallback: T): T {
  return (businessCache.get(key) as T | undefined) ?? fallback;
}

export function hasCachedBusinessCollection(key: string) {
  return businessCache.has(key);
}

export type AdminProductPage = {
  products: Producto[];
  totalCount: number;
};

function isProducto(value: unknown): value is Producto {
  if (!value || typeof value !== "object") return false;
  const product = value as Record<string, unknown>;
  return (
    typeof product["id"] === "string" &&
    typeof product["sku"] === "string" &&
    typeof product["nombre"] === "string" &&
    (product["linea"] === "LYNPHEA DAILY" || product["linea"] === "LYNPHEA PRO") &&
    typeof product["costo"] === "number" &&
    typeof product["precio"] === "number" &&
    typeof product["stock"] === "number"
  );
}

export async function fetchAdminProductPage(options: {
  search: string;
  linea: Producto["linea"] | "TODAS";
  proveedor: NonNullable<Producto["proveedor"]> | "TODOS";
  page: number;
  pageSize: number;
}): Promise<AdminProductPage> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase.rpc("search_business_products", {
    p_search: options.search.trim(),
    p_linea: options.linea === "TODAS" ? null : options.linea,
    p_proveedor: options.proveedor === "TODOS" ? null : options.proveedor,
    p_limit: options.pageSize,
    p_offset: (options.page - 1) * options.pageSize,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("La consulta de productos devolvió una respuesta inválida.");
  }

  const result = data as Record<string, unknown>;
  const totalCount = result["totalCount"];
  const products = result["products"];
  if (
    typeof totalCount !== "number" ||
    !Number.isInteger(totalCount) ||
    !Array.isArray(products) ||
    !products.every(isProducto)
  ) {
    throw new Error("La consulta de productos devolvió datos con un formato inválido.");
  }
  return { products, totalCount };
}

export async function saveAdminProduct(product: Producto) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { error } = await supabase.rpc("save_business_product", {
    p_record_id: product.id,
    p_payload: product,
  });
  if (error) throw error;
}

export async function deleteAdminProduct(productId: string) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { error } = await supabase.rpc("delete_business_product", {
    p_record_id: productId,
  });
  if (error) throw error;
}

export async function seedDefaultBusinessProducts(products: Producto[]) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const batchSize = 200;
  for (let start = 0; start < products.length; start += batchSize) {
    const records = products.slice(start, start + batchSize).map((payload) => ({
      record_id: payload.id,
      payload,
    }));
    const { error } = await supabase.rpc("seed_default_business_products", {
      p_records: records,
    });
    if (error) throw error;
  }
}

async function fetchCollection(key: BusinessCollection, updateCache = true) {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const records: BusinessRecord[] = [];
  const pageSize = 1000;
  let start = 0;
  let totalCount: number | null = null;
  while (totalCount === null || start < totalCount) {
    const { data, error, count } = await supabase
      .from("business_records")
      .select("record_id,payload", { count: "exact" })
      .eq("collection", key)
      .order("record_id")
      .range(start, start + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as BusinessRecord[];
    totalCount = count;
    if (page.length === 0 && start < (totalCount ?? start)) {
      throw new Error(
        `La consulta de "${key}" devolvió una página vacía antes del total informado.`,
      );
    }
    records.push(...page);
    start += page.length;
    if (totalCount === null && page.length < pageSize) break;
  }
  const values = records.map((record) => record.payload);
  if (updateCache) {
    businessCache.set(key, values);
    notifyBusinessCollection(key);
  }
  return values;
}

export function refreshBusinessCollection(key: string) {
  if (!isBusinessCollection(key)) {
    return Promise.reject(
      new Error(`La colección "${key}" no está habilitada para sincronización.`),
    );
  }
  if (!supabase) return Promise.resolve(getCachedBusinessCollection(key, []));

  const currentRefresh = pendingRefreshes.get(key);
  if (currentRefresh) return currentRefresh;

  const refresh = (async () => {
    const pendingWrite = pendingWrites.get(key);
    if (pendingWrite) await pendingWrite;
    const revision = businessRevisions.get(key) ?? 0;
    const values = await fetchCollection(key, false);
    if ((businessRevisions.get(key) ?? 0) === revision) {
      businessCache.set(key, values);
      notifyBusinessCollection(key);
      return values;
    }
    return getCachedBusinessCollection(key, values);
  })();
  pendingRefreshes.set(key, refresh);
  void refresh
    .finally(() => {
      if (pendingRefreshes.get(key) === refresh) pendingRefreshes.delete(key);
    })
    .catch(() => undefined);
  return refresh;
}

export async function migrateLocalBusinessData() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Inicia sesión antes de migrar los datos.");

  const markerKey = `lynphea:supabase-imported:${user.id}`;
  if (window.localStorage.getItem(markerKey) === "done") return;

  const localRecords: (BusinessRecord & { collection: BusinessCollection })[] = [];
  for (const collection of businessCollections) {
    const raw = window.localStorage.getItem(`lynphea:${collection}`);
    if (!raw) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch (cause) {
      console.error(`No se pudo leer localStorage para "${collection}":`, cause);
      throw new Error(`Los datos locales de ${collection} no tienen un formato válido.`);
    }
    localRecords.push(...recordsFor(value).map((record) => ({ ...record, collection })));
  }

  const { data: imported, error } = await supabase.rpc("import_local_business_records", {
    p_records: localRecords,
  });
  if (error) throw error;
  if (!imported)
    toast.info("La cuenta ya tiene datos en Supabase; se omitió la importación local.");
  window.localStorage.setItem(markerKey, "done");
}

export async function preloadBusinessData() {
  for (const collection of businessCollections) {
    if (collection === "productos") continue;
    await fetchCollection(collection);
  }
}

export type PublicCatalogProduct = {
  id: string;
  sku: string;
  nombre: string;
  descripcion?: string;
  linea: "LYNPHEA DAILY" | "LYNPHEA PRO";
  costo: number;
  precio: number;
  stock: number;
  images: ProductImage[];
};

export type ProductImage = {
  id: string;
  product_id: string;
  storage_path: string;
  sort_order: number;
  is_cover: boolean;
  url: string;
};

type ProductImageRecord = Omit<ProductImage, "url">;

function withImageUrls(images: ProductImageRecord[]) {
  const client = supabase;
  if (!client) throw new Error("Supabase no está configurado.");
  return images.map((image) => ({
    ...image,
    url: client.storage.from("product-images").getPublicUrl(image.storage_path).data.publicUrl,
  }));
}

async function fetchProductImages(productIds: string[], isAuthenticated: boolean) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  if (productIds.length === 0) return [];

  const table = isAuthenticated ? "product_images" : "public_catalog_images";
  const { data, error } = await supabase
    .from(table)
    .select("id,product_id,storage_path,sort_order,is_cover")
    .in("product_id", productIds)
    .order("sort_order");
  if (error) throw error;
  return withImageUrls((data ?? []) as ProductImageRecord[]);
}

export async function fetchIndexCatalog(
  authenticated?: boolean,
  options: {
    search?: string;
    linea?: PublicCatalogProduct["linea"] | "TODAS";
    page?: number;
    pageSize?: number;
  } = {},
) {
  if (!supabase) {
    return {
      authenticated: false,
      products: [] as PublicCatalogProduct[],
      totalCount: 0,
    };
  }

  let isAuthenticated = authenticated;
  if (isAuthenticated === undefined) {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    isAuthenticated = Boolean(session);
  }

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 24));
  const search = options.search?.trim() ?? "";
  const linea = options.linea ?? "TODAS";
  let products: PublicCatalogProduct[];
  let totalCount: number;

  if (!isAuthenticated) {
    const { data, error } = await supabase.rpc("search_public_catalog", {
      p_search: search,
      p_linea: linea === "TODAS" ? null : linea,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });
    if (error) throw error;
    const result = data as Record<string, unknown> | null;
    const rawProducts = result?.["products"];
    const count = result?.["totalCount"];
    if (!Array.isArray(rawProducts) || typeof count !== "number" || !Number.isInteger(count)) {
      throw new Error("La búsqueda del catálogo devolvió datos con un formato inválido.");
    }
    products = rawProducts.map((product) => {
      if (!product || typeof product !== "object") {
        throw new Error("La búsqueda del catálogo devolvió un producto inválido.");
      }
      const item = product as Record<string, unknown>;
      if (
        typeof item["id"] !== "string" ||
        typeof item["sku"] !== "string" ||
        typeof item["nombre"] !== "string" ||
        (item["linea"] !== "LYNPHEA DAILY" && item["linea"] !== "LYNPHEA PRO")
      ) {
        throw new Error("La búsqueda del catálogo devolvió un producto incompleto.");
      }
      return {
        id: item["id"],
        sku: item["sku"],
        nombre: item["nombre"],
        ...(typeof item["descripcion"] === "string" ? { descripcion: item["descripcion"] } : {}),
        linea: item["linea"],
        costo: 0,
        precio: typeof item["precio"] === "number" ? item["precio"] : 0,
        stock: 0,
        images: [],
      };
    });
    totalCount = count;
  } else {
    const result = await fetchAdminProductPage({
      search,
      linea,
      proveedor: "TODOS",
      page,
      pageSize,
    });
    products = result.products.map((product) => ({ ...product, images: [] }));
    totalCount = result.totalCount;
  }
  const images = await fetchProductImages(
    products.map((product) => product.id),
    Boolean(isAuthenticated),
  );
  return {
    authenticated: Boolean(isAuthenticated),
    totalCount,
    products: products.map((product) => ({
      ...product,
      images: images
        .filter((image) => image.product_id === product.id)
        .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order),
    })),
  };
}

export async function uploadProductImage(productId: string, file: File) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Debes iniciar sesión para añadir imágenes.");
  if (!file.type.startsWith("image/")) throw new Error("El archivo debe ser una imagen.");
  if (file.size > 5 * 1024 * 1024) throw new Error("La imagen no puede superar 5 MB.");

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data: existing, error: existingError } = await supabase
    .from("product_images")
    .select("id")
    .eq("product_id", productId)
    .limit(1);
  if (existingError) {
    await supabase.storage.from("product-images").remove([storagePath]);
    throw existingError;
  }

  const { data, error } = await supabase
    .from("product_images")
    .insert({
      user_id: user.id,
      product_id: productId,
      storage_path: storagePath,
      sort_order: existing.length,
      is_cover: existing.length === 0,
    })
    .select("id,product_id,storage_path,sort_order,is_cover")
    .single();
  if (error) {
    const { error: cleanupError } = await supabase.storage
      .from("product-images")
      .remove([storagePath]);
    if (cleanupError) console.error("No se pudo limpiar la imagen subida:", cleanupError);
    throw error;
  }
  return withImageUrls([data as ProductImageRecord])[0];
}

export async function setProductImageCover(productId: string, imageId: string) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { error } = await supabase.rpc("set_product_image_cover", {
    p_product_id: productId,
    p_image_id: imageId,
  });
  if (error) throw error;
}

export async function saveProductImageOrder(productId: string, imageIds: string[]) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { error } = await supabase.rpc("set_product_image_order", {
    p_product_id: productId,
    p_image_ids: imageIds,
  });
  if (error) throw error;
}

export async function deleteProductImage(image: ProductImage) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  if (image.is_cover) {
    const { data: siblings, error: siblingsError } = await supabase
      .from("product_images")
      .select("id")
      .eq("product_id", image.product_id)
      .neq("id", image.id)
      .order("sort_order")
      .limit(1);
    if (siblingsError) throw siblingsError;
    if (siblings?.[0]) await setProductImageCover(image.product_id, siblings[0].id);
  }
  const { error } = await supabase.from("product_images").delete().eq("id", image.id);
  if (error) throw error;
  const { error: storageError } = await supabase.storage
    .from("product-images")
    .remove([image.storage_path]);
  if (storageError) {
    console.error("Se eliminó el registro, pero no el archivo de imagen:", storageError);
    throw storageError;
  }
}
