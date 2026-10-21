"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ANY_AREA, GRANT_AREAS, isGrantArea, type Grant } from "@/lib/domains/ideas/grants-shared";
import { searchGrantsAction } from "../info-gap-actions";

const STORE_KEY = "ideaos:grants";

/**
 * 有没有补助金可以拿：查 jGrants 上现在还在招募的（选了都道府县时连「全国」的一起）。不存，只看。
 * 关键词和地区记在这台浏览器里（下次打开不用重选）。
 */
export function GrantsPanel() {
  const [keyword, setKeyword] = useState("創業");
  const [area, setArea] = useState<string>(ANY_AREA);
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as { keyword?: string; area?: string };
      if (saved.keyword) setKeyword(saved.keyword);
      if (saved.area && isGrantArea(saved.area)) setArea(saved.area);
    } catch {
      // 读不到就用默认的
    }
  }, []);

  const run = () =>
    startTransition(async () => {
      setError(null);
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ keyword, area }));
      } catch {
        // 存不了也不要紧
      }
      const r = await searchGrantsAction(keyword, area);
      if (r.ok) setGrants(r.grants);
      else setError(r.message);
    });

  return (
    <div className="space-y-3 text-sm leading-7">
      <p className="text-muted-foreground">
        你现在不想花自己的钱，那就先看看有没有别人的钱可以用。查的是政府补助金的电子申请系统（jGrants）上现在还在招募的；
        关键词写「創業」「開業」「IT導入」「販路開拓」这类，比写想法本身的名字查得到。
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="例：創業" maxLength={30} className="sm:w-48" />
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRANT_AREAS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={pending || keyword.trim().length < 2} onClick={run}>
          {pending ? "在查……" : "查一查"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {grants !== null &&
        (grants.length === 0 ? (
          <p className="text-muted-foreground">
            「{keyword.trim()}」{area === ANY_AREA ? "" : `在${area}（连全国都能申请的）`}现在没有还在招募的。换个词（「開業」「中小企業」「IT導入」）或换个地区再查；补助金多在春天（4–6 月）开新一轮。
          </p>
        ) : (
          <ul className="space-y-2">
            {grants.map((g) => (
              <li key={g.id}>
                <a href={g.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                  {g.title}
                </a>
                <span className="ml-1 font-mono text-xs text-muted-foreground">
                  {g.area || "地区没写"}
                  {g.deadline && ` · ${g.deadline} 截止`}
                  {g.max !== null ? ` · 最多 ${g.max.toLocaleString("ja-JP")} 日元` : " · 金额没写"}
                </span>
              </li>
            ))}
          </ul>
        ))}
      {grants !== null && grants.length > 0 && (
        <p className="text-xs leading-6 text-muted-foreground">
          能不能申请要看每一条的条件（行业、在哪、成立几年、员工几人），点进去看。很多是先花钱、事后报销，而且要写事业计划 ——
          拿到它本身就是一次把想法讲给陌生人听、被挑刺的机会。
        </p>
      )}
    </div>
  );
}
