// 抖音接口钩子（MAIN world，document_start）。
// 在页面自己的 fetch / XMLHttpRequest 上挂钩，捕获"收藏/喜欢"列表接口的响应，
// 通过 postMessage 交给隔离世界的 content/douyin.js。
//
// 为什么这样做：抖音网页版的收藏/喜欢列表不走 SSR（数据不在 HTML 里），
// 而是前端异步请求 /aweme/v1/web/... 接口，且每个请求都带一个每次现算的
// a_bogus 签名（还有 msToken / verifyFp 指纹）。签名算法在混淆 JS 里，后台
// 复现既脆弱又要长期跟抖音更新对抗。这里换个思路：让页面自己带着正确签名去
// 请求，我们只在它的 fetch/XHR 上"偷"一份响应副本。只读、只发到本页、不持久化。
(function () {
  if (window.__shoucangDyHooked) return;
  window.__shoucangDyHooked = true;

  // 收藏列表：/aweme/v1/web/aweme/listcollection/（POST）
  // 喜欢列表：/aweme/v1/web/aweme/favorite/（GET）
  // 用关键字匹配而非完整路径，抖音路径微调时仍能命中。
  const isCollect = (u) => u.includes("listcollection");
  const isLike = (u) => u.includes("aweme/favorite");
  const isTarget = (u) => typeof u === "string" && (isCollect(u) || isLike(u));
  const kindOf = (u) => (isCollect(u) ? "dy_fav" : "dy_like");

  function forward(url, text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      return;
    }
    const list = data && (data.aweme_list || data.awemeList);
    if (!Array.isArray(list) || list.length === 0) return;
    const kind = kindOf(url);
    // 只把结构化的最小字段发给隔离世界，避免转发整包大 JSON。
    const items = [];
    for (const aw of list) {
      const id = aw.aweme_id || aw.awemeId;
      if (!id) continue;
      // 过滤：收藏接口只保留 collect_status === 1/2；喜欢接口只保留 is_favorite === 1/true
      const cs = aw.collect_status;
      const fav = aw.is_favorite;
      if (kind === "dy_fav" && cs != null && cs !== 1 && cs !== 2) continue;
      if (kind === "dy_like" && fav != null && fav !== 1 && fav !== true) continue;
      const v = aw.video || {};
      const cover =
        v.cover?.url_list?.[0] ||
        v.origin_cover?.url_list?.[0] ||
        v.dynamic_cover?.url_list?.[0] ||
        "";
      items.push({
        id: String(id),
        desc: (aw.desc || "").trim(),
        cover,
        author: (aw.author?.nickname || "").slice(0, 40),
        createTime: aw.create_time || 0,
      });
    }
    if (items.length) {
      window.postMessage({ __shoucang: true, kind, items }, "*");
    }
  }

  // —— hook fetch ——
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const req = args[0];
    const url = String((req && req.url) || req || "");
    const p = origFetch.apply(this, args);
    if (isTarget(url)) {
      p.then((resp) => {
        resp
          .clone()
          .text()
          .then((t) => forward(url, t))
          .catch(() => {});
      }).catch(() => {});
    }
    return p;
  };

  // —— hook XMLHttpRequest ——
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (_method, url) {
    this.__shoucangUrl = String(url || "");
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (isTarget(this.__shoucangUrl)) {
      this.addEventListener("load", () => {
        try {
          forward(this.__shoucangUrl, this.responseText || "");
        } catch (_) {}
      });
    }
    return origSend.apply(this, arguments);
  };
})();
