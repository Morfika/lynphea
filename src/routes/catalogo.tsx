import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  GripVertical,
  ImagePlus,
  Instagram,
  MessageCircle,
  Search,
  ShoppingBag,
  Star,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money } from "@/lib/store";
import {
  deleteProductImage,
  fetchIndexCatalog,
  saveProductImageOrder,
  setProductImageCover,
  uploadProductImage,
  type PublicCatalogProduct,
  type ProductImage,
} from "@/lib/supabase-data";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/catalogo")({ component: CatalogoPage });

const photos = [
  "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1583241800698-e8ab01830a07?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1619451334792-150fd785ee74?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1625093742435-6fa192b6fb10?auto=format&fit=crop&w=900&q=85",
];

export function CatalogoPage() {
  const [linea, setLinea] = useState<PublicCatalogProduct["linea"] | "TODAS">("TODAS");
  const [busqueda, setBusqueda] = useState("");
  const [catalog, setCatalog] = useState<PublicCatalogProduct[]>([]);
  const [totalProductos, setTotalProductos] = useState(0);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | undefined>(undefined);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(24);
  const [imageProductId, setImageProductId] = useState<string | null>(null);
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(null);
  const [savingImage, setSavingImage] = useState(false);
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const imageInputRefs = useRef(new Map<string, HTMLInputElement>());

  const loadCatalog = useCallback(
    async (authenticated?: boolean) => {
      try {
        const result = await fetchIndexCatalog(authenticated, {
          search: busqueda,
          linea,
          page: pagina,
          pageSize: porPagina,
        });
        setCatalog(result.products);
        setTotalProductos(result.totalCount);
        setIsAuthenticated(result.authenticated);
        setCatalogReady(true);
        setCatalogError(false);
      } catch (error) {
        console.error("No se pudo cargar el catálogo:", error);
        setCatalogError(true);
        setCatalogReady(true);
        toast.error("No se pudo cargar el catálogo desde Supabase.");
      }
    },
    [busqueda, linea, pagina, porPagina],
  );

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(
      () => {
        setCargando(true);
        void fetchIndexCatalog(isAuthenticated, {
          search: busqueda,
          linea,
          page: pagina,
          pageSize: porPagina,
        })
          .then((result) => {
            if (!active) return;
            setTotalProductos(result.totalCount);
            const lastPage = Math.max(1, Math.ceil(result.totalCount / porPagina));
            if (pagina > lastPage) {
              setPagina(lastPage);
              return;
            }
            setCatalog(result.products);
            setIsAuthenticated(result.authenticated);
            setCatalogReady(true);
            setCatalogError(false);
          })
          .catch((error: unknown) => {
            console.error("No se pudo cargar el catálogo:", error);
            if (active) {
              setCatalogError(true);
              setCatalogReady(true);
              toast.error("No se pudo cargar el catálogo desde Supabase.");
            }
          })
          .finally(() => {
            if (active) setCargando(false);
          });
      },
      busqueda.trim() ? 300 : 0,
    );
    const { data } = supabase?.auth.onAuthStateChange((_event, session) => {
      if (active) setIsAuthenticated(Boolean(session));
    }) ?? { data: { subscription: null } };
    return () => {
      active = false;
      window.clearTimeout(timer);
      data.subscription?.unsubscribe();
    };
  }, [busqueda, isAuthenticated, linea, pagina, porPagina]);

  const handleAddImage = async (productId: string, file?: File) => {
    if (!file) return;
    setUploadingProductId(productId);
    try {
      await uploadProductImage(productId, file);
      await loadCatalog(true);
      toast.success("Imagen añadida al producto.");
    } catch (error) {
      console.error("No se pudo añadir la imagen del producto:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo añadir la imagen.");
    } finally {
      setUploadingProductId(null);
      const input = imageInputRefs.current.get(productId);
      if (input) input.value = "";
    }
  };

  const handleSetCover = async (productId: string, imageId: string) => {
    setSavingImage(true);
    try {
      await setProductImageCover(productId, imageId);
      await loadCatalog(true);
      toast.success("Portada actualizada.");
    } catch (error) {
      console.error("No se pudo cambiar la portada:", error);
      toast.error("No se pudo cambiar la portada.");
    } finally {
      setSavingImage(false);
    }
  };

  const handleDeleteImage = async (image: ProductImage) => {
    setSavingImage(true);
    try {
      await deleteProductImage(image);
      await loadCatalog(true);
      toast.success("Imagen eliminada.");
    } catch (error) {
      console.error("No se pudo eliminar la imagen:", error);
      toast.error("No se pudo eliminar la imagen.");
    } finally {
      setSavingImage(false);
    }
  };

  const handleImageDrop = async (product: PublicCatalogProduct, targetId: string) => {
    if (!draggedImageId || draggedImageId === targetId) return;
    const ordered = [...product.images];
    const from = ordered.findIndex((image) => image.id === draggedImageId);
    const to = ordered.findIndex((image) => image.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    if (!moved) return;
    ordered.splice(to, 0, moved);
    setSavingImage(true);
    try {
      await saveProductImageOrder(
        product.id,
        ordered.map((image) => image.id),
      );
      await loadCatalog(true);
    } catch (error) {
      console.error("No se pudo guardar el orden de imágenes:", error);
      toast.error("No se pudo guardar el orden de las imágenes.");
    } finally {
      setSavingImage(false);
      setDraggedImageId(null);
    }
  };

  const totalPaginas = Math.max(1, Math.ceil(totalProductos / porPagina));
  const pro = linea === "LYNPHEA PRO";
  return (
    <main
      className={`min-h-screen ${pro ? "bg-[#f0e8df] text-[#30241e]" : "bg-[#fbf8f6] text-[#211c1a]"}`}
    >
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-12">
        <a href="/catalogo" className="flex items-end gap-3">
          <span className="font-display text-3xl tracking-[0.18em]">LYNPHEA</span>
          <span className="mb-1 hidden text-[10px] uppercase tracking-[0.25em] opacity-55 sm:block">
            Makeup • Beauty
          </span>
        </a>
        <nav className="hidden gap-7 text-xs uppercase tracking-[0.16em] opacity-65 md:flex">
          <a href="#colecciones">Colecciones</a>
          <a href="#esencia">La marca</a>
          <a href="#contacto">Contacto</a>
        </nav>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="border-current/20 bg-transparent"
            aria-label="Bolsa"
          >
            <ShoppingBag />
          </Button>
        </div>
      </header>
      <section className="mx-auto grid max-w-7xl gap-10 px-6 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-12 lg:pb-28 lg:pt-20">
        <div className="max-w-xl">
          <p className="mb-5 text-xs uppercase tracking-[0.3em] opacity-60">
            Belleza para tu propio ritmo
          </p>
          <h1 className="font-display text-6xl leading-[0.88] sm:text-8xl">
            Tu belleza,
            <br />
            <i className="font-light">a tu manera.</i>
          </h1>
          <p className="mt-7 max-w-md text-base leading-7 opacity-70">
            Maquillaje pensado para acompañarte todos los días y elevar cada ocasión especial.
          </p>
          <a href="#colecciones" className="mt-8 inline-flex">
            <Button className="gap-3">
              Explorar catálogo <ArrowRight />
            </Button>
          </a>
        </div>
        <div className="relative ml-auto w-full max-w-lg">
          <div className="aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-[#ead6d0]">
            <img src={photos[0]} alt="Maquillaje LYNPHEA" className="h-full w-full object-cover" />
          </div>
          <div className="absolute -bottom-5 -left-5 bg-white/90 px-5 py-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.24em] opacity-55">LYNPHEA</p>
            <p className="mt-1 font-display text-2xl">Makeup • Beauty</p>
          </div>
        </div>
      </section>
      <section id="colecciones" className="border-y border-current/10 px-6 py-5 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <p className="text-xs uppercase tracking-[0.25em] opacity-55">Explora nuestras líneas</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["TODAS", "Todo"],
                ["LYNPHEA DAILY", "Daily"],
                ["LYNPHEA PRO", "Pro"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => {
                  setLinea(value);
                  setPagina(1);
                }}
                className={`rounded-full border px-5 py-2 text-xs uppercase tracking-[0.15em] transition ${linea === value ? (pro ? "border-[#30241e] bg-[#30241e] text-[#f4e9df]" : "border-[#211c1a] bg-[#211c1a] text-white") : "border-current/20 opacity-65 hover:opacity-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-12 lg:py-28">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] opacity-55">Selección LYNPHEA</p>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl">Lo que te va a encantar</h2>
          </div>
          <div className="flex w-full items-center gap-3 border-b border-current/20 pb-2 sm:w-64">
            <Search className="h-4 w-4 opacity-50" />
            <input
              value={busqueda}
              onChange={(event) => {
                setBusqueda(event.target.value);
                setPagina(1);
              }}
              placeholder="Buscar producto o SKU"
              className="w-full bg-transparent text-sm outline-none placeholder:opacity-50"
            />
          </div>
        </div>
        {catalogError ? (
          <p className="py-12 text-center text-sm opacity-60">
            No fue posible cargar los productos. Intenta nuevamente más tarde.
          </p>
        ) : !catalogReady ? (
          <p className="py-12 text-center text-sm opacity-60">Cargando catálogo…</p>
        ) : catalog.length === 0 ? (
          <p className="py-12 text-center text-sm opacity-60">
            {cargando
              ? "Buscando productos…"
              : isAuthenticated
                ? "Aún no hay productos para mostrar."
                : "No hay productos disponibles en inventario en este momento."}
          </p>
        ) : (
          <>
            {cargando && (
              <p className="mb-4 text-right text-xs opacity-60" role="status">
                Actualizando catálogo…
              </p>
            )}
            <div className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {catalog.map((product) => {
                const coverImage =
                  product.images.find((image) => image.is_cover)?.url ?? product.images[0]?.url;
                return (
                  <article key={product.id} className="group">
                    <div
                      className={`relative aspect-[4/5] overflow-hidden rounded-xl ${product.linea === "LYNPHEA PRO" ? "bg-[#d9c6b5]" : "bg-[#f0dcda]"}`}
                    >
                      {coverImage ? (
                        <img
                          src={coverImage}
                          alt={product.nombre}
                          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-current/45">
                          <ImagePlus className="h-8 w-8" />
                          <span className="text-xs uppercase tracking-[0.16em]">Sin imagen</span>
                        </div>
                      )}
                      <span className="absolute left-3 top-3 bg-white/85 px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
                        {product.linea === "LYNPHEA PRO" ? "Pro" : "Daily"}
                      </span>
                      {isAuthenticated && (
                        <div className="absolute bottom-3 right-3 flex gap-2">
                          <input
                            ref={(element) => {
                              if (element) imageInputRefs.current.set(product.id, element);
                              else imageInputRefs.current.delete(product.id);
                            }}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            onChange={(event) =>
                              void handleAddImage(product.id, event.target.files?.[0])
                            }
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={uploadingProductId === product.id}
                            onClick={() => imageInputRefs.current.get(product.id)?.click()}
                            title="Añadir imagen"
                            aria-label={`Añadir imagen a ${product.nombre}`}
                            className="h-9 w-9 p-0 shadow"
                          >
                            <ImagePlus className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setImageProductId(product.id)}
                            title="Ordenar imágenes y elegir portada"
                            aria-label={`Administrar imágenes de ${product.nombre}`}
                            className="h-9 px-3 shadow"
                          >
                            Fotos {product.images.length}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-display text-2xl">{product.nombre}</h3>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] opacity-50">
                            {product.sku}
                          </p>
                        </div>
                        <p className="text-sm">
                          {product.precio ? money(product.precio) : "Consultar"}
                        </p>
                      </div>
                      {!isAuthenticated && (
                        <button className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.16em] opacity-60 group-hover:opacity-100">
                          Ver detalle <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-current/10 pt-5 text-xs">
              <p className="opacity-65">
                Mostrando {(pagina - 1) * porPagina + 1}–
                {Math.min((pagina - 1) * porPagina + catalog.length, totalProductos)} de{" "}
                {totalProductos.toLocaleString("es-CO")} productos
              </p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 opacity-75">
                  Por página
                  <select
                    value={porPagina}
                    onChange={(event) => {
                      setPorPagina(Number(event.target.value));
                      setPagina(1);
                    }}
                    className="rounded border border-current/20 bg-transparent px-2 py-1"
                  >
                    <option value={12}>12</option>
                    <option value={24}>24</option>
                    <option value={48}>48</option>
                  </select>
                </label>
                {totalPaginas > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagina <= 1 || cargando}
                      onClick={() => setPagina((current) => Math.max(1, current - 1))}
                      className="border-current/20 bg-transparent text-current"
                    >
                      Anterior
                    </Button>
                    <span className="whitespace-nowrap opacity-70">
                      {pagina} / {totalPaginas}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagina >= totalPaginas || cargando}
                      onClick={() => setPagina((current) => Math.min(totalPaginas, current + 1))}
                      className="border-current/20 bg-transparent text-current"
                    >
                      Siguiente
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </section>
      <section
        id="esencia"
        className={`mx-6 grid max-w-7xl gap-10 rounded-[1.5rem] px-7 py-14 sm:px-12 lg:mx-auto lg:grid-cols-2 lg:items-center lg:px-20 lg:py-20 ${pro ? "bg-[#3c2d25] text-[#f4e9df]" : "bg-[#ead1ce]"}`}
      >
        <div>
          <p className="text-xs uppercase tracking-[0.28em] opacity-60">Nuestra esencia</p>
          <h2 className="mt-4 max-w-lg font-display text-5xl leading-none">
            Rituales que se sienten como tú.
          </h2>
        </div>
        <p className="max-w-md text-base leading-7 opacity-75">
          LYNPHEA nace para hacer del maquillaje un momento propio: sencillo cuando lo necesitas,
          poderoso cuando lo deseas y siempre cercano a tu forma de expresarte.
        </p>
      </section>
      <footer
        id="contacto"
        className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-6 py-14 lg:px-12"
      >
        <div>
          <p className="font-display text-2xl tracking-[0.16em]">LYNPHEA</p>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] opacity-50">Makeup • Beauty</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <a
            href="https://wa.me/573203760266"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-full bg-[#25D366] px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:brightness-95"
          >
            <MessageCircle className="h-5 w-5" />
            <span>
              <span className="block text-[10px] uppercase tracking-[0.16em] opacity-80">
                WhatsApp
              </span>
              <strong className="font-medium">+57 320 376 0266</strong>
            </span>
          </a>
          <a
            href="https://instagram.com/lyhphea_makeup"
            target="_blank"
            rel="noreferrer"
            aria-label="Instagram LYNPHEA"
            className="rounded-full border border-current/15 p-3"
          >
            <Instagram className="h-4 w-4" />
          </a>
        </div>
      </footer>
      <Dialog
        open={imageProductId !== null}
        onOpenChange={(open) => {
          if (!open) setImageProductId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Imágenes del producto</DialogTitle>
            <DialogDescription>
              Arrastra las imágenes para cambiar el orden y selecciona cuál será la portada.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const product = catalog.find((item) => item.id === imageProductId);
            if (!product)
              return <p className="text-sm text-muted-foreground">Producto no encontrado.</p>;
            if (product.images.length === 0)
              return (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Aún no hay imágenes para este producto. Usa el botón de añadir imagen en su
                  tarjeta.
                </p>
              );
            return (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {product.images.map((image) => (
                  <article
                    key={image.id}
                    draggable
                    onDragStart={() => setDraggedImageId(image.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => void handleImageDrop(product, image.id)}
                    className={`overflow-hidden rounded-lg border bg-card ${draggedImageId === image.id ? "opacity-40" : ""}`}
                  >
                    <div className="relative aspect-square">
                      <img
                        src={image.url}
                        alt={`Foto de ${product.nombre}`}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute left-2 top-2 rounded bg-white/90 p-1.5 text-foreground">
                        <GripVertical className="h-4 w-4" />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-3">
                      <Button
                        type="button"
                        size="sm"
                        variant={image.is_cover ? "default" : "outline"}
                        disabled={savingImage || image.is_cover}
                        onClick={() => void handleSetCover(product.id, image.id)}
                        className="gap-2"
                      >
                        <Star className="h-3.5 w-3.5" />
                        {image.is_cover ? "Portada" : "Usar de portada"}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={savingImage}
                        onClick={() => void handleDeleteImage(image)}
                        aria-label="Eliminar imagen"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </main>
  );
}
