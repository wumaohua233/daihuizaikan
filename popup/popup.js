// popup：待会再看清单展示与操作。

import * as store from "../lib/store.js";

const $ = (id) => document.getElementById(id);

const WEEK_MS = 7 * 24 * 3600 * 1000;
const TABS = [
  { key: "recent", label: "最新" },
  { key: "x_bookmark", label: "X 书签" },
  { key: "x_like", label: "X 点赞" },
  { key: "tt_like", label: "TikTok 点赞" },
  { key: "tt_fav", label: "TikTok 收藏" },
  { key: "ig_fav", label: "Instagram 收藏" },
  { key: "ig_like", label: "Instagram 点赞" },
  { key: "yt_like", label: "YouTube 喜欢" },
  { key: "yt_watch", label: "YouTube 稍后看" },
  { key: "dy_like", label: "抖音喜欢" },
  { key: "dy_fav", label: "抖音收藏" },
  { key: "xhs_like", label: "小红书喜欢" },
  { key: "xhs_fav", label: "小红书收藏" },
];
let activeTab = "recent";

function filterByTab(arr) {
  if (activeTab === "recent") {
    const cutoff = Date.now() - WEEK_MS;
    return arr.filter((it) => it.firstSeenAt >= cutoff);
  }
  return arr.filter((it) => it.source === activeTab);
}

function renderTabs(items) {
  // 数字 = 未读数；无未读不显示
  const counts = { recent: 0 };
  const cutoff = Date.now() - WEEK_MS;
  for (const it of Object.values(items)) {
    if (it.status !== "new") continue;
    if (it.firstSeenAt >= cutoff) counts.recent++;
    counts[it.source] = (counts[it.source] || 0) + 1;
  }
  $("tabs").innerHTML = TABS.map((t) => {
    const n = counts[t.key] || 0;
    return (
      `<button class="tab ${t.key === activeTab ? "active" : ""}" data-tab="${t.key}">` +
      `${t.label}${n > 0 ? `<span class="cnt">${n}</span>` : ""}</button>`
    );
  }).join("");
  $("tabs").querySelectorAll(".tab").forEach((el) => {
    el.addEventListener("click", () => {
      activeTab = el.dataset.tab;
      refresh();
    });
  });
}

function fmtTime(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function renderStatus(status) {
  const el = $("status");
  if (status.netPending) {
    el.innerHTML = `<span class="err">网络未就绪</span>，连上网后会自动同步（每 3 分钟自动重试）`;
    return;
  }
  if (!status.lastRun) {
    el.textContent = "还没有检测过，点击「同步」开始";
    return;
  }
  const r = status.lastRun;
  const errs = [];
  for (const [source, res] of Object.entries(r.results || {})) {
    if (res.ok) continue;
    const label = store.SOURCES[source]?.label || source;
    const loginUrl = LOGIN_URLS[source];
    const btn = loginUrl ? ` <button class="login-inline" data-url="${loginUrl}">去登录</button>` : "";
    errs.push(`<span class="err">${label}失败：${res.error}</span>${btn}`);
  }
  const nextStr = status.nextRun ? `，下次 ${fmtTime(status.nextRun)}` : "";
  const errStr = errs.length ? ` · ${errs.join(" · ")}` : "";
  const okStr = errs.length ? "" : " · 全部同步正常";
  el.innerHTML = `上次检测 ${fmtTime(r.at)}${nextStr}${errStr || okStr}`;

  el.querySelectorAll(".login-inline").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url: btn.dataset.url });
    });
  });
}

const LOGIN_TARGETS = {
  xhs: { label: "小红书", url: "https://www.xiaohongshu.com" },
  douyin: { label: "抖音", url: "https://www.douyin.com" },
  youtube: { label: "YouTube", url: "https://www.youtube.com" },
  x: { label: "X", url: "https://x.com" },
  tiktok: { label: "TikTok", url: "https://www.tiktok.com" },
  instagram: { label: "Instagram", url: "https://www.instagram.com" },
};

// 检测失败且错误指向登录/未抓取时，状态栏里直接给出「去登录」按钮。
const LOGIN_URLS = {
  xhs_like: "https://www.xiaohongshu.com",
  xhs_fav: "https://www.xiaohongshu.com",
  dy_like: "https://www.douyin.com",
  dy_fav: "https://www.douyin.com",
  tt_like: "https://www.tiktok.com/login",
  tt_fav: "https://www.tiktok.com/login",
  yt_like: "https://accounts.google.com/ServiceLogin?service=youtube",
  yt_watch: "https://accounts.google.com/ServiceLogin?service=youtube",
  x_like: "https://x.com/i/flow/login",
  x_bookmark: "https://x.com/i/flow/login",
  ig_like: "https://www.instagram.com/accounts/login/",
  ig_fav: "https://www.instagram.com/accounts/login/",
};

