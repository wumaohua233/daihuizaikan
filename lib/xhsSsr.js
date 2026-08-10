// 小红书 SSR 数据提取：后台直接 fetch，无需渲染页面。
// 小红书网页版是 Next.js SSR，首屏数据嵌在 __INITIAL_STATE__ 里；
// 收藏/点赞列表按时间倒序，检测新增只需首屏 10 条。

async function fetchHtml(url) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// __INITIAL_STATE__ 是 JS 字面量而非纯 JSON（含 undefined），
// 替换为 null 后 JSON.parse（MV3 CSP 禁止 eval，不能用 new Function）。
function extractInitialState(html) {
  const marker = "__INITIAL_STATE__=";
  const i = html.indexOf(marker);
  if (i < 0) throw new Error("页面无 SSR 数据（可能未登录）");
  const j = html.indexOf("</script>", i);
  if (j < 0) throw new Error("SSR 数据不完整");
  const raw = html
    .slice(i + marker.length, j)
    .trim()
    .replace(/:undefined(?=[,}\]])/g, ":null");
  return JSON.parse(raw);
}

// 从首页 SSR/链接中解析当前登录用户 uid
export async function resolveUid() {
  const html = await fetchHtml("https://www.xiaohongshu.com/");
  const m = html.match(/\/user\/profile\/([a-z0-9]{24})/);
  if (m) return m[1];
  const state = extractInitialState(html);
  const uid = state?.user?.userInfo?.user_id;
  if (uid) return uid;
  throw new Error("小红书未登录");
}

// 列表首屏（约 10 条，时间倒序）。tab: "fav" | "liked"
export async function fetchList(uid, tab) {
  const url = `https://www.xiaohongshu.com/user/profile/${uid}?tab=${tab}&subTab=note`;
  const state = extractInitialState(await fetchHtml(url));
  const u = state.user || {};
  // activeTab.index 指向当前 tab 在 notes 数组里的位置
  const idx = u.activeTab?.index ?? (tab === "liked" ? 2 : 1);
  const arr = u.notes?.[idx];
  if (!Array.isArray(arr)) throw new Error("SSR 中无列表数据");
  return arr
    .filter((it) => it && it.id)
    .map((it) => ({
      id: it.id,
      title: it.noteCard?.displayTitle || "",
      cover: it.noteCard?.cover?.urlDefault || it.noteCard?.cover?.url || "",
      author: it.noteCard?.user?.nickname || "",
      url: `https://www.xiaohongshu.com/explore/${it.id}?xsec_token=${it.xsecToken || ""}&xsec_source=pc_collect`,
    }));
}
