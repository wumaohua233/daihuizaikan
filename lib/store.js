// chrome.storage.local 封装：设置、已见 id、条目、运行记录。
// 供 background / popup / options 以 ES module 方式共用。

export const SOURCES = {
  xhs_fav: { platform: "xhs", label: "小红书收藏" },
  xhs_like: { platform: "xhs", label: "小红书点赞" },
  dy_fav: { platform: "douyin", label: "抖音收藏" },
  dy_like: { platform: "douyin", label: "抖音喜欢" },
  yt_like: { platform: "youtube", label: "YouTube 喜欢" },
  yt_watch: { platform: "youtube", label: "YouTube 稍后看" },
  x_bookmark: { platform: "x", label: "X 书签" },
  x_like: { platform: "x", label: "X 点赞" },
  tt_fav: { platform: "tiktok", label: "TikTok 收藏" },
  tt_like: { platform: "tiktok", label: "TikTok 点赞" },
  ig_fav: { platform: "instagram", label: "Instagram 收藏" },
  ig_like: { platform: "instagram", label: "Instagram 点赞" },
};

export const DEFAULT_SETTINGS = {
  sources: { xhs_fav: true, xhs_like: true, dy_fav: true, dy_like: true, yt_like: true, yt_watch: true, x_bookmark: true, x_like: true, tt_fav: true, tt_like: true, ig_fav: true, ig_like: true },
  intervalMinutes: 180,
  firstRunDone: false,
};

async function getRaw(key, fallback) {
  const obj = await chrome.storage.local.get(key);
  return obj[key] === undefined ? fallback : obj[key];
}

async function setRaw(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

export async function getSettings() {
  const s = await getRaw("settings", {});
  const merged = {
    ...DEFAULT_SETTINGS,
    ...s,
    sources: { ...DEFAULT_SETTINGS.sources, ...(s.sources || {}) },
  };
  // 旧版 intervalHours（小时）迁移为 intervalMinutes（分钟）
  if (s.intervalMinutes == null && s.intervalHours != null) {
    merged.intervalMinutes = Math.max(1, s.intervalHours * 60);
  }
  return merged;
}

export async function saveSettings(settings) {
  await setRaw("settings", settings);
}

export async function getSeen(source) {
  const seen = await getRaw("seen", {});
  return seen[source] || {};
}

export async function addSeen(source, ids) {
  const seen = await getRaw("seen", {});
  const bucket = seen[source] || {};
  for (const id of ids) bucket[id] = true;
  seen[source] = bucket;
  await setRaw("seen", seen);
}

export async function getItems() {
  return await getRaw("items", {});
}

export async function upsertItems(newItems) {
  const items = await getRaw("items", {});
  for (const it of newItems) items[it.key] = it;
  await setRaw("items", items);
}

export async function updateItem(key, patch) {
  const items = await getRaw("items", {});
  if (items[key]) {
    Object.assign(items[key], patch);
    await setRaw("items", items);
  }
}

export async function markAllRead() {
  const items = await getRaw("items", {});
  for (const k of Object.keys(items)) items[k].status = "read";
  await setRaw("items", items);
}

export async function unreadCount() {
  const items = await getRaw("items", {});
  return Object.values(items).filter((it) => it.status === "new").length;
}

export async function getLastRun() {
  return await getRaw("lastRun", null);
}

export async function setLastRun(record) {
  await setRaw("lastRun", record);
}

// 每个平台各自的最近同步时间戳：{ xhs: ts, douyin: ts, ... }
export async function getPlatformSync() {
  return await getRaw("platformSync", {});
}

export async function setPlatformSync(obj) {
  await setRaw("platformSync", obj);
}

// 网络未就绪、正在等待重试的起始时间戳（0 = 没在等）
export async function getNetPending() {
  return await getRaw("netPending", 0);
}

export async function setNetPending(ts) {
  await setRaw("netPending", ts);
}
