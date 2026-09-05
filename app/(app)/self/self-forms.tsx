"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SELF_HYPOTHESIS_KINDS,
  WINDOW_GRADES,
  type SelfHypothesisKind,
  type WindowGrade,
} from "@/lib/domains/self-model/tiers";
import {
  createSelfHypothesis,
  createSelfPrediction,
  createSelfTrait,
  fadeSelfTrait,
  logBodyEntry,
  logEncounter,
  logResources,
  logSelfWindow,
  archiveDeclaration,
  logSleep,
  recordSelfDeclaration,
  sketchSelf,
  refuteSelfHypothesis,
  resolveSelfPrediction,
} from "./actions";

export const KIND_LABELS: Record<SelfHypothesisKind, string> = {
  trait: "特质",
  state: "状态",
  context_behavior: "情境行为",
  skill: "技能",
  preference: "偏好",
  value: "价值观",
  motivation: "动机",
};

const GRADE_LABELS: Record<WindowGrade, string> = {
  E1: "E1 回忆",
  E2: "E2 有代价",
  E3: "E3 有佐证",
  E4: "E4 系统统计",
};

function Err({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>, onDone?: () => void) => {
    setError(null);
    start(async () => {
      try {
        await fn();
        onDone?.();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "操作失败");
      }
    });
  };
  return { pending, error, run };
}

function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function NewPredictionForm({
  hypotheses,
}: {
  hypotheses: { id: string; code: string; statement: string }[];
}) {
  const [text, setText] = useState("");
  const [dueOn, setDueOn] = useState(inDays(14));
  const [confidence, setConfidence] = useState("60");
  const [hypothesisId, setHypothesisId] = useState<string>("none");
  const { pending, error, run } = useAction();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () =>
            createSelfPrediction({
              text,
              dueOn,
              confidence: Number(confidence),
              hypothesisId: hypothesisId === "none" ? null : hypothesisId,
            }),
          () => {
            setText("");
            setConfidence("60");
          }
        );
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="prediction-text">会发生什么</Label>
        <Textarea
          id="prediction-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="写成到期那天能判定真假的一句话，别写“大概会顺利”"
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="prediction-due">到期日</Label>
          <Input
            id="prediction-due"
            type="date"
            value={dueOn}
            onChange={(event) => setDueOn(event.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prediction-confidence">把握度 %</Label>
          <Input
            id="prediction-confidence"
            type="number"
            min={0}
            max={100}
            value={confidence}
            onChange={(event) => setConfidence(event.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>挂到哪条假设（可空）</Label>
        <Select value={hypothesisId} onValueChange={setHypothesisId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">不挂</SelectItem>
            {hypotheses.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.code} {item.statement.slice(0, 24)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Err message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? "记录中…" : "押下"}
      </Button>
    </form>
  );
}

export function ResolveControls({ predictionId }: { predictionId: string }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useAction();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        对账
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2">
      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="实际发生了什么（可空）"
      />
      <Err message={error} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() =>
              resolveSelfPrediction({ id: predictionId, outcome: "hit", note })
            )
          }
        >
          命中
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(() =>
              resolveSelfPrediction({ id: predictionId, outcome: "miss", note })
            )
          }
        >
          落空
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          取消
        </Button>
      </div>
    </div>
  );
}

