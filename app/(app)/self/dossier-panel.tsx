"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Err, useAction } from "./self-forms";
import { nameDossierNow } from "./actions";
import {
  MIN_LABEL_EVIDENCE,
  confrontations,
  flipSide,
  type Confrontation,
  type FlipSide,
  type Dossier,
  type DossierEvidence,
  type DossierLabel,
} from "@/lib/domains/self-model/dossier";

type Side = "kept" | "unkept" | "divides";

const TABS: { key: Side; label: string; hint: string }[] = [
  {
    key: "kept",
    label: "兑现了",
    hint: "说过会怎样，后来真是那样的那些事。",
  },
  {
    key: "unkept",
    label: "欠着",
    hint: "同样是你说过的话，后来没对上。这一栏不找补。",
  },
  {
    key: "divides",
    label: "看情况",
    hint: "同一件事，两边都有话说。那就得讲清楚什么时候是哪一句。",
  },
];

function EvidenceRow({ item }: { item: DossierEvidence }) {
  return (
    <div className="self-row flex flex-wrap items-baseline gap-x-2 py-1.5 text-[13px]">
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {item.occurredOn || "—"}
      </span>
      <span>{item.claim}</span>
      {item.context && (
        <span className="text-muted-foreground">· {item.context}</span>
      )}
    </div>
  );
}

/**
 * 推翻条件画成能啃的进度。
 *
 * 「再有 2 次就翻过来」本来是句死话。标出还差几格，它就成了一件有终点的事 ——
 * 而够到终点的唯一办法是去做真事，不是在这页上点什么。
 */
function Countdown({ label }: { label: DossierLabel }) {
  if (label.strength === "lead") return null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
      <span className="self-label shrink-0">怎么改</span>
      <span>{label.falsifier}</span>
      <span
        className="shrink-0 font-mono text-[11px]"
        aria-label={`还差 ${label.flipsAfter} 次`}
      >
        {"○".repeat(Math.min(label.flipsAfter, 8))}
        {label.flipsAfter > 8 && ` +${label.flipsAfter - 8}`}
      </span>
    </p>
  );
}

/**
 * 背面。反复想的是「那一刻」，不是「我这个人」。
 * 三行全是代码从已有记录拼的，没有一句是 AI 的评价。
 */
function BackSide({ back, onFlip }: { back: FlipSide; onFlip: () => void }) {
  return (
    <div className="self-panel">
      <div className="self-panel__head">
        <span className="self-label">背面</span>
        <span className="text-sm font-medium">更好的我，等于这条翻过来的样子</span>
        <span
          className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground"
          aria-label={`还差 ${back.remaining} 次`}
        >
          {"○".repeat(Math.min(back.remaining, 8))}
          {back.remaining > 8 && ` +${back.remaining - 8}`}
        </span>
      </div>
      <div className="self-panel__body space-y-2">
        <p className="text-[15px] leading-relaxed">{back.proven}</p>
        <p className="text-[15px] leading-relaxed">{back.trigger}</p>
        <p className="border-l-2 border-primary/40 pl-3 text-[15px] font-medium leading-relaxed">
          {back.action}
        </p>
        <p className="text-xs text-muted-foreground">
          每周读一遍的是上面那个下午，不是「我是什么样的人」。它不动，圈就不动。
        </p>
        <Button variant="ghost" size="sm" onClick={onFlip}>
          翻回正面
        </Button>
      </div>
    </div>
  );
}

