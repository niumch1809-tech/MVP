import type { BomFileRecord, CanonicalBomRow } from "@/types/bom";
import type {
  BomClassificationProfile,
  BomClassificationRule,
  ClassificationProfileApplication
} from "@/types/classification-profile";
import { isRollupCostRow, isSummaryCostRow, normalizeBomCategory } from "./normalize";

const PROFILE_VERSION = 1 as const;
const MIN_STRUCTURE_CONFIDENCE = 0.82;
const MIN_FUZZY_MATERIAL_CONFIDENCE = 0.9;
const MAX_PROFILES = 40;
const MAX_RULES_PER_PROFILE = 800;

export function learnClassificationProfiles(
  records: BomFileRecord[],
  exportedRows: CanonicalBomRow[],
  existingProfiles: BomClassificationProfile[]
): BomClassificationProfile[] {
  const exportedRowIds = new Set(exportedRows.map((row) => row.id));
  const now = new Date().toISOString();
  const profiles = existingProfiles.filter(isUsableProfile).map(cloneProfile);

  records.forEach((record) => {
    if (record.kind !== "supplier_quote") return;
    const approvedRows = record.rows.filter((row) => exportedRowIds.has(row.id) && isLearnableRow(row));
    if (approvedRows.length === 0) return;

    const structureTokens = buildStructureTokens(record);
    if (structureTokens.length === 0) return;
    const structureSignature = buildStructureSignature(structureTokens);
    const profileIndex = profiles.findIndex(
      (profile) => profile.kind === record.kind && profile.structureSignature === structureSignature
    );
    const learnedRules = approvedRows.map(buildRule).filter((rule): rule is BomClassificationRule => Boolean(rule));
    if (learnedRules.length === 0) return;

    if (profileIndex >= 0) {
      const current = profiles[profileIndex];
      profiles[profileIndex] = {
        ...current,
        name: buildProfileName(record),
        sourceFileNames: unique([record.fileName, ...current.sourceFileNames]).slice(0, 8),
        exportedAt: now,
        updatedAt: now,
        rules: mergeRules(current.rules, learnedRules, now)
      };
      return;
    }

    profiles.push({
      version: PROFILE_VERSION,
      id: `bom-classification-${hashText(structureSignature)}`,
      name: buildProfileName(record),
      kind: record.kind,
      structureSignature,
      structureTokens,
      sourceFileNames: [record.fileName],
      exportedAt: now,
      updatedAt: now,
      applicationCount: 0,
      rules: mergeRules([], learnedRules, now)
    });
  });

  return profiles
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_PROFILES);
}

export function applyClassificationProfiles(
  record: BomFileRecord,
  profiles: BomClassificationProfile[]
): ClassificationProfileApplication | null {
  if (record.kind !== "supplier_quote") return null;
  const recordTokens = buildStructureTokens(record);
  if (recordTokens.length === 0) return null;

  const candidate = profiles
    .filter((profile) => isUsableProfile(profile) && profile.kind === record.kind && profile.rules.length > 0)
    .map((profile) => ({ profile, confidence: scoreStructureMatch(recordTokens, profile) }))
    .filter((item) => item.confidence >= MIN_STRUCTURE_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence || b.profile.updatedAt.localeCompare(a.profile.updatedAt))[0];

  if (!candidate) return null;
  const { profile, confidence } = candidate;
  const partRules = new Map(profile.rules.filter((rule) => rule.partNumberKey).map((rule) => [rule.partNumberKey, rule]));
  const materialRules = new Map(profile.rules.filter((rule) => rule.materialKey).map((rule) => [rule.materialKey, rule]));
  let matchedRowCount = 0;

  const rows = record.rows.map((row) => {
    if (!isLearnableRow(row) || row.manualCategory?.trim()) return row;
    const partNumberKey = normalizeIdentity(row.partNumber);
    const materialKey = buildMaterialKey(row);
    const partRule = partNumberKey ? partRules.get(partNumberKey) : undefined;
    const materialRule = materialKey ? materialRules.get(materialKey) : undefined;
    const exactRule = partRule ?? materialRule;
    const rule = exactRule ?? findUniqueFuzzyRule(materialKey, profile.rules, confidence);
    if (!rule?.category) return row;

    matchedRowCount += 1;
    return {
      ...row,
      manualCategory: rule.category,
      manualName: rule.manualName || row.manualName,
      classificationReference: {
        profileId: profile.id,
        profileName: profile.name,
        structureConfidence: confidence,
        rule: exactRule ? "同类格式与物料名称一致" : "同类格式与物料名称高度相似"
      }
    };
  });

  if (matchedRowCount === 0) return null;
  const confidenceLabel = `${Math.round(confidence * 100)}%`;
  return {
    record: {
      ...record,
      rows,
      parseWarnings: unique([
        ...record.parseWarnings,
        `已参考此前导出的「${profile.name}」自动归类 ${matchedRowCount} 项（格式匹配 ${confidenceLabel}）。`
      ])
    },
    profileId: profile.id,
    profileName: profile.name,
    structureConfidence: confidence,
    matchedRowCount
  };
}

export function markClassificationProfileApplied(
  profiles: BomClassificationProfile[],
  profileIds: string[]
): BomClassificationProfile[] {
  if (profileIds.length === 0) return profiles;
  const appliedIds = new Set(profileIds);
  return profiles.map((profile) =>
    appliedIds.has(profile.id)
      ? { ...profile, applicationCount: (profile.applicationCount ?? 0) + 1 }
      : profile
  );
}