export function NewHypothesisForm() {
  const [statement, setStatement] = useState("");
  const [kind, setKind] = useState<SelfHypothesisKind>("context_behavior");
  const { pending, error, run } = useAction();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          async () => {
            await createSelfHypothesis({ statement, kind });
          },
          () => setStatement("")
        );
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="hypothesis-statement">假设</Label>
        <Textarea
          id="hypothesis-statement"
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          placeholder="写成“在什么条件下，会怎么做”。不写条件的，多半是形容词。"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>类型</Label>
        <Select
          value={kind}
          onValueChange={(value) => setKind(value as SelfHypothesisKind)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SELF_HYPOTHESIS_KINDS.map((item) => (
              <SelectItem key={item} value={item}>
                {KIND_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          默认「情境行为」。大多数看起来像特质的东西，真身是某类条件下的行为，
          升成特质要跨 3 类情境举证。
        </p>
      </div>
      <Err message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? "建立中…" : "建立假设"}
      </Button>
    </form>
  );
}

export function WindowForm({ hypothesisId }: { hypothesisId: string }) {
  const [open, setOpen] = useState(false);
  const [situation, setSituation] = useState("");
  const [contextKey, setContextKey] = useState("");
  const [grade, setGrade] = useState<WindowGrade>("E1");
  const [costPaid, setCostPaid] = useState("");
  const [serendipity, setSerendipity] = useState(false);
  const { pending, error, run } = useAction();

  const submit = (outcome: "hit" | "miss") =>
    run(
      () =>
        logSelfWindow({
          hypothesisId,
          situation,
          contextKey,
          outcome,
          grade,
          costPaid,
          serendipity,
        }),
      () => {
        setSituation("");
        setCostPaid("");
        setOpen(false);
      }
    );

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        记一次触发窗口
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">
        符合触发条件的情境都要记，包括你没有那么做的那些 —— 那是分母。
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`situation-${hypothesisId}`}>当时的情境</Label>
        <Textarea
          id={`situation-${hypothesisId}`}
          value={situation}
          onChange={(event) => setSituation(event.target.value)}
          placeholder="白描：发生了什么、你有哪些选择"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`context-${hypothesisId}`}>情境分类</Label>
          <Input
            id={`context-${hypothesisId}`}
            value={contextKey}
            onChange={(event) => setContextKey(event.target.value)}
            placeholder="对上级 / 自选项目 / 自学"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`cost-${hypothesisId}`}>付出的代价（可空）</Label>
          <Input
            id={`cost-${hypothesisId}`}
            value={costPaid}
            onChange={(event) => setCostPaid(event.target.value)}
            placeholder="放弃了什么"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={serendipity ? "default" : "outline"}
          onClick={() => setSerendipity((value) => !value)}
        >
          {serendipity ? "✓ " : ""}捡到的意外
        </Button>
        <span className="w-full" />
        {WINDOW_GRADES.map((item) => (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={grade === item ? "default" : "outline"}
            onClick={() => setGrade(item)}
          >
            {GRADE_LABELS[item]}
          </Button>
        ))}
      </div>
      <Err message={error} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => submit("hit")}>
          行为发生了
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => submit("miss")}
        >
          符合条件但没发生
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          取消
        </Button>
      </div>
    </div>
  );
}

export function RefuteControl({ hypothesisId }: { hypothesisId: string }) {
  const [reason, setReason] = useState("");
  const { pending, error, run } = useAction();

  return (
    <div className="space-y-2">
      <Input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="是什么推翻了它"
      />
      <Err message={error} />
      <ConfirmButton
        variant="outline"
        size="sm"
        disabled={pending || !reason.trim()}
        onClick={() => run(() => refuteSelfHypothesis({ id: hypothesisId, reason }))}
      >
        推翻这条
      </ConfirmButton>
    </div>
  );
}

/**
 * 自述。这一页唯一的自由文本口。
 *
 * 它明确**不进任何计算** —— 不影响属性、不参与档位、不算进任何分母。
 * 留着它只有两个用处：
 *   1. 半年后回头看，你会发现当时以为的自己和数据里的自己不是一个人；
 *   2. AI 拆技能和提名技能时读它当处境，否则那两处只能给通用答案。
 */
export function DeclarationForm() {
  const [text, setText] = useState("");
  const { pending, error, run } = useAction();

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => recordSelfDeclaration(text), () => setText(""));
      }}
    >
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder="现在的处境、在纠结什么、想往哪走 —— 想到什么写什么"
      />
      <Err message={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || !text.trim()}>
          记下
        </Button>
        <span className="text-xs text-muted-foreground">
          它不进任何计算，只作为处境留着
        </span>
      </div>
    </form>
  );
}

/** 长自述的原文搬去材料箱，自述位只留开头一段。 */
export function ArchiveDeclarationControl({ id }: { id: string }) {
  const [tags, setTags] = useState("");
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={tags}
        onChange={(event) => setTags(event.target.value)}
        placeholder="这篇是关于什么的，空格分开"
        className="h-7 w-56 text-[12px]"
      />
      <ConfirmButton
        size="sm"
        variant="ghost"
        disabled={pending || !tags.trim()}
        onClick={() =>
          run(() => archiveDeclaration(id, tags.split(/[\s,，、]+/)))
        }
      >
        原文归档到材料箱
      </ConfirmButton>
      <Err message={error} />
    </div>
  );
}