async function refreshStatus(status) {
  renderStatus(status);
  renderLoginBar(status.loginStatus);
  updateSyncTimes(status.platformSync);
  $("running-tip").style.display = status.running ? "block" : "none";
  $("btn-run").disabled = status.running;
}

// loginStatus: { xhs?: boolean, douyin?: boolean }，某平台为 false 时提示登录。
// 缺省（未启用该平台）或 true（已登录）都不提示。
function renderLoginBar(loginStatus) {
  const bar = $("login-bar");
  const need = Object.keys(LOGIN_TARGETS).filter((k) => loginStatus && loginStatus[k] === false);
  if (!need.length) {
    bar.style.display = "none";
    bar.innerHTML = "";
    return;
  }
  bar.style.display = "flex";
  bar.innerHTML =
    `<span class="tip">未登录，登录后才能检测：</span>` +
    need
      .map(
        (k) =>
          `<button class="login-btn" data-platform="${k}" data-url="${LOGIN_TARGETS[k].url}">登录${LOGIN_TARGETS[k].label}</button>`
      )
      .join("");
  bar.querySelectorAll(".login-btn").forEach((btn) => {
    btn.addEventListener("click", () => chrome.tabs.create({ url: btn.dataset.url }));
  });
}

function render(items, unread, nextRun) {
  const list = $("list");
  const badge = $("unread");
  badge.style.display = unread > 0 ? "" : "none";
  badge.textContent = unread;
  renderTabs(items);

  const arr = filterByTab(Object.values(items)).sort((a, b) => {
    // 严格收藏顺序：检测批次倒序；同批内按抓取位次升序（0 = 最新收藏）。
    // 已读条目置灰但位置不动，最新的永远在最前。
    return b.firstSeenAt - a.firstSeenAt || (a.seq ?? 0) - (b.seq ?? 0);
  });
  if (!arr.length) {
    list.innerHTML = '<div class="empty">暂无内容。<br>去小红书/抖音收藏点什么，再点「同步」。</div>';
    return;
  }

  let html = "";
  // 单独平台 tab：顶部显示该平台各自的上次同步时间
  if (activeTab !== "recent") {
    if (nextRun) html += `<div class="group-label"><span class="gl-time">下次同步 ${fmtTimeHtml(nextRun)}</span></div>`;
  }
  let lastSource = null;
  for (const it of arr.slice(0, 100)) {
    if (activeTab === "recent" && it.source !== lastSource) {
      const timeStr = nextRun ? ` <span class="gl-time">· 下次同步 ${fmtTimeHtml(nextRun)}</span>` : "";
      html += `<div class="group-label">${store.SOURCES[it.source]?.label || it.source}${timeStr}</div>`;
      lastSource = it.source;
    }
    const metaHtml = it.author ? `<div class="meta">${escapeHtml(it.author)}</div>` : "";
    html += `
      <div class="item ${it.status === "new" ? "" : "read"}" data-key="${it.key}" data-url="${escapeHtml(it.url)}">
        ${it.cover ? `<img src="${escapeHtml(it.cover)}">` : ""}
        <div class="body">
          <div class="t">${it.status === "new" ? '<span class="dot"></span>' : ""}${escapeHtml(it.title || "（无标题）")}</div>
          ${metaHtml}
        </div>
        ${it.status === "new" ? `<button class="mark-read" data-key="${it.key}">已读</button>` : ""}
      </div>`;
  }
  list.innerHTML = html;

  // MV3 CSP 禁止内联事件，封面加载成功再显式淡入，失败则彻底隐藏，避免灰色占位闪烁
  // 缓存图片 complete 时 load 事件已错过，直接按 naturalWidth 判断是否有效
  list.querySelectorAll("img").forEach((img) => {
    if (img.complete) {
      if (img.naturalWidth > 0) img.classList.add("loaded");
      else img.style.display = "none";
    } else {
      img.addEventListener("load", () => { img.classList.add("loaded"); });
      img.addEventListener("error", () => { img.style.display = "none"; });
    }
  });

  // 单条已读：不打开原文
  list.querySelectorAll(".mark-read").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await chrome.runtime.sendMessage({ type: "MARK_READ", key: btn.dataset.key });
      refresh();
    });
  });

  list.querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", async () => {
      const url = el.dataset.url;
      const key = el.dataset.key;
      if (url) chrome.tabs.create({ url });
      await chrome.runtime.sendMessage({ type: "MARK_READ", key });
      refresh();
    });
  });
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function refresh() {
  const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  const items = await store.getItems();
  renderStatus(status);
  renderLoginBar(status.loginStatus);
  updateSyncTimes(status.platformSync);
  render(items, status.unread, status.nextRun);
  $("running-tip").style.display = status.running ? "block" : "none";
  $("btn-run").disabled = status.running;
  return status.running;
}

