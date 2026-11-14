import { jsPDF } from "jspdf";
import { fetchIndexCatalog, type PublicCatalogProduct } from "@/lib/supabase-data";

type PdfPhoto = {
  data: string | null;
  expected: boolean;
  width: number;
  height: number;
};

type Rgb = [number, number, number];

type PhotoData = {
  data: string;
  width: number;
  height: number;
};

export type CatalogPdfProgress = {
  percent: number;
  message: string;
};

const colors = {
  paper: [249, 247, 242] as const,
  ink: [39, 31, 33] as const,
  muted: [112, 101, 100] as const,
  rose: [105, 39, 58] as const,
  blush: [232, 223, 212] as const,
  border: [220, 213, 203] as const,
  white: [255, 255, 255] as const,
  gold: [190, 160, 111] as const,
};

function getLinePalette(linea: PublicCatalogProduct["linea"]): {
  ink: Rgb;
  accent: Rgb;
  paper: Rgb;
} {
  return linea === "LYNPHEA PRO"
    ? {
        ink: [48, 36, 30],
        accent: [111, 78, 51],
        paper: [239, 232, 218],
      }
    : {
        ink: [39, 31, 33],
        accent: [105, 39, 58],
        paper: [249, 247, 242],
      };
}

const photoCache = new Map<string, Promise<ImageBitmap>>();
const fontCache = new Map<string, Promise<string>>();

const pdfFonts = [
  { file: "CormorantGaramond-Regular.ttf", style: "normal" },
  { file: "CormorantGaramond-Italic.ttf", style: "italic" },
  { file: "CormorantGaramond-SemiBold.ttf", style: "bold" },
  { file: "CormorantGaramond-SemiBoldItalic.ttf", style: "bolditalic" },
  { file: "Jost-Regular.ttf", style: "normal" },
  { file: "Jost-SemiBold.ttf", style: "bold" },
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
        throw new Error(`No se pudo cargar la tipografía del catálogo (${response.status}).`);
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
    pdf.addFont(file, file.startsWith("Jost-") ? "Jost" : "CormorantGaramond", style);
  });
}

function getProductPhotos(product: PublicCatalogProduct) {
  const cover = product.images.find((image) => image.is_cover) ?? product.images[0];
  if (!cover) return [];
  return [cover, ...product.images.filter((image) => image.id !== cover.id).slice(0, 3)];
}

async function fetchPhoto(url: string): Promise<PhotoData> {
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
  const canvas = document.createElement("canvas");
  const scale = Math.min(900 / bitmap.width, 1200 / bitmap.height, 1);
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No fue posible preparar una imagen para el catálogo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return {
    data: canvas.toDataURL("image/jpeg", 0.8),
    width: canvas.width,
    height: canvas.height,
  };
}

