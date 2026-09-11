"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Err, useAction } from "./self-forms";
import { nameDossierNow } from "./actions";
import {
  MIN_LABEL_EVIDENCE,
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
    hint: "同一件事你两边都占过 —— 那就得说清楚，什么时候你是哪一种。",
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

function LabelCard({ label }: { label: DossierLabel }) {
  const [open, setOpen] = useState(false);
  const isLead = label.strength === "lead";

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
        {label.because && (
          <p className="text-[15px] leading-relaxed">{label.because}</p>
        )}
        {!label.name && !isLead && (
          <p className="text-sm text-muted-foreground">
            还没起名字。点上面那个按钮，让它把这几件事翻成一句人话。
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          <span className="self-label mr-1.5">怎么改</span>
          {label.falsifier}
        </p>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "收起" : `凭什么这么说（${label.evidence.length} 条）`}
        </Button>
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

function Empty({ dossier }: { dossier: Dossier }) {
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
        {dossier.total === 0 && (
          <p className="text-sm text-muted-foreground">
            现在预测、事迹、假设窗口这几处一条都没有。
          </p>
        )}
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
        dossier.divides.length === 0 ? (
          <div className="self-panel">
            <div className="self-panel__body space-y-2">
              <p className="text-[15px] leading-relaxed">
                还没有哪件事你两边都占过。
              </p>
              <p className="text-sm text-muted-foreground">
                这一栏要的是同一类事情上，你有时做到了、有时没做到 ——
                那个分界线才是最值得知道的东西。现在每一类都还是一边倒，
                要么是真的稳定，要么只是记得太少。
              </p>
            </div>
          </div>
        ) : (
          dossier.divides.map((divide) => (
            <div key={divide.subject} className="self-panel">
              <div className="self-panel__head">
                <span className="self-label">分界线</span>
                <span className="text-sm font-medium">{divide.subject}</span>
              </div>
              <div className="self-panel__body space-y-3">
                {divide.condition && (
                  <p className="text-[15px] leading-relaxed">
                    {divide.condition}
                  </p>
                )}
                <div>
                  <p className="self-label mb-1">做到的时候</p>
                  {divide.kept.map((item) => (
                    <EvidenceRow key={item.key} item={item} />
                  ))}
                </div>
                <div>
                  <p className="self-label mb-1">没做到的时候</p>
                  {divide.unkept.map((item) => (
                    <EvidenceRow key={item.key} item={item} />
                  ))}
                </div>
              </div>
            </div>
          ))
        )
      ) : labels.length === 0 ? (
        <Empty dossier={dossier} />
      ) : (
        <div className="space-y-3">
          {labels.map((label) => (
            <LabelCard key={`${label.side}:${label.subject}`} label={label} />
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
