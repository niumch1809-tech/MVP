import { CostComparison, MaterialComparisonItem } from "./cost-comparison";

type CellValue = string | number;

type SheetCell = {
  value: CellValue;
  style?: number;
};

type MergeRange = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

const SUMMARY_LABELS = ["材料成本合计", "人工/管理/利润合计", "核验总成本/出厂价"];
const STYLE = {
  default: 0,
  yellowText: 1,
  redText: 2,
  money: 3,
  percent: 4,
  yellowMoney: 5,
  redMoney: 6,
  yellowPercent: 7,
  redPercent: 8
} as const;

export function buildTemplateOutputArray(comparison: CostComparison): ArrayBuffer {
  const suppliers = comparison.activeSuppliers.slice(0, 2);
  const supplierA = suppliers[0] || "供应商1";
  const supplierB = suppliers[1] || "供应商2";
  const rows: SheetCell[][] = [
    [cell(buildTitle(comparison, supplierA, supplierB)), empty(), empty(), empty(), empty(), empty(), empty(), empty(), empty()],
    ["品类", "物料", supplierA, supplierB, "差价", "差价%", supplierA, supplierB, "品类差异 金额/%"].map((value) => cell(value))
  ];
  const merges: MergeRange[] = [merge(1, 1, 1, 9)];

  comparison.categories.forEach((category) => {
    const items = comparison.materialComparisons.filter((item) => item.category === category);
    if (items.length === 0) return;

    const startRow = rows.length + 1;
    const categoryA = getCategoryAmount(comparison, category, supplierA, items);
    const categoryB = getCategoryAmount(comparison, category, supplierB, items);
    const categoryDiff = categoryB - categoryA;
    const categoryDiffRate = categoryA > 0 ? categoryDiff / categoryA : Number.NaN;
    const categoryRiskStyle = getTextRiskStyle(categoryDiff);

    items.forEach((item, index) => {
      const amountA = getMaterialAmount(item, supplierA);
      const amountB = getMaterialAmount(item, supplierB);
      const hasAmountA = hasSupplierAmount(item, supplierA);
      const hasAmountB = hasSupplierAmount(item, supplierB);
      const canCompareMaterial = hasAmountA && hasAmountB;
      const diff = amountB - amountA;
      const diffRate = amountA > 0 ? diff / amountA : Number.NaN;
      const amountRiskStyle = getMoneyRiskStyle(diff);
      const percentRiskStyle = getPercentRiskStyle(diff);

      rows.push([
        cell(index === 0 ? category : ""),
        cell(item.materialName),
        hasAmountA ? cell(amountA, STYLE.money) : empty(),
        hasAmountB ? cell(amountB, STYLE.money) : empty(),
        canCompareMaterial ? cell(diff, amountRiskStyle) : empty(),
        canCompareMaterial && Number.isFinite(diffRate) ? cell(diffRate, percentRiskStyle) : empty(),
        index === 0 && categoryA > 0 ? cell(categoryA, STYLE.money) : empty(),
        index === 0 && categoryB > 0 ? cell(categoryB, STYLE.money) : empty(),
        index === 0 ? cell(formatDiffWithRate(categoryDiff, categoryDiffRate), categoryRiskStyle) : empty()
      ]);
    });

    const endRow = rows.length;
    if (endRow > startRow) {
      merges.push(merge(startRow, 1, endRow, 1));
      merges.push(merge(startRow, 7, endRow, 7));
      merges.push(merge(startRow, 8, endRow, 8));
      merges.push(merge(startRow, 9, endRow, 9));
    }
  });

  buildSummaryRows(comparison, supplierA, supplierB).forEach((summary) => {
    const rowNumber = rows.length + 1;
    const diff = summary.amountB - summary.amountA;
    rows.push([
      cell(summary.label),
      empty(),
      empty(),
      empty(),
      empty(),
      empty(),
      summary.amountA > 0 ? cell(summary.amountA, STYLE.money) : empty(),
      summary.amountB > 0 ? cell(summary.amountB, STYLE.money) : empty(),
      cell(formatDiffWithRate(diff, summary.diffRate), getTextRiskStyle(diff))
    ]);
    merges.push(merge(rowNumber, 1, rowNumber, 6));
  });

  return createXlsx(rows, merges);
}

function buildTitle(comparison: CostComparison, supplierA: string, supplierB: string): string {
  const product = comparison.products.length === 1 ? comparison.products[0] : "多产品";
  return `${product} BOM成本核验输出（${supplierA} vs ${supplierB}）`;
}

function buildSummaryRows(comparison: CostComparison, supplierA: string, supplierB: string) {
  const materialA = comparison.totals.materialTotals[supplierA] ?? 0;
  const materialB = comparison.totals.materialTotals[supplierB] ?? 0;
  const overheadA = comparison.totals.derivedOverheadTotals[supplierA] ?? 0;
  const overheadB = comparison.totals.derivedOverheadTotals[supplierB] ?? 0;
  const factoryA = comparison.totals.factoryPriceTotals[supplierA] || materialA + overheadA;
  const factoryB = comparison.totals.factoryPriceTotals[supplierB] || materialB + overheadB;

  return [
    buildSummaryRow(SUMMARY_LABELS[0], materialA, materialB),
    buildSummaryRow(SUMMARY_LABELS[1], overheadA, overheadB),
    buildSummaryRow(SUMMARY_LABELS[2], factoryA, factoryB)
  ];
}

function buildSummaryRow(label: string, amountA: number, amountB: number) {
  const diff = amountB - amountA;
  return {
    label,
    amountA,
    amountB,
    diffRate: amountA > 0 ? diff / amountA : Number.NaN
  };
}