async function loadProductPhotos(product: PublicCatalogProduct): Promise<PdfPhoto[]> {
  const images = getProductPhotos(product);
  const loaded = await Promise.all(
    images.map(async (image) => {
      try {
        return await fetchPhoto(image.url);
      } catch (error) {
        console.error(`No se pudo cargar una imagen de "${product.nombre}" para el PDF:`, error);
        return null;
      }
    }),
  );
  return Array.from({ length: 4 }, (_, index) => ({
    data: loaded[index]?.data ?? null,
    expected: index < images.length,
    width: loaded[index]?.width ?? 0,
    height: loaded[index]?.height ?? 0,
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
  imageWidth: number,
  imageHeight: number,
) {
  if (!data) return;
  pdf.setFillColor(...colors.white);
  pdf.roundedRect(x, y, width, height, 1.5, 1.5, "F");
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(x, y, width, height, 1.5, 1.5, "S");
  const innerWidth = width - 1.5;
  const innerHeight = height - 1.5;
  const scale = Math.min(innerWidth / imageWidth, innerHeight / imageHeight);
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;
  pdf.addImage(
    data,
    "JPEG",
    x + (width - renderedWidth) / 2,
    y + (height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
  );
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

function addCoverPage(pdf: jsPDF, photo: PhotoData | null, productCount: number) {
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(250, 248, 243);
  pdf.rect(0, 0, width, height, "F");

  pdf.setFillColor(...colors.rose);
  pdf.rect(0, 0, width, 105, "F");
  pdf.setFillColor(...colors.gold);
  pdf.rect(17, 18, 0.8, 67, "F");

  pdf.setTextColor(243, 224, 204);
  pdf.setFont("Jost", "normal");
  pdf.setFontSize(9);
  pdf.setCharSpace(2);
  pdf.text("MAKEUP  /  BEAUTY", 24, 29);
  pdf.setCharSpace(0);

  pdf.setTextColor(255, 249, 242);
  pdf.setFont("Jost", "bold");
  pdf.setFontSize(36);
  pdf.text("LYNPHEA", 23, 55);
  pdf.setTextColor(243, 224, 204);
  pdf.setFont("CormorantGaramond", "italic");
  pdf.setFontSize(26);
  pdf.text("Belleza que habla de ti", 24, 73);
  pdf.setDrawColor(...colors.gold);
  pdf.setLineWidth(0.5);
  pdf.line(24, 82, 79, 82);

  pdf.setTextColor(...colors.ink);
  pdf.setFont("CormorantGaramond", "italic");
  pdf.setFontSize(43);
  pdf.text("Tu belleza,", 23, 128);
  pdf.setTextColor(...colors.rose);
  pdf.setFont("CormorantGaramond", "bolditalic");
  pdf.setFontSize(48);
  pdf.text("a tu manera.", 23, 148);
  pdf.setTextColor(...colors.muted);
  pdf.setFont("Jost", "normal");
  pdf.setFontSize(10);
  pdf.text("Una selección para descubrir y disfrutar.", 25, 160);

  if (photo) drawPhoto(pdf, photo.data, 112, 114, 76, 134, photo.width, photo.height);

  pdf.setDrawColor(...colors.gold);
  pdf.setLineWidth(0.45);
  pdf.line(23, 270, width - 23, 270);
  pdf.setTextColor(...colors.rose);
  pdf.setFont("Jost", "bold");
  pdf.setFontSize(8);
  pdf.setCharSpace(1);
  pdf.text("COLECCIÓN DE PRODUCTOS", 23, 281);
  pdf.setCharSpace(0);
  pdf.setFont("Jost", "normal");
  pdf.setTextColor(...colors.muted);
  pdf.text(`${productCount} productos  ·  ${new Date().getFullYear()}`, width - 23, 281, {
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
  pdf.setFont("Jost", "bold");
  pdf.setFontSize(16);
  pdf.text("LYNPHEA", 15, 17);
  pdf.setTextColor(...accent);
  pdf.setFont("CormorantGaramond", "italic");
  pdf.setFontSize(14);
  pdf.text(linea === "LYNPHEA DAILY" ? "LYNPHEA DAILY" : "LYNPHEA PRO", width - 15, 16, {
    align: "right",
  });
  pdf.setDrawColor(...accent);
  pdf.setLineWidth(0.7);
  pdf.line(15, 23, width - 15, 23);
  pdf.setTextColor(...colors.muted);
  pdf.setFont("Jost", "normal");
  pdf.setFontSize(7);
  pdf.text(`COLECCIÓN  /  ${new Date().getFullYear()}`, 15, 27);
  pdf.text(
    `${String(pageNumber).padStart(2, "0")}  ·  ${String(sectionPage).padStart(2, "0")}`,
    width - 15,
    27,
    { align: "right" },
  );
  pdf.setDrawColor(...accent);
  pdf.setLineWidth(0.45);
  pdf.line(15, 280, width - 15, 280);
  pdf.setFont("Jost", "normal");
  pdf.setFontSize(7);
  pdf.text("LYNPHEA  ·  MAKEUP & BEAUTY", 15, 286);
  pdf.text("PRECIOS DE VENTA EN COP", width - 15, 286, { align: "right" });
}

function drawProduct(pdf: jsPDF, product: PublicCatalogProduct, photos: PdfPhoto[], top: number) {
  const { ink, accent } = getLinePalette(product.linea);
  const left = 14;
  const cardWidth = 182;
  const cardHeight = 112;
  pdf.setFillColor(...colors.white);
  pdf.rect(left, top, cardWidth, cardHeight, "F");
  pdf.setFillColor(...accent);
  pdf.rect(left, top, cardWidth, 1.2, "F");

  if (photos[0]?.data) {
    drawPhoto(pdf, photos[0].data, left + 6, top + 7, 70, 98, photos[0].width, photos[0].height);
  }

  const detailLeft = photos[0]?.data ? left + 82 : left + 8;
  const detailWidth = cardWidth - (photos[0]?.data ? 91 : 16);
  pdf.setTextColor(...accent);
  pdf.setFont("Jost", "bold");
  pdf.setFontSize(8);
  pdf.setCharSpace(1);
  pdf.text(
    product.linea === "LYNPHEA DAILY" ? "DAILY  /  LYNPHEA" : "PRO  /  LYNPHEA",
    detailLeft,
    top + 13,
  );
  pdf.setCharSpace(0);

  pdf.setTextColor(...ink);
  pdf.setFont("Jost", "bold");
  pdf.setFontSize(20);
  const wrappedTitle = pdf.splitTextToSize(product.nombre, detailWidth);
  const titleLines = (Array.isArray(wrappedTitle) ? wrappedTitle : [wrappedTitle]).slice(0, 2);
  pdf.text(titleLines, detailLeft, top + 24, { lineHeightFactor: 1.02 });

  const thumbnailPhotos = photos.slice(1).filter((photo) => photo.data !== null);
  const thumbnailTop = top + 49;
  const thumbnailGap = 3;
  const thumbnailWidth = (detailWidth - thumbnailGap * 2) / 3;
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
      photo.width,
      photo.height,
    );
  }

  const priceTop = top + 88;
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.25);
  pdf.line(detailLeft, priceTop - 4, left + cardWidth - 7, priceTop - 4);
  pdf.setTextColor(...colors.muted);
  pdf.setFont("Jost", "normal");
  pdf.setFontSize(9);
  pdf.text("PRECIO DE VENTA", detailLeft, priceTop + 2);
  pdf.setTextColor(...accent);
  pdf.setFont("Jost", "bold");
  pdf.setFontSize(21);
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

  onProgress({ percent: 12, message: "Cargando tipografías editoriales…" });
  await registerPdfFonts(pdf);
  onProgress({ percent: 18, message: "Tipografía editorial lista. Componiendo portada…" });

  const firstProduct = dailyProducts[0] ?? proProducts[0];
  const firstCover = firstProduct ? getProductPhotos(firstProduct)[0] : undefined;
  let coverPhoto: PhotoData | null = null;
  if (firstCover) {
    try {
      coverPhoto = await fetchPhoto(firstCover.url);
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
