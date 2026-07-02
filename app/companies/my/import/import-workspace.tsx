"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createBusinessPlanImport,
  markBusinessPlanUploadComplete,
  resolveSupplierAliases,
} from "../actions";
import { validateWorkbookFile } from "../excel-domain";
import type { WorkbookParseResult } from "../types";
import {
  buildConfirmedRedactions,
  normalizeManualSupplierNames,
  prepareWorkbookChunks,
  safeStoredWorkbookName,
} from "./prepare-import";

const SUPPLIER_BUCKET = "internal-business-plans";

type FileMetadata = {
  name: string;
  size: number;
};

type WorkerResponse =
  | { type: "parsed"; result: WorkbookParseResult }
  | { type: "error"; code: string; message: string };

type Phase =
  | "idle"
  | "parsing"
  | "review"
  | "preparing"
  | "uploading"
  | "done";

const CANDIDATE_LABELS = {
  supplier: "供应商",
  email: "邮箱",
  phone: "电话",
  bank_account: "银行账户",
  corporate_number: "法人编号",
  person: "姓名",
} as const;

export function ImportWorkspace({
  profileId,
  companyName,
}: {
  profileId: string;
  companyName: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<FileMetadata | null>(null);
  const [parsed, setParsed] = useState<WorkbookParseResult | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [manualSuppliers, setManualSuppliers] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [completedVersion, setCompletedVersion] = useState<number | null>(null);

  function clearLocalWorkbook() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setParsed(null);
    setFile(null);
    setReviewed(false);
    setManualSuppliers("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function parseFile(selected: File) {
    setError("");
    setCompletedVersion(null);
    try {
      validateWorkbookFile(selected);
      setPhase("parsing");
      setFile({ name: selected.name, size: selected.size });
      const buffer = await selected.arrayBuffer();
      const worker = new Worker(new URL("../excel-worker.ts", import.meta.url));
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        worker.terminate();
        workerRef.current = null;
        if (event.data.type === "error") {
          setError(event.data.message);
          setPhase("idle");
          setFile(null);
          if (inputRef.current) inputRef.current.value = "";
          return;
        }
        setParsed(event.data.result);
        setPhase("review");
      };
      worker.onerror = () => {
        worker.terminate();
        workerRef.current = null;
        setError("浏览器本地解析失败，请确认文件未损坏");
        setPhase("idle");
      };
      worker.postMessage(
        {
          type: "parse",
          fileName: selected.name,
          fileSize: selected.size,
          buffer,
        },
        [buffer]
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Excel 解析失败");
      setPhase("idle");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function uploadRedactedWorkbook() {
    if (!parsed || !file || !reviewed) return;
    setError("");
    try {
      setPhase("preparing");
      const supplierNames = Array.from(
        new Set(
          [
            ...parsed.candidates
              .filter((candidate) => candidate.type === "supplier")
              .map((candidate) => candidate.text),
            ...normalizeManualSupplierNames(manualSuppliers),
          ]
        )
      );
      const supplierAliases = await resolveSupplierAliases(supplierNames);
      const replacements = buildConfirmedRedactions(
        parsed.candidates,
        supplierAliases
      );
      for (const name of normalizeManualSupplierNames(manualSuppliers)) {
        replacements.set(name, supplierAliases[name]);
      }
      const chunks = await prepareWorkbookChunks(parsed.sheets, replacements);
      const created = await createBusinessPlanImport({
        profile_id: profileId,
        file_name: safeStoredWorkbookName(file.name),
        file_size: file.size,
        workbook_hash: parsed.workbook_hash,
        visible_sheet_count: parsed.sheets.length,
        chunks: chunks.map((chunk) => ({
          sheet_name: chunk.sheet_name,
          cell_range: chunk.cell_range,
          ordinal: chunk.ordinal,
          content_hash: chunk.content_hash,
          row_count: chunk.row_count,
          column_count: chunk.column_count,
          compressed_size: chunk.compressed_size,
        })),
      });

      if (created.uploads.length === 0) {
        setCompletedVersion(created.versionNo);
        clearLocalWorkbook();
        setPhase("done");
        router.refresh();
        return;
      }
      if (created.uploads.length !== chunks.length) {
        throw new Error("服务器返回的分块凭证不完整");
      }

      setPhase("uploading");
      setProgress({ current: 0, total: chunks.length });
      const supabase = createClient();
      const uploadedIds: string[] = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const upload = created.uploads[index];
        const chunk = chunks[index];
        const uploadBytes = new Uint8Array(chunk.compressed_data.byteLength);
        uploadBytes.set(chunk.compressed_data);
        const { error: uploadError } = await supabase.storage
          .from(SUPPLIER_BUCKET)
          .uploadToSignedUrl(
            upload.path,
            upload.token,
            new Blob([uploadBytes.buffer], {
              type: "application/gzip",
            }),
            { contentType: "application/gzip" }
          );
        if (uploadError) throw new Error(`第 ${index + 1} 个分块上传失败`);
        uploadedIds.push(upload.chunkId);
        setProgress({ current: index + 1, total: chunks.length });
      }
      await markBusinessPlanUploadComplete(created.importId, uploadedIds);
      setCompletedVersion(created.versionNo);
      clearLocalWorkbook();
      setPhase("done");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入失败，请重试");
      setPhase(parsed ? "review" : "idle");
    }
  }

  const busy = ["parsing", "preparing", "uploading"].includes(phase);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href="/companies/my"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        我的公司
      </Link>

      <h1 className="text-xl font-semibold tracking-tight">导入经营计划</h1>
      <p className="mt-1 text-sm text-muted-foreground">{companyName}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          ["1", "本地读取", "原始 Excel 不离开浏览器"],
          ["2", "确认脱敏", "供应商和直接身份信息被替换"],
          ["3", "私有上传", "只保存脱敏后的 gzip 分块"],
        ].map(([number, title, text]) => (
          <div key={number} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{number}</p>
            <p className="mt-1 text-sm font-medium">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          <h2 className="font-medium">选择 .xlsx</h2>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) void parseFile(selected);
          }}
          className="mt-4 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          最大 10 MB；只分析可见工作表。隐藏表、宏、外部链接和无缓存结果的公式会被拒绝。
        </p>
      </section>

      {phase === "parsing" ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border p-4 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在浏览器本地解析，尚未上传任何内容…
        </div>
      ) : null}

      {parsed && file ? (
        <section className="mt-6 rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-medium">确认本地解析结果</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {file.name} · {parsed.sheets.length} 个可见工作表
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 text-emerald-700" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {parsed.sheets.map((sheet) => (
              <span
                key={sheet.name}
                className="rounded-full border px-2.5 py-1 text-xs"
              >
                {sheet.name} · {sheet.rows.length} 行
              </span>
            ))}
          </div>

          <div className="mt-5 rounded-lg bg-muted/50 p-4">
            <p className="text-sm font-medium">
              将脱敏 {parsed.candidates.length} 个候选内容
            </p>
            {parsed.candidates.length > 0 ? (
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs">
                {parsed.candidates.map((candidate) => (
                  <li
                    key={candidate.id}
                    className="flex items-start justify-between gap-4"
                  >
                    <span className="min-w-0 break-all">{candidate.text}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {CANDIDATE_LABELS[candidate.type]} · {candidate.sheet_name}{" "}
                      {candidate.cell_address}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-amber-800">
                未自动发现候选信息。自动检测不能保证识别所有商业机密，请确认工作簿本身适合进入 AI 分析。
              </p>
            )}
          </div>

          <div className="mt-4">
            <label
              htmlFor="manual-suppliers"
              className="text-sm font-medium"
            >
              补充需要隐藏的供应商名称
            </label>
            <textarea
              id="manual-suppliers"
              value={manualSuppliers}
              disabled={busy}
              onChange={(event) => setManualSuppliers(event.target.value)}
              rows={3}
              placeholder={"每行一个名称\n用于补充自动检测可能遗漏的供应商"}
              className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              名称只会短暂发送到服务端生成不可逆 HMAC 和稳定别名，不会保存明文。
            </p>
          </div>

          <label className="mt-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy}
              onChange={(event) => setReviewed(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              我已检查可见工作表和脱敏候选，同意只上传脱敏后的结构化分块。
            </span>
          </label>

          <button
            type="button"
            disabled={!reviewed || busy}
            onClick={() => void uploadRedactedWorkbook()}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {phase === "preparing" || phase === "uploading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LockKeyhole className="h-4 w-4" />
            )}
            {phase === "preparing"
              ? "正在脱敏并分块…"
              : phase === "uploading"
                ? `私有上传 ${progress.current}/${progress.total}`
                : "确认并私有上传"}
          </button>
        </section>
      ) : null}

      {phase === "done" ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            v{completedVersion} 的脱敏分块已保存
          </div>
          <p className="mt-2 text-sm">
            原始 Excel 已从页面状态清除。下一阶段会对这些私有分块进行逐块 AI 提取。
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}。原始 Excel 未上传；你可以重新确认后重试。
        </p>
      ) : null}
    </main>
  );
}
