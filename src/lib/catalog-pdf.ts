import { jsPDF } from "jspdf";
import { fetchIndexCatalog, type PublicCatalogProduct } from "@/lib/supabase-data";

type PdfPhoto = {
  data: string | null;
  expected: boolean;
};

type Rgb = [number, number, number];

export type CatalogPdfProgress = {
  percent: number;
  message: string;
};

const colors = {
  paper: [248, 244, 240] as const,
  ink: [53, 42, 44] as const,
  muted: [130, 111, 111] as const,
  rose: [172, 102, 113] as const,
  blush: [239, 224, 221] as const,
  border: [231, 221, 218] as const,
  white: [255, 255, 255] as const,
  photo: [244, 237, 233] as const,
  gold: [181, 151, 111] as const,
};

function getLinePalette(linea: PublicCatalogProduct["linea"]): {
  ink: Rgb;
  accent: Rgb;
  paper: Rgb;
} {
  return linea === "LYNPHEA PRO"
    ? {
        ink: [48, 36, 30],
        accent: [127, 91, 67],
        paper: [240, 232, 223],
      }
    : {
        ink: [53, 42, 44],
        accent: [172, 102, 113],
        paper: [248, 244, 240],
      };
}

const photoCache = new Map<string, Promise<ImageBitmap>>();
const fontCache = new Map<string, Promise<string>>();