function LabelCard({
  label,
  back,
  alsoOtherSide,
  onJump,
}: {
  label: DossierLabel;
  back?: FlipSide | null;
  alsoOtherSide?: boolean;
  onJump?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const isLead = label.strength === "lead";

  if (flipped && back) {
    return <BackSide back={back} onFlip={() => setFlipped(false)} />;
  }

  return (
    <div className="self-panel">
      <div className="self-panel__head">
        <span className="self-label">{isLead ? "苗头" : "标签"}</span>
        <span className="text-sm font-medium">
          {label.name ?? label.subject}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
          {label.evidence.length} 次
        </span>
      </div>
      <div className="self-panel__body space-y-2">
        {label.scene && (
          <p className="border-l-2 border-primary/40 pl-3 text-[15px] leading-relaxed">
            {label.scene}
          </p>
        )}
        {!label.name && !isLead && (
          <p className="text-sm text-muted-foreground">
            还没起名字。点上面那个按钮，让它把这几件事翻成一句人话。
          </p>
        )}
        {isLead && (
          <p className="text-sm text-muted-foreground">{label.falsifier}</p>
        )}

        <Countdown label={label} />

        {alsoOtherSide && (
          <p className="text-sm text-muted-foreground">
            同一件事，另一边也有话说。
            {onJump && (
              <Button variant="link" size="sm" onClick={onJump}>
                摆到一起看
              </Button>
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "收起" : `凭什么这么说（${label.evidence.length} 条）`}
          </Button>
          {back && !isLead && (
            <Button variant="outline" size="sm" onClick={() => setFlipped(true)}>
              翻过来看
            </Button>
          )}
        </div>
        {open && (
          <div>
            {label.evidence.map((item) => (
              <EvidenceRow key={item.key} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 对质。两句都为真，所以你得知道什么时候是哪一句。
 * 这是三份档案唯一的爽点，之前被 tab 切没了。
 */
function ConfrontationBlock({
  item,
  dossier,
}: {
  item: Confrontation;
  dossier: Dossier;
}) {
  return (
    <div className="space-y-3">
      <div className="self-plate self-corners p-4">
        <p className="self-label mb-1">分界线</p>
        <p className="text-[15px] leading-relaxed">
          {item.divide.condition ?? item.subject}
        </p>
        {item.divide.condition && (
          <p className="mt-1 text-sm text-muted-foreground">{item.subject}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {item.divide.keptContexts.length > 0 && (
            <>做到时：{item.divide.keptContexts.join(" / ")}　</>
          )}
          {item.divide.unkeptContexts.length > 0 && (
            <>没做到：{item.divide.unkeptContexts.join(" / ")}</>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {item.kept ? (
          <LabelCard label={item.kept} />
        ) : (
          <div className="self-panel">
            <div className="self-panel__body text-sm text-muted-foreground">
              这一侧还没攒够能说的。
            </div>
          </div>
        )}
        {item.unkept ? (
          <LabelCard label={item.unkept} back={flipSide(item.unkept, dossier)} />
        ) : (
          <div className="self-panel">
            <div className="self-panel__body text-sm text-muted-foreground">
              这一侧还没攒够能说的。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="self-panel">
      <div className="self-panel__body space-y-2">
        <p className="text-[15px] leading-relaxed">这里空着。</p>
        <p className="text-sm text-muted-foreground">
          档案只收一种东西：你事先说过会怎样、后来有了结果的事。
          押出去还没到期的、正在做还没做完的，都不算 —— 悬着的事说明不了你是谁。
          所以刚开始它必然是空的，这不是坏了。
        </p>
        <p className="text-sm text-muted-foreground">
          让它不空最快的一步：挑一件你这周就会知道结果的事，
          先写下你觉得会怎样，到点回来对一次。一条记录，两个时间点，它就进来了。
        </p>
      </div>
    </div>
  );
}

export function DossierPanel({ initial }: { initial: Dossier }) {
  const [dossier, setDossier] = useState(initial);
  const [side, setSide] = useState<Side>("unkept");
  const { pending, error, run } = useAction();

  const tab = TABS.find((item) => item.key === side) ?? TABS[0];
  const labels = side === "kept" ? dossier.kept : dossier.unkept;
  const facing = confrontations(dossier);
  const contested = new Set(facing.map((item) => item.subject));
  const named = [...dossier.kept, ...dossier.unkept].some(
    (label) => label.name !== null
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((item) => (
          <Button
            key={item.key}
            variant={item.key === side ? "default" : "outline"}
            size="sm"
            onClick={() => setSide(item.key)}
          >
            {item.label}
            {item.key === "divides" && facing.length > 0 && (
              <span className="ml-1.5 font-mono text-[11px]">
                {facing.length}
              </span>
            )}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={pending || dossier.total === 0}
          onClick={() =>
            run(async () => {
              setDossier(await nameDossierNow());
            })
          }
        >
          {pending ? "读中…" : named ? "重读一遍" : "给它们起名字"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{tab.hint}</p>
      <Err message={error} />

      {side === "divides" ? (
        facing.length === 0 ? (
          <div className="self-panel">
            <div className="self-panel__body space-y-2">
              <p className="text-[15px] leading-relaxed">
                还没有哪件事你两边都占过。
              </p>
              <p className="text-sm text-muted-foreground">
                这一栏要的是同一类事情上，你有时做到了、有时没做到 ——
                那条分界线才是最值得知道的东西。现在每一类都还是一边倒，
                要么是真的稳定，要么只是记得太少。
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {facing.map((item) => (
              <ConfrontationBlock key={item.subject} item={item} dossier={dossier} />
            ))}
          </div>
        )
      ) : labels.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-3">
          {labels.map((label) => (
            <LabelCard
              key={`${label.side}:${label.subject}`}
              label={label}
              back={flipSide(label, dossier)}
              alsoOtherSide={contested.has(label.subject)}
              onJump={() => setSide("divides")}
            />
          ))}
          {labels.some((label) => label.strength === "lead") && (
            <p className="text-xs text-muted-foreground">
              标着「苗头」的还不够 {MIN_LABEL_EVIDENCE} 次，所以只报次数、不起名字。
              两件事凑不出一个人的特点。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
