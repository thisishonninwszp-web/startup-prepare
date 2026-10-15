"use client";

import { useEffect, useRef, useState } from "react";
import { clipBookmarklet } from "./clip-shared";

/**
 * 材料箱顶上的"书签小工具"：把那个按钮拖到书签栏，之后在任何网页上点一下就存进来。
 * 链接里是一段脚本（javascript:），React 不让直接写进 href，挂载后再设。
 */
export function ClipBookmarklet() {
  const ref = useRef<HTMLAnchorElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    ref.current?.setAttribute("href", clipBookmarklet(window.location.origin));
    setReady(true);
  }, []);
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-muted-foreground">电脑上一键存网页（书签小工具，不用装插件）</summary>
      <div className="mt-2 space-y-2 leading-7">
        <p>
          把这个按钮<strong className="font-medium">拖到浏览器的书签栏</strong>：
          <a
            ref={ref}
            onClick={(e) => e.preventDefault()}
            className="ml-2 inline-block rounded-md border border-primary px-3 py-0.5 text-sm font-medium text-primary"
            title="拖到书签栏"
          >
            {ready ? "存进 IdeaOS" : "……"}
          </a>
        </p>
        <p className="text-xs leading-6 text-muted-foreground">
          之后在任何网页上点书签栏里的「存进 IdeaOS」，会打开一个小窗口，把你眼前看到的正文送过来 ——
          要登录才能看的页面、X、note 的会员文章也行。先选中一段再点，就可以只存那一段。
          书签栏没显示的话：Chrome / Edge 按 Ctrl+Shift+B（Mac 是 ⌘+Shift+B）。
        </p>
      </div>
    </details>
  );
}