function buildStructureTokens(record: BomFileRecord): string[] {
  const mappingTokens = Object.entries(record.fieldMapping).flatMap(([field, header]) => {
    const normalizedHeader = normalizeStructureToken(header ?? "");
    return normalizedHeader ? [`field:${field}`, `map:${field}:${normalizedHeader}`] : [`field:${field}`];
  });
  const originalColumnTokens = record.rows
    .slice(0, 40)
    .flatMap((row) => Object.keys(row.originalFields ?? {}))
    .map((column) => normalizeStructureToken(column))
    .filter(Boolean)
    .map((column) => `column:${column}`);
  return unique([...mappingTokens, ...originalColumnTokens]).sort();
}

function scoreStructureMatch(tokens: string[], profile: BomClassificationProfile): number {
  const signature = buildStructureSignature(tokens);
  if (signature === profile.structureSignature) return 1;
  const current = new Set(tokens);
  const saved = new Set(profile.structureTokens);
  const intersection = [...current].filter((token) => saved.has(token)).length;
  const union = new Set([...current, ...saved]).size;
  if (intersection < 3 || union === 0) return 0;
  return intersection / union;
}

function buildRule(row: CanonicalBomRow): BomClassificationRule | null {
  const category = row.manualCategory?.trim() || normalizeBomCategory(row.category, row.materialName);
  const materialKey = buildMaterialKey(row);
  const partNumberKey = normalizeIdentity(row.partNumber);
  if (!category || (!materialKey && !partNumberKey)) return null;
  const now = new Date().toISOString();
  return {
    materialKey,
    partNumberKey,
    sourceMaterialName: row.materialName.trim(),
    category,
    manualName: row.manualName?.trim() ?? "",
    approvedCount: 1,
    updatedAt: now
  };
}

function mergeRules(
  currentRules: BomClassificationRule[],
  learnedRules: BomClassificationRule[],
  updatedAt: string
): BomClassificationRule[] {
  const ruleMap = new Map<string, BomClassificationRule>();
  currentRules.forEach((rule) => ruleMap.set(buildRuleIdentity(rule), { ...rule }));
  learnedRules.forEach((rule) => {
    const identity = buildRuleIdentity(rule);
    const current = ruleMap.get(identity);
    ruleMap.set(identity, {
      ...rule,
      approvedCount: (current?.approvedCount ?? 0) + 1,
      updatedAt
    });
  });
  return [...ruleMap.values()]
    .sort((a, b) => b.approvedCount - a.approvedCount || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_RULES_PER_PROFILE);
}

function findUniqueFuzzyRule(
  materialKey: string,
  rules: BomClassificationRule[],
  structureConfidence: number
): BomClassificationRule | undefined {
  if (!materialKey || materialKey.length < 3 || structureConfidence < 0.94) return undefined;
  const ranked = rules
    .filter((rule) => rule.materialKey.length >= 3)
    .map((rule) => ({ rule, score: diceSimilarity(materialKey, rule.materialKey) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < MIN_FUZZY_MATERIAL_CONFIDENCE) return undefined;
  if (second && best.score - second.score < 0.08 && second.rule.category !== best.rule.category) return undefined;
  return best.rule;
}

function isLearnableRow(row: CanonicalBomRow): boolean {
  return Boolean(row.materialName.trim()) && !isSummaryCostRow(row) && !isRollupCostRow(row.materialName, row.category);
}

function buildMaterialKey(row: CanonicalBomRow): string {
  const normalizedBase = (row.normalizedName || "").split("|")[0] ?? "";
  return normalizeIdentity(normalizedBase || row.materialName);
}

function buildRuleIdentity(rule: BomClassificationRule): string {
  return rule.partNumberKey ? `part:${rule.partNumberKey}` : `material:${rule.materialKey}`;
}

function buildProfileName(record: BomFileRecord): string {
  const fileName = record.fileName.replace(/\.(xlsx|xls|csv)$/i, "").trim();
  return fileName || record.sheetName || "已导出 BOM";
}

function buildStructureSignature(tokens: string[]): string {
  return tokens.join("|");
}

function normalizeStructureToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{Script=Han}a-z0-9/_-]+/giu, "")
    .slice(0, 80);
}

function normalizeIdentity(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9/]+/giu, "")
    .slice(0, 96);
}

function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  const rightCounts = new Map<string, number>();
  rightPairs.forEach((pair) => rightCounts.set(pair, (rightCounts.get(pair) ?? 0) + 1));
  let overlap = 0;
  leftPairs.forEach((pair) => {
    const count = rightCounts.get(pair) ?? 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(pair, count - 1);
    }
  });
  return (2 * overlap) / (leftPairs.length + rightPairs.length);
}

function bigrams(value: string): string[] {
  return Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2));
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isUsableProfile(profile: BomClassificationProfile): boolean {
  return profile?.version === PROFILE_VERSION && Array.isArray(profile.structureTokens) && Array.isArray(profile.rules);
}

function cloneProfile(profile: BomClassificationProfile): BomClassificationProfile {
  return {
    ...profile,
    structureTokens: [...profile.structureTokens],
    sourceFileNames: [...profile.sourceFileNames],
    rules: profile.rules.map((rule) => ({ ...rule }))
  };
}