const PLATFORM_LABELS = { xhs: "小红书", douyin: "抖音", youtube: "YouTube", x: "X", tiktok: "TikTok", instagram: "Instagram" };

// platform 为空 = 全量同步；传平台名 = 只同步该平台
async function startSync(platform) {
  $("sync-menu").hidden = true;
  $("btn-run").disabled = true;
  $("running-tip").style.display = "block";
  await chrome.runtime.sendMessage({ type: "RUN_CHECK_NOW", platform });
  refresh();
}

// 主按钮：全量同步
$("btn-run").addEventListener("click", () => startSync());

// 下拉箭头里按平台去重生成「同步 X」选项，点了只同步那个平台
function renderSyncMenu() {
  const seen = new Set();
  const plats = [];
  for (const meta of Object.values(store.SOURCES)) {
    if (!seen.has(meta.platform)) {
      seen.add(meta.platform);
      plats.push(meta.platform);
    }
  }
  const menu = $("sync-menu");
  menu.innerHTML = plats
    .map(
      (p) =>
        `<button data-platform="${p}"><span class="p-name">同步${PLATFORM_LABELS[p] || p}</span><span class="p-time" data-time-for="${p}">上次同步: --</span></button>`
    )
    .join("");
  menu.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      startSync(b.dataset.platform);
    });
  });
}
renderSyncMenu();

// 菜单里每个平台的"上次同步"小时间（MM.DD.HH:mm）
// 时间显示：日期和时间分色，如「7月12日 6:56」
function fmtTimeHtml(ts) {
  const d = new Date(ts);
  const date = `${d.getMonth() + 1}月${d.getDate()}日`;
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `<span class="t-date">${date}</span> <span class="t-time">${time}</span>`;
}

function updateSyncTimes(platformSync) {
  document.querySelectorAll("[data-time-for]").forEach((el) => {
    const ts = platformSync && platformSync[el.dataset.timeFor];
    el.innerHTML = ts ? "上次同步 " + fmtTimeHtml(ts) : "还没同步过";
  });
}

$("btn-run-more").addEventListener("click", (e) => {
  e.stopPropagation();
  const m = $("sync-menu");
  m.hidden = !m.hidden;
});
document.addEventListener("click", () => {
  $("sync-menu").hidden = true;
});

$("btn-read-all").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "MARK_ALL_READ" });
  refresh();
});

$("btn-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

function csvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// 导出全部清单为 CSV（带 BOM，Excel 能正确显示中文）
async function exportCsv() {
  const items = await store.getItems();
  const arr = Object.values(items).sort(
    (a, b) => b.firstSeenAt - a.firstSeenAt || (a.seq ?? 0) - (b.seq ?? 0)
  );
  if (!arr.length) {
    alert("清单是空的，没什么可导出的");
    return;
  }
  const rows = [["来源", "标题", "作者", "链接", "状态", "发现时间", "描述"]];
  for (const it of arr) {
    rows.push([
      store.SOURCES[it.source]?.label || it.source,
      it.title || "",
      it.author || "",
      it.url || "",
      it.status === "new" ? "未读" : "已读",
      fmtTime(it.firstSeenAt),
      it.desc || "",
    ]);
  }
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `待会再看_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

$("btn-export").addEventListener("click", exportCsv);

let wasRunning = false;
refresh().then((running) => { wasRunning = running; });

// 轮询：同步中刷新列表显示进度；同步完成后只刷状态栏，避免反复重绘列表导致图片闪烁
const poll = setInterval(async () => {
  const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  if (status.running || (wasRunning && !status.running)) {
    // 同步中或刚结束：刷新完整列表
    await refresh();
  } else {
    // 空闲时：只更新状态栏，不动列表（不重新加载图片）
    refreshStatus(status);
  }
  wasRunning = status.running;
  if (!status.running && document.hidden) clearInterval(poll);
}, 3000);
