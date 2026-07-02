export type WorksheetState = "visible" | "hidden" | "veryHidden";

export type NormalizedCell = {
  address: string;
  row: number;
  column: number;
  type: "string" | "number" | "boolean" | "date" | "formula" | "error";
  value: string;
  formula?: string;
  result?: string;
};

export type NormalizedRow = {
  index: number;
  cells: NormalizedCell[];
};

export type NormalizedSheet = {
  name: string;
  state: WorksheetState;
  rows: NormalizedRow[];
};

export type SensitiveCandidateType =
  | "supplier"
  | "email"
  | "phone"
  | "bank_account"
  | "corporate_number"
  | "person";

export type SensitiveCandidate = {
  id: string;
  type: SensitiveCandidateType;
  text: string;
  sheet_name: string;
  cell_address: string;
};

export type WorkbookChunk = {
  sheet_name: string;
  cell_range: string;
  ordinal: number;
  rows: NormalizedRow[];
  row_count: number;
  column_count: number;
  content_hash: string;
  compressed_size: number;
  compressed_data: Uint8Array;
};

export type WorkbookParseResult = {
  workbook_hash: string;
  sheets: NormalizedSheet[];
  candidates: SensitiveCandidate[];
};

export type BusinessPlanChunkManifest = Omit<
  WorkbookChunk,
  "rows" | "compressed_data"
>;
