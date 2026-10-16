import { Badge } from "@/components/ui/badge";
import {
  belowFloor,
  categoryLabel,
  locationVerdict,
  REMOTE_LEVELS,
  salaryDiff,
  VISA_FITS,
  type JobPosting,
  type JobProfile,
} from "@/lib/domains/jobs/shared";

/** 岗位的事实：只列事实，不加权重。年收差额是代码算的；签证附原话。 */
export function PostingFacts({ posting, profile }: { posting: JobPosting; profile: JobProfile | null }) {
  const f = posting.facts;
  const diff = profile ? salaryDiff(profile.salaryNow, f.salary_min, f.salary_max) : null;
  const unclear = profile ? locationVerdict(f.location, f.remote, profile.locations) === "unclear" : false;
  return (
    <section className="space-y-4 text-sm leading-7">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">{categoryLabel(posting.category)}</Badge>
        <Badge variant="muted">
          {f.location || "勤务地没写"} · {REMOTE_LEVELS[f.remote]}
        </Badge>
        {unclear && <Badge variant="muted">地点说不清</Badge>}
      </div>

      <div>
        <h3 className="font-semibold">年收</h3>
        {f.salary_min === null && f.salary_max === null ? (
          <p className="text-muted-foreground">页面上没写年收（只写了月给或没写的，这里不替你换算）。</p>
        ) : (
          <p>
            {f.salary_min ?? "?"}–{f.salary_max ?? "?"} 万日元
            {diff && <span className="ml-2 text-muted-foreground">{diff}</span>}
            {profile && belowFloor(profile.salaryFloor, f.salary_min, f.salary_max) && (
              <span className="ml-2 text-muted-foreground">低于你写的下限 {profile.salaryFloor} 万</span>
            )}
          </p>
        )}
        {f.salary_quote && <p className="text-xs text-muted-foreground">原话：「{f.salary_quote}」</p>}
      </div>

      <div>
        <h3 className="font-semibold">别的条件</h3>
        {f.terms.length === 0 ? (
          <p className="text-muted-foreground">页面上没写远程天数、加班、休日这些，面试时要问。</p>
        ) : (
          <ul className="space-y-1">
            {f.terms.map((t) => (
              <li key={t.quote}>
                <span className="font-medium">{t.label}</span>：「{t.quote}」
              </li>
            ))}
          </ul>
        )}
      </div>

      {profile?.visa === "gijinkoku" && (
        <div>
          <h3 className="font-semibold">签证：{VISA_FITS[f.visa.fit]}</h3>
          {f.visa.reason && <p>{f.visa.reason}</p>}
          {f.visa.quote && <p className="text-xs text-muted-foreground">業務内容原话：「{f.visa.quote}」</p>}
          <p className="text-xs text-muted-foreground">
            这是按招聘页上写的工作内容看的，最后以入管的判断为准。换工作后 14 天内要交所属机构的届出。
          </p>
        </div>
      )}
    </section>
  );
}
