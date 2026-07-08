export type BomFileKind = "supplier_quote" | "historical_bom";

export type BomFieldKey =
  | "partNumber"
  | "materialName"
  | "spec"
  | "category"
  | "unit"
  | "quantity"
  | "unitPrice"
  | "amount"
  | "remark"
  | "currency";

export type BomDataIssueType = "missing_required_field" | "amount_mismatch" | "empty_row";

export type BomDataIssue = {
  type: BomDataIssueType;
  message: string;
  expected?: number;
  actual?: number;
};

export type BomFieldMapping = Partial<Record<BomFieldKey, string>>;

export type CanonicalBomRow = {
  id: string;
  sourceFileId: string;
  sourceFileName: string;
  sheetName: string;
  rowNumber: number;
  supplierName: string;
  kind: BomFileKind;
  partNumber: string;
  materialName: string;
  normalizedName: string;
  spec: string;
  category: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  totalPrice: number;
  currency: string;
  remark: string;
  isAmountCalculated: boolean;
  dataIssues: BomDataIssue[];
  originalFields: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export type BomFileRecord = {
  id: string;
  fileName: string;
  supplierName: string;
  kind: BomFileKind;
  uploadedAt: string;
  sheetName: string;
  rowCount: number;
  fieldMapping: BomFieldMapping;
  parseWarnings: string[];
  rows: CanonicalBomRow[];
};

export type UploadBomResponse = {
  records: BomFileRecord[];
  errors: Array<{
    fileName: string;
    message: string;
  }>;
};

export type CostIssueSeverity = "high" | "medium" | "low";

export type CostIssue = {
  id: string;
  type: "price_gap" | "quantity_outlier" | "missing_item" | "incomplete_data" | "data_conflict";
  severity: CostIssueSeverity;
  title: string;
  detail: string;
  materialName: string;
  recommendedAction: string;
};

export type SupplierSummary = {
  supplierName: string;
  kind: BomFileKind;
  fileCount: number;
  itemCount: number;
  totalAmount: number;
};

export type AnalysisReport = {
  generatedAt: string;
  supplierSummaries: SupplierSummary[];
  issues: CostIssue[];
  reportMarkdown: string;
};
