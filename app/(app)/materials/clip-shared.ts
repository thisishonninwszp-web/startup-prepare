/**
 * 电脑浏览器的"书签小工具"：在任何网页上点一下，把眼前看到的正文送进材料箱。
 * 不用装插件 —— 书签里存一段脚本，点的时候在那个网页里跑：读正文、开 IdeaOS 的 /materials/clip、
 * 等那边说"准备好了"再把正文用 postMessage 递过去。
 *
 * 为什么不只存网址让服务器去读：要登录才能看的页面、正文是脚本画出来的页面，服务器读不到；
 * 你眼前看到的那一页，浏览器里已经有正文了。
 * 有的网站会把弹出的窗口隔开（递不过去），那时 /materials/clip 退回"只存网址"。
 */

/** 递过来的那一份（浏览器传来的，先查形状再用）。 */
export type ClipPayload = { url: string; title: string; text: string; selection: string };

export const CLIP_TEXT_MAX = 60_000;
export const CLIP_SELECTION_MAX = 20_000;

export function parseClipMessage(data: unknown): ClipPayload | null {
  if (!data || typeof data !== "object") return null;
  const v = data as Record<string, unknown>;
  if (v.type !== "ideaos-clip") return null;
  const str = (k: string, max: number) => (typeof v[k] === "string" ? (v[k] as string).slice(0, max) : "");
  const url = str("url", 2000);
  if (!/^https?:\/\//i.test(url)) return null;
  const text = str("text", CLIP_TEXT_MAX).trim();
  const selection = str("selection", CLIP_SELECTION_MAX).trim();
  if (!text && !selection) return null;
  return { url, title: str("title", 200).trim(), text, selection };
}

/**
 * 书签里那段脚本（origin 是 IdeaOS 的网址开头：用哪个域名打开的就是哪个）。
 * 正文优先取 <article> / <main>（够长才算），不然整页；选中了一段就另外带上。
 */
export function clipBookmarklet(origin: string): string {
  const code = `(()=>{const o=${JSON.stringify(origin)};const a=document.querySelector('article')||document.querySelector('main');const b=document.body?document.body.innerText:'';const t=(a&&a.innerText.length>500?a.innerText:b).slice(0,${CLIP_TEXT_MAX});const d={type:'ideaos-clip',url:location.href,title:document.title.slice(0,200),selection:String(getSelection()||'').slice(0,${CLIP_SELECTION_MAX}),text:t};const w=window.open(o+'/materials/clip?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(d.title),'_blank');if(!w){alert('浏览器拦住了弹出窗口：允许这个网站弹出窗口后再点一次');return}const h=e=>{if(e.origin===o&&e.data&&e.data.type==='ideaos-clip-ready'){w.postMessage(d,o);removeEventListener('message',h)}};addEventListener('message',h);setTimeout(()=>removeEventListener('message',h),60000)})()`;
  return `javascript:${encodeURIComponent(code)}`;
}