type Sketch = { kind: string; text: string; evidence: string };

const SKETCH_LABELS: Record<string, string> = {
  behavior: "他会怎么做",
  gain: "带来了什么",
  cost: "代价",
  limit: "边界",
  gap: "空缺",
};

/**
 * 人物速写：三句话。
 *
 * 这一页有一堆清单，但没有一句描述 —— 被人问"你是个什么样的人"，
 * 从清单里搬不出一句话来。速写补的是这个。
 *
 * 它是 AI 唯一一处碰证据的地方，所以只被允许做一件事：
 * 把已经在库里的记录串成人话。每句下面挂着它引的那条原文，
 * 引不到的句子在解析器那层就被丢了。
 *
 * 第三句一定是"另一面"，但不许为了凑而编：
 * 有代价写代价，只知道边界写边界，两样都没有就明写着空缺。
 */
export function SketchControl() {
  const [lines, setLines] = useState<Sketch[] | null>(null);
  const { pending, error, run } = useAction();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(async () => {
              setLines(await sketchSelf());
            })
          }
        >
          {pending ? "写中…" : "用三句话说说我"}
        </Button>
        <span className="text-xs text-muted-foreground">
          每句都得引一条你自己写下的记录，引不到的不许出现
        </span>
      </div>
      <Err message={error} />

      {lines && lines.length === 0 && (
        <p className="text-sm text-muted-foreground">
          写不出来 —— 库里还没有足够的记录可引。
          先去点亮几个小技能，或者记几个触发窗口：
          没有记录的时候，任何一句关于你的话都是编的。
        </p>
      )}

      {lines?.map((line, index) => (
        <div
          key={line.kind}
          className="animate-self-reveal border-l-2 border-primary/40 pl-3"
          style={{ animationDelay: `${index * 120}ms` }}
        >
          <p className="text-[15px] leading-relaxed">{line.text}</p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            <span className="self-label mr-1.5">
              {SKETCH_LABELS[line.kind] ?? line.kind}
            </span>
            {line.evidence || "（没有记录可引，所以这一句只说明空缺）"}
          </p>
        </div>
      ))}
    </div>
  );
}

