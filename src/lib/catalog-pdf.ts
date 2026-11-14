import { jsPDF } from "jspdf";
import { fetchIndexCatalog, type PublicCatalogProduct } from "@/lib/supabase-data";

type PdfPhoto = {
  data: string | null;
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

const photoCache = new Map<string, Promise<string>>();

function getProductPhotos(product: PublicCatalogProduct) {
  const cover = product.images.find((image) => image.is_cover) ?? product.images[0];
  if (!cover) return [];
  return [cover, ...product.images.filter((image) => image.id !== cover.id).slice(0, 3)];
}

async function fetchPhoto(url: string, aspectRatio: number) {
  const key = `${url}:${aspectRatio}`;
  const cached = photoCache.get(key);
  if (cached) return cached;

  const loading = (async () => {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`No se pudo cargar una imagen del catálogo (${response.status}).`);
    const bitmap = await createImageBitmap(await response.blob());
    try {
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
      canvas.width = 900;
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
      return canvas.toDataURL("image/jpeg", 0.82);
    } finally {
      bitmap.close();
    }
  })();
  photoCache.set(key, loading);
  return loading;
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
  return Array.from({ length: 4 }, (_, index) => ({ data: loaded[index] ?? null }));
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
  label: string,
) {
  pdf.setFillColor(...colors.photo);
  pdf.roundedRect(x, y, width, height, 1.5, 1.5, "F");
  if (data) {
    pdf.addImage(data, "JPEG", x + 0.5, y + 0.5, width - 1, height - 1);
    return;
  }

  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, width, height, 1.5, 1.5, "S");
  pdf.setTextColor(...colors.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6);
  pdf.text(label, x + width / 2, y + height / 2, { align: "center" });
}

async function loadCatalog() {
  const pageSize = 100;
  const firstPage = await fetchIndexCatalog(false, { page: 1, pageSize });
  const products = [...firstPage.products];
  const pageCount = Math.ceil(firstPage.totalCount / pageSize);
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await fetchIndexCatalog(false, { page, pageSize });
    products.push(...result.products);
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
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("MAKEUP  /  BEAUTY", 19, 28);

  pdf.setTextColor(...colors.ink);
  pdf.setFont("times", "bold");
  pdf.setFontSize(32);
  pdf.text("LYNPHEA", 18, 54);
  pdf.setDrawColor(...colors.rose);
  pdf.setLineWidth(1.1);
  pdf.line(19, 62, 70, 62);

  pdf.setFont("times", "normal");
  pdf.setFontSize(43);
  pdf.text("CATÁLOGO", 18, 91);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...colors.muted);
  pdf.text("UNA SELECCIÓN PARA DESCUBRIR", 20, 101);

  pdf.setFillColor(...colors.white);
  pdf.roundedRect(19, 121, 172, 113, 3, 3, "F");
  pdf.setFillColor(...colors.rose);
  pdf.rect(19, 121, 3, 113, "F");
  drawPhoto(pdf, photo, 26, 128, 158, 99, "IMAGEN DE PORTADA");

  pdf.setTextColor(...colors.ink);
  pdf.setFont("times", "italic");
  pdf.setFontSize(16);
  pdf.text("Tu belleza, a tu manera.", 19, 253);
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.35);
  pdf.line(19, 263, width - 19, 263);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...colors.rose);
  pdf.text("COLECCIÓN DE PRODUCTOS", 19, 275);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...colors.muted);
  pdf.text(`${productCount} PRODUCTOS  ·  ${new Date().getFullYear()}`, width - 19, 275, {
    align: "right",
  });
}

function drawPageHeader(pdf: jsPDF, pageNumber: number) {
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(...colors.paper);
  pdf.rect(0, 0, width, height, "F");
  pdf.setTextColor(...colors.ink);
  pdf.setFont("times", "bold");
  pdf.setFontSize(17);
  pdf.text("LYNPHEA", 15, 17);
  pdf.setTextColor(...colors.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.text("CATÁLOGO DE PRODUCTOS", width - 15, 16, { align: "right" });
  pdf.setDrawColor(...colors.rose);
  pdf.setLineWidth(0.6);
  pdf.line(15, 23, width - 15, 23);
  pdf.setTextColor(...colors.muted);
  pdf.setFontSize(7);
  pdf.text(`EDICIÓN ${new Date().getFullYear()}`, 15, 27);
  pdf.text(String(pageNumber).padStart(2, "0"), width - 15, 27, { align: "right" });
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.35);
  pdf.line(15, 280, width - 15, 280);
  pdf.setFontSize(6.5);
  pdf.text("LYNPHEA  ·  MAKEUP & BEAUTY", 15, 286);
  pdf.text("PRECIOS DE VENTA EN COP", width - 15, 286, { align: "right" });
}

