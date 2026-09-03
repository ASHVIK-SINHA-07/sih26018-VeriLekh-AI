/**
 * Shared types matching the API contract in docs/02_Technical_Architecture.md.
 *
 * The contract is law: field names here must match the Prisma schema and the
 * JSON the API routes return, exactly. If the frontend expects `ownerName`,
 * the API returns `ownerName`, and Prisma stores `ownerName`.
 */

export type Role = "ADMIN" | "VERIFIER" | "VIEWER";

export type DocumentStatus =
  | "UPLOADED"
  | "PROCESSING"
  /** Extracted cleanly, awaiting a human's approval. Nothing reaches VERIFIED without one. */
  | "PENDING"
  | "VERIFIED"
  | "FLAGGED"
  | "REJECTED";

/** Statuses that put a document in the verification queue. */
export const REVIEWABLE_STATUSES: DocumentStatus[] = ["PENDING", "FLAGGED"];

/** Sentence-case labels for the UI. */
export const STATUS_LABELS: Record<DocumentStatus, string> = {
  UPLOADED: "Uploaded",
  PROCESSING: "Processing",
  PENDING: "Awaiting review",
  VERIFIED: "Verified",
  FLAGGED: "Flagged",
  REJECTED: "Rejected",
};

/** File types accepted on upload — docs/04_Frontend_Spec.md. */
export const ACCEPTED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export type ValidationStatus = "PASS" | "FLAGGED" | "DUPLICATE";

/** The nine structured fields from docs/01_PRD.md F4, plus the generated ULPIN. */
export interface ExtractedFields {
  ownerName: string | null;
  surveyNumber: string | null;
  khasraNumber: string | null;
  khataNumber: string | null;
  plotArea: string | null;
  village: string | null;
  tehsil: string | null;
  district: string | null;
  landClassification: string | null;
  ulpin: string | null;
}

/** The extractable field names — ULPIN is generated, never OCR'd, so it is excluded. */
export const EXTRACTED_FIELD_NAMES = [
  "ownerName",
  "surveyNumber",
  "khasraNumber",
  "khataNumber",
  "plotArea",
  "village",
  "tehsil",
  "district",
  "landClassification",
] as const;

export type ExtractedFieldName = (typeof EXTRACTED_FIELD_NAMES)[number];

/** Sentence-case labels for the UI. See CLAUDE.md guardrails. */
export const FIELD_LABELS: Record<ExtractedFieldName, string> = {
  ownerName: "Owner name",
  surveyNumber: "Survey number",
  khasraNumber: "Khasra number",
  khataNumber: "Khata number",
  plotArea: "Plot area",
  village: "Village",
  tehsil: "Tehsil",
  district: "District",
  landClassification: "Land classification",
};

/** Per-field confidence, 0.0–1.0. Missing key means the field was not extracted. */
export type ConfidenceMap = Partial<Record<ExtractedFieldName, number>>;

/** Below this, a field is treated as low confidence and flagged for review. */
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export interface ValidationIssue {
  field: string;
  issue: string;
}

export interface ValidationSummary {
  status: ValidationStatus;
  issues: ValidationIssue[];
  duplicateOf: string | null;
}

/* -------------------------------------------------------------------------
 * API response shapes — docs/02_Technical_Architecture.md
 * ---------------------------------------------------------------------- */

/** POST /api/documents */
export interface UploadResponse {
  documentId: string;
  status: DocumentStatus;
}

/** GET /api/documents */
export interface DocumentListItem {
  id: string;
  filename: string;
  status: DocumentStatus;
  district: string | null;
  updatedAt: string;
}

export interface DocumentListResponse {
  documents: DocumentListItem[];
}

/** GET /api/documents/[id] */
export interface DocumentDetailResponse {
  documentId: string;
  filename: string;
  filePath: string;
  status: DocumentStatus;
  extractedFields: ExtractedFields;
  confidence: ConfidenceMap;
  validation: ValidationSummary | null;
}

/** POST /api/documents/[id]/extract */
export interface ExtractResponse {
  documentId: string;
  status: DocumentStatus;
  extractedFields: ExtractedFields;
  confidence: ConfidenceMap;
  validation: ValidationSummary;
}

/** PUT /api/documents/[id]/verify */
export interface VerifyRequest {
  action: "approve" | "reject";
  editedFields?: Partial<Record<ExtractedFieldName, string>>;
}

export interface VerifyResponse {
  documentId: string;
  status: DocumentStatus;
}

/** GET /api/dashboard/stats */
export interface DashboardStats {
  totalProcessed: number;
  avgAccuracy: number;
  pendingVerification: number;
  flagged: number;
  byDistrict: { district: string; count: number }[];
  trend: { date: string; count: number }[];
}

/** GET /api/mock/ngdrs/[ulpin] */
export interface NgdrsMockResponse {
  ulpin: string;
  status: "SIMULATED";
  registrySnapshot: Record<string, unknown>;
}

/** Audit trail entry, surfaced read-only on a record (ticket T10). */
export interface AuditLogEntry {
  id: string;
  action: string;
  actorName: string;
  actorRole: Role;
  before: unknown;
  after: unknown;
  timestamp: string;
}
