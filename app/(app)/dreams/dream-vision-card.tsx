import { Eye, MapPin, Users } from "lucide-react";
import type { DreamDelta, DreamVision } from "./types";

export function DreamVisionCard({
  vision,
  delta,
}: {
  vision: DreamVision;
  delta?: DreamDelta | null;
}) {
  return (
    <article className="space-y-8">
      {delta && (
        <details className="rounded-2xl border border-stone-300 bg-stone-50 p-5">
          <summary className="cursor-pointer text-sm font-medium">
            这个版本发生了什么变化
          </summary>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <List title="场景变化" items={delta.scene_changes} />
            <List
              title="愿望重心"
              items={delta.desired_change_updates}
            />
            <List title="前提变化" items={delta.assumption_changes} />
            <List title="新增代价" items={delta.new_costs} />
            <List title="解决的冲突" items={delta.resolved_conflicts} />
            <List title="新的冲突" items={delta.new_conflicts} />
          </div>
          {delta.change_reason && (
            <p className="mt-4 border-t border-stone-200 pt-3 text-xs text-stone-500">
              变化原因：{delta.change_reason}
            </p>
          )}
        </details>
      )}

      <section className="relative overflow-hidden rounded-[2rem] bg-stone-950 p-7 text-stone-50 sm:p-10">
        <div className="absolute right-0 top-0 size-48 rounded-full border border-white/10 translate-x-1/3 -translate-y-1/3" />
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-400">
          A day in the future
        </p>
        <h2 className="mt-5 max-w-3xl font-serif text-3xl leading-tight tracking-[-0.03em] sm:text-4xl">
          {vision.scene.title}
        </h2>
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-stone-400">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="size-3.5" />
            {vision.scene.horizon}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" />
            {vision.scene.location}
          </span>
          {vision.scene.people.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              {vision.scene.people.join("、")}
            </span>
          )}
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-[.8fr_1.2fr]">
          <div>
            <div className="text-xs text-stone-400">你能感觉到</div>
            <ul className="mt-3 space-y-2 font-serif text-lg leading-7">
              {vision.scene.sensory_details.map((item, index) => (
                <li key={index}>“{item}”</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs text-stone-400">这一天正在发生</div>
            <ol className="mt-3 space-y-3">
              {vision.scene.actions.map((item, index) => (
                <li
                  key={index}
                  className="grid grid-cols-[2rem_1fr] gap-2 text-sm leading-6"
                >
                  <span className="font-mono text-xs text-stone-500">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <blockquote className="mt-10 border-l border-stone-600 pl-4 font-serif text-xl italic leading-8 text-stone-300">
          {vision.scene.inner_state}
        </blockquote>
      </section>

      <section className="rounded-[2rem] border border-stone-300 bg-stone-50 p-6">
        <h3 className="font-serif text-xl">希望真正发生的变化</h3>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {vision.desired_changes.map((item, index) => (
            <li
              key={index}
              className="rounded-xl bg-[#f4f1ea] p-4 text-sm leading-6"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <details className="rounded-[2rem] border border-stone-300 bg-stone-50 p-6">
        <summary className="cursor-pointer font-serif text-xl">
          查看代价、前提与现实连接
        </summary>
        <p className="mt-2 text-xs text-stone-500">
          这些内容不否定梦想，只说明它靠什么成立。
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <List title="过去为何在意" items={vision.past_roots} />
          <List title="不愿牺牲" items={vision.non_negotiables} />
          <List title="愿意承担的代价" items={vision.costs} />
          <List title="成立前提" items={vision.assumptions} />
          <List title="现实中的靠近信号" items={vision.reality_signals} />
          <List title="人生／事业冲突" items={vision.conflicts} />
        </div>
      </details>
    </article>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-stone-500">{title}</h4>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li key={index} className="text-sm leading-6">
              · {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-stone-400">目前没有明确内容</p>
      )}
    </div>
  );
}