function getCategoryAmount(
  comparison: CostComparison,
  category: string,
  supplier: string,
  items: MaterialComparisonItem[]
): number {
  const categoryRow = comparison.categoryComparison.find((row) => row.category === category);
  const fromCategory = Number(categoryRow?.[supplier] ?? 0);
  if (fromCategory > 0) return fromCategory;
  return items.reduce((sum, item) => sum + getMaterialAmount(item, supplier), 0);
}

function getMaterialAmount(item: MaterialComparisonItem, supplier: string): number {
  return item.suppliers.find((point) => point.supplierName === supplier)?.amount ?? 0;
}

function hasSupplierAmount(item: MaterialComparisonItem, supplier: string): boolean {
  return item.suppliers.some((point) => point.supplierName === supplier);
}

function getRiskLevel(diff: number): "none" | "yellow" | "red" {
  const amount = Math.abs(diff);
  if (amount <= 0.5) return "none";
  if (amount <= 2) return "yellow";
  return "red";
}

function getTextRiskStyle(diff: number): number {
  const risk = getRiskLevel(diff);
  if (risk === "yellow") return STYLE.yellowText;
  if (risk === "red") return STYLE.redText;
  return STYLE.default;
}

function getMoneyRiskStyle(diff: number): number {
  const risk = getRiskLevel(diff);
  if (risk === "yellow") return STYLE.yellowMoney;
  if (risk === "red") return STYLE.redMoney;
  return STYLE.money;
}

function getPercentRiskStyle(diff: number): number {
  const risk = getRiskLevel(diff);
  if (risk === "yellow") return STYLE.yellowPercent;
  if (risk === "red") return STYLE.redPercent;
  return STYLE.percent;
}

function formatDiffWithRate(diff: number, rate: number): string {
  const diffText = Number.isFinite(diff) ? formatMoney(diff) : "-";
  const rateText = Number.isFinite(rate) ? formatPercent(rate) : "-";
  return `${diffText} / ${rateText}`;
}

function formatMoney(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function cell(value: CellValue, style: number = STYLE.default): SheetCell {
  return { value, style };
}

function empty(): SheetCell {
  return { value: "" };
}

function merge(startRow: number, startCol: number, endRow: number, endCol: number): MergeRange {
  return { startRow, startCol, endRow, endCol };
}

function createXlsx(rows: SheetCell[][], merges: MergeRange[]): ArrayBuffer {
  const files = [
    { path: "[Content_Types].xml", content: contentTypesXml() },
    { path: "_rels/.rels", content: rootRelsXml() },
    { path: "docProps/app.xml", content: appXml() },
    { path: "docProps/core.xml", content: coreXml() },
    { path: "xl/workbook.xml", content: workbookXml() },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRelsXml() },
    { path: "xl/styles.xml", content: stylesXml() },
    { path: "xl/worksheets/sheet1.xml", content: sheetXml(rows, merges) }
  ];
  return zipStore(files.map((file) => ({ name: file.path, bytes: encodeUtf8(file.content) })));
}

function sheetXml(rows: SheetCell[][], merges: MergeRange[]): string {
  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((item, colIndex) => {
          const ref = cellRef(rowIndex + 1, colIndex + 1);
          const style = item.style ? ` s="${item.style}"` : "";
          if (typeof item.value === "number") {
            return `<c r="${ref}"${style}><v>${item.value}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(item.value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((item) => `<mergeCell ref="${rangeRef(item)}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:I${rows.length}"/>
  <cols>
    <col min="1" max="1" width="16" customWidth="1"/>
    <col min="2" max="2" width="28" customWidth="1"/>
    <col min="3" max="8" width="14" customWidth="1"/>
    <col min="9" max="9" width="20" customWidth="1"/>
  </cols>
  <sheetData>${rowXml}</sheetData>
  ${mergeXml}
</worksheet>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="#,##0.00"/>
    <numFmt numFmtId="165" formatCode="0.00%"/>
  </numFmts>
  <fonts count="3">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><sz val="11"/><color rgb="FFD97706"/><name val="Calibri"/><family val="2"/></font>
    <font><sz val="11"/><color rgb="FFDC2626"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
    <xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
    <xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
    <xf numFmtId="165" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function workbookXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="输出" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function workbookRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function appXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>AI Cost Audit MVP</Application>
</Properties>`;
}

function coreXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>AI Cost Audit MVP</dc:creator>
  <cp:lastModifiedBy>AI Cost Audit MVP</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`;
}

function cellRef(row: number, col: number): string {
  return `${columnName(col)}${row}`;
}

function rangeRef(item: MergeRange): string {
  return `${cellRef(item.startRow, item.startCol)}:${cellRef(item.endRow, item.endCol)}`;
}

function columnName(col: number): string {
  let name = "";
  let current = col;
  while (current > 0) {
    current -= 1;
    name = String.fromCharCode(65 + (current % 26)) + name;
    current = Math.floor(current / 26);
  }
  return name;
}

function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

type ZipFile = {
  name: string;
  bytes: Uint8Array;
};

function zipStore(files: ZipFile[]): ArrayBuffer {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encodeUtf8(file.name);
    const crc = crc32(file.bytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    writeLocalHeader(localView, nameBytes.length, crc, file.bytes.length);
    local.set(nameBytes, 30);
    localParts.push(local, file.bytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    writeCentralHeader(centralView, nameBytes.length, crc, file.bytes.length, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + file.bytes.length;
  });

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);

  const output = concatBytes([...localParts, ...centralParts, end]);
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
}

function writeLocalHeader(view: DataView, nameLength: number, crc: number, size: number) {
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameLength, true);
}

function writeCentralHeader(view: DataView, nameLength: number, crc: number, size: number, offset: number) {
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameLength, true);
  view.setUint32(42, offset, true);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  crcTable = table;
  return table;
}