function drawProduct(pdf: jsPDF, product: PublicCatalogProduct, photos: PdfPhoto[], top: number) {
  const left = 14;
  const cardWidth = 182;
  const cardHeight = 112;
  pdf.setFillColor(...colors.white);
  pdf.roundedRect(left, top, cardWidth, cardHeight, 2.5, 2.5, "F");
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(left, top, cardWidth, cardHeight, 2.5, 2.5, "S");
  pdf.setFillColor(...colors.rose);
  pdf.roundedRect(left, top, 2.2, cardHeight, 1, 1, "F");

  drawPhoto(pdf, photos[0]?.data ?? null, left + 6, top + 7, 70, 98, "SIN PORTADA");

  const detailLeft = left + 82;
  const detailWidth = cardWidth - 91;
  pdf.setTextColor(...colors.muted);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.5);
  pdf.text("DETALLE DEL PRODUCTO", detailLeft, top + 13);

  pdf.setTextColor(...colors.ink);
  pdf.setFont("times", "bold");
  pdf.setFontSize(16);
  const wrappedTitle = pdf.splitTextToSize(product.nombre.toUpperCase(), detailWidth);
  const titleLines = (Array.isArray(wrappedTitle) ? wrappedTitle : [wrappedTitle]).slice(0, 2);
  pdf.text(titleLines, detailLeft, top + 23, { lineHeightFactor: 1.05 });

  const thumbnailTop = top + 43;
  const thumbnailGap = 3;
  const thumbnailWidth = (detailWidth - thumbnailGap * 2) / 3;
  for (let index = 0; index < 3; index += 1) {
    const photoIndex = index + 1;
    drawPhoto(
      pdf,
      photos[photoIndex]?.data ?? null,
      detailLeft + index * (thumbnailWidth + thumbnailGap),
      thumbnailTop,
      thumbnailWidth,
      37,
      `FOTO 0${photoIndex + 1}`,
    );
  }

  const priceTop = top + 88;
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.25);
  pdf.line(detailLeft, priceTop - 4, left + cardWidth - 7, priceTop - 4);
  pdf.setTextColor(...colors.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.text("PRECIO DE VENTA", detailLeft, priceTop + 3);
  pdf.setTextColor(...colors.rose);
  pdf.setFont("times", "bold");
  pdf.setFontSize(17);
  pdf.text(formatPrice(product.precio), left + cardWidth - 7, priceTop + 5, { align: "right" });
}

export async function downloadPublicCatalogPdf() {
  const products = await loadCatalog();
  if (products.length === 0) throw new Error("No hay productos disponibles para el catálogo.");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  pdf.setProperties({
    title: "Catálogo LYNPHEA",
    subject: "Catálogo de productos LYNPHEA",
    author: "LYNPHEA",
  });

  const firstCover = getProductPhotos(products[0]!)[0];
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
  photoCache.clear();

  let missingPhotos = 0;
  for (let index = 0; index < products.length; index += 2) {
    pdf.addPage();
    drawPageHeader(pdf, Math.floor(index / 2) + 2);
    const pageProducts = products.slice(index, index + 2);
    const pagePhotos = await Promise.all(pageProducts.map(loadProductPhotos));
    pageProducts.forEach((product, productIndex) => {
      const productPhotos = pagePhotos[productIndex] ?? [];
      missingPhotos += productPhotos.filter((photo) => photo.data === null).length;
      drawProduct(pdf, product, productPhotos, productIndex === 0 ? 34 : 157);
    });
    photoCache.clear();
  }

  const date = new Date();
  const dateStamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  pdf.save(`lynphea-catalogo-${dateStamp}.pdf`);
  return { productCount: products.length, missingPhotos };
}