const pdfFonts = [
  { file: "CormorantGaramond-Regular.ttf", style: "normal" },
  { file: "CormorantGaramond-Italic.ttf", style: "italic" },
  { file: "CormorantGaramond-SemiBold.ttf", style: "bold" },
  { file: "CormorantGaramond-SemiBoldItalic.ttf", style: "bolditalic" },
] as const;

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function loadPdfFont(file: string) {
  let loading = fontCache.get(file);
  if (!loading) {
    loading = (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`);
      if (!response.ok) {
        throw new Error(`No se pudo cargar la tipografía Cormorant Garamond (${response.status}).`);
      }
      return arrayBufferToBase64(await response.arrayBuffer());
    })();
    fontCache.set(file, loading);
    void loading.catch(() => fontCache.delete(file));
  }
  return loading;
}

async function registerPdfFonts(pdf: jsPDF) {
  const fontData = await Promise.all(pdfFonts.map(({ file }) => loadPdfFont(file)));
  pdfFonts.forEach(({ file, style }, index) => {
    const data = fontData[index];
    if (!data) throw new Error(`No se pudo preparar la tipografía ${file}.`);
    pdf.addFileToVFS(file, data);
    pdf.addFont(file, "CormorantGaramond", style);
  });
}

function getProductPhotos(product: PublicCatalogProduct) {
  const cover = product.images.find((image) => image.is_cover) ?? product.images[0];
  if (!cover) return [];
  return [cover, ...product.images.filter((image) => image.id !== cover.id).slice(0, 3)];
}

async function fetchPhoto(url: string, aspectRatio: number) {
  let loading = photoCache.get(url);
  if (!loading) {
    loading = (async () => {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`No se pudo cargar una imagen del catálogo (${response.status}).`);
      return createImageBitmap(await response.blob());
    })();
    photoCache.set(url, loading);
  }

  const bitmap = await loading;
  const sourceRatio = bitmap.width / bitmap.height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = bitmap.width;
  let sourceHeight = bitmap.height;
  if (sourceRatio > aspectRatio) {
    sourceWidth = bitmap.height * aspectRatio;
    sourceX = (bitmap.width - sourceWidth) / 2;
  } else {
    sourceHeight = bitmap.width / aspectRatio;
    sourceY = (bitmap.height - sourceHeight) / 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 700;
  canvas.height = Math.round(canvas.width / aspectRatio);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No fue posible preparar una imagen para el catálogo.");
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/jpeg", 0.78);
}

async function loadProductPhotos(product: PublicCatalogProduct): Promise<PdfPhoto[]> {
  const images = getProductPhotos(product);
  const loaded = await Promise.all(
    images.map(async (image) => {
      try {
        const aspectRatio = image === images[0] ? 0.75 : 0.7;
        return await fetchPhoto(image.url, aspectRatio);
      } catch (error) {
        console.error(`No se pudo cargar una imagen de "${product.nombre}" para el PDF:`, error);
        return null;
      }
    }),
  );
  return Array.from({ length: 4 }, (_, index) => ({
    data: loaded[index] ?? null,
    expected: index < images.length,
  }));
}

function formatPrice(price: number) {
  return `$${Math.round(Number.isFinite(price) ? price : 0).toLocaleString("es-CO")}`;
}

function drawPhoto(
  pdf: jsPDF,
  data: string | null,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!data) return;
  pdf.setFillColor(...colors.white);
  pdf.roundedRect(x, y, width, height, 1.5, 1.5, "F");
  pdf.addImage(data, "JPEG", x + 0.5, y + 0.5, width - 1, height - 1);
}

function clearPhotoCache() {
  for (const promise of photoCache.values()) {
    void promise.then(
      (bitmap) => bitmap.close(),
      () => undefined,
    );
  }
  photoCache.clear();
}

async function loadCatalog(onProgress: (progress: CatalogPdfProgress) => void) {
  const pageSize = 100;
  onProgress({ percent: 2, message: "Conectando con el catálogo…" });
  const firstPage = await fetchIndexCatalog(false, { page: 1, pageSize });
  const products = [...firstPage.products];
  const pageCount = Math.ceil(firstPage.totalCount / pageSize);
  onProgress({
    percent: pageCount ? 2 + Math.round(8 / pageCount) : 10,
    message: `Productos encontrados: ${firstPage.totalCount}. Preparando páginas…`,
  });
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await fetchIndexCatalog(false, { page, pageSize });
    products.push(...result.products);
    onProgress({
      percent: 2 + Math.round((page / pageCount) * 8),
      message: `Cargando productos (${products.length} de ${firstPage.totalCount})…`,
    });
  }
  return products;
}

function addCoverPage(pdf: jsPDF, photo: string | null, productCount: number) {
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(...colors.paper);
  pdf.rect(0, 0, width, height, "F");

  pdf.setFillColor(...colors.blush);
  pdf.circle(183, 89, 61, "F");
  pdf.setFillColor(...colors.rose);
  pdf.circle(191, 94, 43, "F");
  pdf.setFillColor(...colors.gold);
  pdf.circle(177, 108, 25, "F");

  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.35);
  pdf.rect(9, 9, width - 18, height - 18, "S");

  pdf.setTextColor(...colors.rose);
  pdf.setFont("CormorantGaramond", "bold");
  pdf.setFontSize(8);
  pdf.text("MAKEUP  /  BEAUTY", 19, 28);

  pdf.setTextColor(...colors.ink);
  pdf.setFont("CormorantGaramond", "bolditalic");
  pdf.setFontSize(34);
  pdf.text("LYNPHEA", 18, 54);
  pdf.setDrawColor(...colors.rose);
  pdf.setLineWidth(1.1);
  pdf.line(19, 62, 70, 62);

  pdf.setFont("CormorantGaramond", "italic");
  pdf.setFontSize(46);
  pdf.text("CATÁLOGO", 18, 91);
  pdf.setFont("CormorantGaramond", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...colors.muted);
  pdf.text("UNA SELECCIÓN PARA DESCUBRIR", 20, 101);

  if (photo) {
    pdf.setFillColor(...colors.white);
    pdf.roundedRect(19, 121, 172, 113, 3, 3, "F");
    pdf.setFillColor(...colors.rose);
    pdf.rect(19, 121, 3, 113, "F");
    drawPhoto(pdf, photo, 26, 128, 158, 99);
  }

  pdf.setTextColor(...colors.ink);
  pdf.setFont("CormorantGaramond", "italic");
  pdf.setFontSize(16);
  pdf.text("Tu belleza, a tu manera.", 19, 253);
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.35);
  pdf.line(19, 263, width - 19, 263);

  pdf.setFont("CormorantGaramond", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...colors.rose);
  pdf.text("COLECCIÓN DE PRODUCTOS", 19, 275);
  pdf.setFont("CormorantGaramond", "normal");
  pdf.setTextColor(...colors.muted);
  pdf.text(`${productCount} PRODUCTOS  ·  ${new Date().getFullYear()}`, width - 19, 275, {
    align: "right",
  });
}

function drawPageHeader(
  pdf: jsPDF,
  pageNumber: number,
  linea: PublicCatalogProduct["linea"],
  sectionPage: number,
) {
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const { ink, accent, paper } = getLinePalette(linea);
  pdf.setFillColor(...paper);
  pdf.rect(0, 0, width, height, "F");
  pdf.setTextColor(...ink);
  pdf.setFont("CormorantGaramond", "bolditalic");
  pdf.setFontSize(19);
  pdf.text("LYNPHEA", 15, 17);
  pdf.setTextColor(...accent);
  pdf.setFont("CormorantGaramond", "italic");
  pdf.setFontSize(11);
  pdf.text(linea === "LYNPHEA DAILY" ? "LYNPHEA DAILY" : "LYNPHEA PRO", width - 15, 16, {
    align: "right",
  });
  pdf.setDrawColor(...accent);
  pdf.setLineWidth(0.6);
  pdf.line(15, 23, width - 15, 23);
  pdf.setTextColor(...colors.muted);
  pdf.setFontSize(7);
  pdf.text(`COLECCIÓN  /  ${new Date().getFullYear()}`, 15, 27);
  pdf.text(
    `${String(pageNumber).padStart(2, "0")}  ·  ${String(sectionPage).padStart(2, "0")}`,
    width - 15,
    27,
    { align: "right" },
  );
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.35);
  pdf.line(15, 280, width - 15, 280);
  pdf.setFontSize(6.5);
  pdf.text("LYNPHEA  ·  MAKEUP & BEAUTY", 15, 286);
  pdf.text("PRECIOS DE VENTA EN COP", width - 15, 286, { align: "right" });
}

function drawProduct(pdf: jsPDF, product: PublicCatalogProduct, photos: PdfPhoto[], top: number) {
  const { ink, accent } = getLinePalette(product.linea);
  const left = 14;
  const cardWidth = 182;
  const cardHeight = 112;
  pdf.setFillColor(...colors.white);
  pdf.roundedRect(left, top, cardWidth, cardHeight, 2.5, 2.5, "F");
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(left, top, cardWidth, cardHeight, 2.5, 2.5, "S");
  pdf.setFillColor(...accent);
  pdf.roundedRect(left, top, 2.2, cardHeight, 1, 1, "F");

  if (photos[0]?.data) drawPhoto(pdf, photos[0].data, left + 6, top + 7, 70, 98);

  const detailLeft = photos[0]?.data ? left + 82 : left + 8;
  const detailWidth = cardWidth - (photos[0]?.data ? 91 : 16);
  pdf.setTextColor(...accent);
  pdf.setFont("CormorantGaramond", "italic");
  pdf.setFontSize(10);
  pdf.text(
    product.linea === "LYNPHEA DAILY" ? "LYNPHEA DAILY" : "LYNPHEA PRO",
    detailLeft,
    top + 13,
  );

  pdf.setTextColor(...ink);
  pdf.setFont("CormorantGaramond", "bolditalic");
  pdf.setFontSize(19);
  const wrappedTitle = pdf.splitTextToSize(product.nombre.toUpperCase(), detailWidth);
  const titleLines = (Array.isArray(wrappedTitle) ? wrappedTitle : [wrappedTitle]).slice(0, 2);
  pdf.text(titleLines, detailLeft, top + 23, { lineHeightFactor: 1.05 });

  const thumbnailPhotos = photos.slice(1).filter((photo) => photo.data !== null);
  const thumbnailTop = top + 48;
  const thumbnailGap = 3;
  const thumbnailWidth =
    thumbnailPhotos.length > 0
      ? (detailWidth - thumbnailGap * (thumbnailPhotos.length - 1)) / thumbnailPhotos.length
      : 0;
  for (let index = 0; index < thumbnailPhotos.length; index += 1) {
    const photo = thumbnailPhotos[index];
    if (!photo?.data) continue;
    drawPhoto(
      pdf,
      photo.data,
      detailLeft + index * (thumbnailWidth + thumbnailGap),
      thumbnailTop,
      thumbnailWidth,
      32,
    );
  }

  const priceTop = top + 88;
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.25);
  pdf.line(detailLeft, priceTop - 4, left + cardWidth - 7, priceTop - 4);
  pdf.setTextColor(...colors.muted);
  pdf.setFont("CormorantGaramond", "italic");
  pdf.setFontSize(10);
  pdf.text("Precio de venta", detailLeft, priceTop + 3);
  pdf.setTextColor(...accent);
  pdf.setFont("CormorantGaramond", "bolditalic");
  pdf.setFontSize(20);
  pdf.text(formatPrice(product.precio), left + cardWidth - 7, priceTop + 5, { align: "right" });
}

export async function downloadPublicCatalogPdf(
  onProgress: (progress: CatalogPdfProgress) => void = () => undefined,
) {
  const products = await loadCatalog(onProgress);
  if (products.length === 0) throw new Error("No hay productos disponibles para el catálogo.");
  const dailyProducts = products.filter((product) => product.linea === "LYNPHEA DAILY");
  const proProducts = products.filter((product) => product.linea === "LYNPHEA PRO");
  const sections = [
    { linea: "LYNPHEA DAILY" as const, products: dailyProducts },
    { linea: "LYNPHEA PRO" as const, products: proProducts },
  ].filter((section) => section.products.length > 0);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  pdf.setProperties({
    title: "Catálogo LYNPHEA",
    subject: "Catálogo de productos LYNPHEA",
    author: "LYNPHEA",
  });

  onProgress({ percent: 12, message: "Cargando Cormorant Garamond…" });
  await registerPdfFonts(pdf);
  onProgress({ percent: 18, message: "Tipografía editorial lista. Componiendo portada…" });

  const firstProduct = dailyProducts[0] ?? proProducts[0];
  const firstCover = firstProduct ? getProductPhotos(firstProduct)[0] : undefined;
  let coverPhoto: string | null = null;
  if (firstCover) {
    try {
      coverPhoto = await fetchPhoto(firstCover.url, 1.6);
    } catch (error) {
      console.error("No se pudo cargar la imagen para la portada del catálogo:", error);
    }
  }
  addCoverPage(pdf, coverPhoto, products.length);
  coverPhoto = null;

  let missingPhotos = 0;
  let processedProducts = 0;
  let pageNumber = 2;
  for (const section of sections) {
    const sectionPageCount = Math.ceil(section.products.length / 2);
    for (let index = 0; index < section.products.length; index += 2) {
      pdf.addPage();
      drawPageHeader(pdf, pageNumber, section.linea, Math.floor(index / 2) + 1);
      pageNumber += 1;
      const pageProducts = section.products.slice(index, index + 2);
      const pagePhotos = await Promise.all(pageProducts.map(loadProductPhotos));
      pageProducts.forEach((product, productIndex) => {
        const productPhotos = pagePhotos[productIndex] ?? [];
        missingPhotos += productPhotos.filter(
          (photo) => photo.expected && photo.data === null,
        ).length;
        drawProduct(pdf, product, productPhotos, productIndex === 0 ? 34 : 157);
      });
      processedProducts += pageProducts.length;
      onProgress({
        percent: Math.min(94, 18 + Math.round((processedProducts / products.length) * 76)),
        message: `Diseñando ${section.linea === "LYNPHEA DAILY" ? "DAILY" : "PRO"} · página ${Math.floor(index / 2) + 1} de ${sectionPageCount}`,
      });
      clearPhotoCache();
    }
  }

  const date = new Date();
  const dateStamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  onProgress({ percent: 98, message: "Finalizando el PDF…" });
  pdf.save(`lynphea-catalogo-${dateStamp}.pdf`);
  onProgress({ percent: 100, message: "Catálogo listo." });
  return { productCount: products.length, missingPhotos };
}
