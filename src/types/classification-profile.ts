import type { BomFileKind, BomFileRecord } from "./bom";

export type BomClassificationRule = {
  materialKey: string;
  partNumberKey: string;
  sourceMaterialName: string;
  category: string;
  manualName: string;
  approvedCount: number;
  updatedAt: string;
};

export type BomClassificationProfile = {
  version: 1;
  id: string;
  name: string;
  kind: BomFileKind;
  structureSignature: string;
  structureTokens: string[];
  sourceFileNames: string[];
  exportedAt: string;
  updatedAt: string;
  applicationCount: number;
  rules: BomClassificationRule[];
};

export type ClassificationProfileApplication = {
  record: BomFileRecord;
  profileId: string;
  profileName: string;
  structureConfidence: number;
  matchedRowCount: number;
};
