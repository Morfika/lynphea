const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const wb = XLSX.readFile(path.join(__dirname, "../public/Catalogo_Trendy_17_Julio_2026.xlsx"));
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

// Skip header row
const rows = data.slice(1).filter((row) => row[2] && row[3]);

const skuCounts = {};
const items = rows.map((row) => {
  const pagina = Number(row[0]) || 0;
  const categoria = String(row[1] || "").trim();
  const nombre = String(row[2] || "").trim();
  const skuRaw = String(row[3] || "").trim();
  const costo = Number(row[4]) || 0;
  const precioSugerido = Number(row[5]) || 0;

  skuCounts[skuRaw] = (skuCounts[skuRaw] || 0) + 1;
  const suffix = skuCounts[skuRaw] > 1 ? `_${skuCounts[skuRaw]}` : "";
  const id = "trendy_" + skuRaw.toLowerCase().replace(/[^a-z0-9]/g, "_") + suffix;
  const sku = skuRaw + (skuCounts[skuRaw] > 1 ? `-${skuCounts[skuRaw]}` : "");

  return {
    id,
    skuOriginal: skuRaw,
    sku: "LYN-DAY-" + sku,
    nombre,
    descripcion: nombre,
    categoria,
    pagina,
    costo,
    precioSugerido,
    linea: "LYNPHEA DAILY",
    proveedor: "TRENDY",
  };
});

const header = `// Catálogo Oficial Mayorista Trendy
// Total productos: ${items.length}
// Fecha catálogo: Julio 17, 2026

export interface TrendyProductItem {
  id: string;
  skuOriginal: string;
  sku: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  pagina: number;
  costo: number;
  precioSugerido: number;
  linea: "LYNPHEA DAILY";
  proveedor: "TRENDY";
}

export const CATALOGO_TRENDY: TrendyProductItem[] = `;

const output = header + JSON.stringify(items, null, 2) + ";\n";
const outPath = path.join(__dirname, "../src/data/catalogoTrendy.ts");
fs.writeFileSync(outPath, output, "utf-8");
console.log(`Written ${items.length} items to ${outPath}`);