export function BodyLogForm() {
  const [kind, setKind] = useState<"lift" | "cardio">("lift");
  const [movement, setMovement] = useState("");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [sets, setSets] = useState("");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const { pending, error, run } = useAction();

  const num = (value: string) => (value.trim() ? Number(value) : null);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () =>
            logBodyEntry({
              kind,
              movement,
              weightKg: num(weight),
              reps: num(reps),
              sets: num(sets),
              durationMin: num(duration),
              distanceKm: num(distance),
            }),
          () => {
            setWeight("");
            setReps("");
            setSets("");
            setDuration("");
            setDistance("");
          }
        );
      }}
    >
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={kind === "lift" ? "default" : "outline"}
          onClick={() => setKind("lift")}
        >
          举铁
        </Button>
        <Button
          type="button"
          size="sm"
          variant={kind === "cardio" ? "default" : "outline"}
          onClick={() => setKind("cardio")}
        >
          有氧
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="body-movement">动作</Label>
          <Input
            id="body-movement"
            value={movement}
            onChange={(event) => setMovement(event.target.value)}
            placeholder={kind === "lift" ? "深蹲" : "跑步"}
            required
          />
        </div>

        {kind === "lift" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="body-weight">重量 kg</Label>
              <Input
                id="body-weight"
                type="number"
                step="0.5"
                min={0}
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body-reps">次数</Label>
              <Input
                id="body-reps"
                type="number"
                min={1}
                value={reps}
                onChange={(event) => setReps(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body-sets">组数</Label>
              <Input
                id="body-sets"
                type="number"
                min={1}
                value={sets}
                onChange={(event) => setSets(event.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="body-duration">时长 分钟</Label>
              <Input
                id="body-duration"
                type="number"
                min={0}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body-distance">距离 km</Label>
              <Input
                id="body-distance"
                type="number"
                step="0.1"
                min={0}
                value={distance}
                onChange={(event) => setDistance(event.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        「力」比的是同一个动作从第一次记录到现在的进步，所以同一个动作至少记两次才会出数字。
        次数超过 12 的组不参与估算 —— 那时候 1RM 推算已经不准了。
      </p>

      <Err message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? "记录中…" : "记一条"}
      </Button>
    </form>
  );
}

export function SleepForm() {
  const [hours, setHours] = useState("");
  const { pending, error, run } = useAction();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => logSleep(Number(hours)), () => setHours(""));
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="sleep-hours">昨晚睡了几小时</Label>
        <Input
          id="sleep-hours"
          type="number"
          step="0.5"
          min={0}
          max={24}
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          className="w-28"
          required
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "记录中…" : "记今天"}
      </Button>
      <Err message={error} />
    </form>
  );
}

const ENCOUNTER_LABELS = {
  exposure: "给人看了没做完的东西",
  new_face: "认识了一个新的人",
  proposal: "提了一个建议",
} as const;

export function EncounterForm() {
  const [kind, setKind] =
    useState<keyof typeof ENCOUNTER_LABELS>("exposure");
  const [counterpart, setCounterpart] = useState("");
  const [detail, setDetail] = useState("");
  const [outcome, setOutcome] = useState<"accepted" | "rejected" | "pending">(
    "pending"
  );
  const { pending, error, run } = useAction();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () => logEncounter({ kind, counterpart, detail, outcome }),
          () => {
            setCounterpart("");
            setDetail("");
          }
        );
      }}
    >
      <div className="flex flex-wrap gap-1.5">
        {(
          Object.keys(ENCOUNTER_LABELS) as (keyof typeof ENCOUNTER_LABELS)[]
        ).map((item) => (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={kind === item ? "default" : "outline"}
            onClick={() => setKind(item)}
          >
            {ENCOUNTER_LABELS[item]}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="encounter-who">对方</Label>
          <Input
            id="encounter-who"
            value={counterpart}
            onChange={(event) => setCounterpart(event.target.value)}
            placeholder="社长 / MK 负责人 / 某某"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="encounter-detail">是什么（可空）</Label>
          <Input
            id="encounter-detail"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
          />
        </div>
      </div>

      {kind === "proposal" && (
        <div className="space-y-1.5">
          <Label>结果</Label>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["accepted", "被采纳"],
                ["rejected", "被拒了"],
                ["pending", "还没下文"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={outcome === value ? "default" : "outline"}
                onClick={() => setOutcome(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            结果必须填。只记「我提了」不记「有没有被采纳」，采纳率就没有分母。
          </p>
        </div>
      )}

      <Err message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? "记录中…" : "记一次"}
      </Button>
    </form>
  );
}

export function ResourcesForm() {
  const [runway, setRunway] = useState("");
  const [allies, setAllies] = useState("");
  const [freeHours, setFreeHours] = useState("");
  const { pending, error, run } = useAction();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() =>
          logResources({
            runwayMonths: Number(runway),
            allies: Number(allies),
            weeklyFreeHours: Number(freeHours),
          })
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="res-runway">跑道 · 还能撑几个月</Label>
          <Input
            id="res-runway"
            type="number"
            step="0.5"
            min={0}
            value={runway}
            onChange={(event) => setRunway(event.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="res-allies">能开口叫的人</Label>
          <Input
            id="res-allies"
            type="number"
            min={0}
            value={allies}
            onChange={(event) => setAllies(event.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="res-hours">每周属于自己的小时</Label>
          <Input
            id="res-hours"
            type="number"
            step="0.5"
            min={0}
            value={freeHours}
            onChange={(event) => setFreeHours(event.target.value)}
            required
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        一个月填一次。旧的不会被覆盖 —— 跑道的变化曲线本身就是信息。
      </p>
      <Err message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? "记录中…" : "存一张底牌快照"}
      </Button>
    </form>
  );
}

type ModifierDraft = { sub: string; sign: "plus" | "minus"; note: string };

export function NewTraitForm({
  subs,
  hypotheses,
}: {
  subs: { key: string; label: string }[];
  hypotheses: { id: string; code: string; statement: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [spectrumKey, setSpectrumKey] = useState("");
  const [modifiers, setModifiers] = useState<ModifierDraft[]>([
    { sub: subs[0]?.key ?? "", sign: "plus", note: "" },
  ]);
  const [backfire, setBackfire] = useState("");
  const [equipNote, setEquipNote] = useState("");
  const [setKey, setSetKey] = useState("");
  const [refusedOffer, setRefusedOffer] = useState("");
  const [hypothesisId, setHypothesisId] = useState("none");
  const { pending, error, run } = useAction();

  const hasPlus = modifiers.some((item) => item.sign === "plus");
  const hasMinus = modifiers.some((item) => item.sign === "minus");
  const isDouble = hasPlus && hasMinus;

  const patch = (index: number, next: Partial<ModifierDraft>) =>
    setModifiers((current) =>
      current.map((item, i) => (i === index ? { ...item, ...next } : item))
    );

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        建一条特性
      </Button>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () =>
            createSelfTrait({
              name,
              spectrumKey,
              modifiers,
              backfire,
              equipNote,
              setKey,
              refusedOffer,
              hypothesisId: hypothesisId === "none" ? null : hypothesisId,
            }),
          () => {
            setName("");
            setSpectrumKey("");
            setBackfire("");
            setRefusedOffer("");
            setOpen(false);
          }
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="trait-name">特性名</Label>
          <Input
            id="trait-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="替对方作答 / 收尾者"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trait-spectrum">光谱</Label>
          <Input
            id="trait-spectrum"
            value={spectrumKey}
            onChange={(event) => setSpectrumKey(event.target.value)}
            placeholder="收敛 / 接触 / 更新"
            required
          />
          <p className="text-xs text-muted-foreground">
            同一根光谱同时只能持有一条 —— 稀缺来自互斥。
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>修正 · 挂到哪些子属性上</Label>
        {modifiers.map((modifier, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={modifier.sign === "plus" ? "default" : "outline"}
              onClick={() =>
                patch(index, {
                  sign: modifier.sign === "plus" ? "minus" : "plus",
                })
              }
              className="w-12"
            >
              {modifier.sign === "plus" ? "＋" : "−"}
            </Button>
            <div className="min-w-[190px] flex-1">
              <Select
                value={modifier.sub}
                onValueChange={(value) => patch(index, { sub: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subs.map((sub) => (
                    <SelectItem key={sub.key} value={sub.key}>
                      {sub.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              value={modifier.note}
              onChange={(event) => patch(index, { note: event.target.value })}
              placeholder="+40% / 4 次里 0 次"
              className="min-w-[130px] flex-1"
            />
            {modifiers.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setModifiers((current) =>
                    current.filter((_, i) => i !== index)
                  )
                }
              >
                移除
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setModifiers((current) => [
              ...current,
              { sub: subs[0]?.key ?? "", sign: "minus", note: "" },
            ])
          }
        >
          再加一条修正
        </Button>
        <p className="text-xs text-muted-foreground">
          品级是算出来的：全正是资产，全负是负债，
          <b className="text-foreground">有正有负且跨主属性就是暗金 · 双刃</b>。
        </p>
      </div>

      {isDouble && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="trait-backfire">反噬条件（双刃必填）</Label>
            <Input
              id="trait-backfire"
              value={backfire}
              onChange={(event) => setBackfire(event.target.value)}
              placeholder="在什么情况下它会转成负债"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trait-equip">装备条件</Label>
            <Input
              id="trait-equip"
              value={equipNote}
              onChange={(event) => setEquipNote(event.target.value)}
              placeholder="在什么环境里它的正号大于负号"
            />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="trait-set">套装（可空）</Label>
          <Input
            id="trait-set"
            value={setKey}
            onChange={(event) => setSetKey(event.target.value)}
            placeholder="深水区"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trait-refused">为它推掉过什么（可空）</Label>
          <Input
            id="trait-refused"
            value={refusedOffer}
            onChange={(event) => setRefusedOffer(event.target.value)}
            placeholder="传说级的唯一门槛：一次具体的拒绝"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>证据挂在哪条假设上（可空）</Label>
        <Select value={hypothesisId} onValueChange={setHypothesisId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">不挂（没有证据，品级上不去）</SelectItem>
            {hypotheses.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.code} {item.statement.slice(0, 22)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Err message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "建立中…" : "建立特性"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          取消
        </Button>
      </div>
    </form>
  );
}

export function FadeTraitControl({ traitId }: { traitId: string }) {
  const { pending, error, run } = useAction();
  return (
    <div className="space-y-1">
      <ConfirmButton
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => fadeSelfTrait(traitId))}
      >
        让它褪色
      </ConfirmButton>
      <Err message={error} />
    </div>
  );
}
