// =============================================================================
// ADMIN BRIDGE, SUPABASE CLOUD SAVE/LOAD, SOLO GOLD BOSS HUNT & GUIDE
// - Lưu / Tải đám mây (Supabase Save/Load) gọn nhẹ khi đã đăng nhập, báo lỗi ngay nếu mất mạng
// - Kết nối thời gian thực giữa /admin.html và tab game đang chạy
// - Cung cấp tính năng "🐉 Săn Boss Hoàng Kim" chủ động cho người chơi cá nhân
// - Cung cấp nút "📖 Cẩm Nang" mở trang hướng dẫn tân thủ & lộ trình chơi đơn
// =============================================================================
(function () {
  "use strict";

  var bc = null;
  try {
    bc = new BroadcastChannel("jx_admin_channel");
  } catch (e) {}

  // ===========================================================================
  // 1. SUPABASE CLOUD SAVE & LOAD (CHỈ SAVE / LOAD, BÁO LỖI KHI MẤT INTERNET)
  // ===========================================================================
  var sbClient = null;
  var sbUser = null;
  var sbLoadingLib = null;
  var EMAIL_SUFFIX = "@volamidle.game";
  var FAC_NAMES = {
    shaolin: "Thiếu Lâm",
    tianwang: "Thiên Vương",
    tangmen: "Đường Môn",
    wudu: "Ngũ Độc",
    emei: "Nga My",
    cuiyan: "Thúy Yên",
    gaibang: "Cái Bang",
    tianren: "Thiên Nhẫn",
    wudang: "Võ Đang",
    kunlun: "Côn Lôn"
  };

  function notifyError(msg) {
    if (window.JXAdmin) {
      window.JXAdmin.toast("❌ " + msg);
      window.JXAdmin.log('<b style="color:#ff6b6b">❌ [Supabase Cloud] ' + msg + "</b>");
    } else {
      alert(msg);
    }
  }

  function notifySuccess(msg) {
    if (window.JXAdmin) {
      window.JXAdmin.toast("☁ " + msg);
      window.JXAdmin.log('<b style="color:#7fffd4">☁ [Supabase Cloud] ' + msg + "</b>");
    }
  }

  function checkInternetOrError() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      notifyError("Không có kết nối Internet! Không thể Lưu/Tải dữ liệu từ Supabase.");
      return false;
    }
    var cfg = window.CHAT_CFG || {};
    if (!cfg.url || !cfg.key) {
      notifyError("Chưa cấu hình URL/Key Supabase trong file config.js!");
      return false;
    }
    return true;
  }

  function ensureSupabaseClient() {
    if (!checkInternetOrError()) return Promise.reject(new Error("Không có kết nối Internet!"));
    if (sbClient) return Promise.resolve(sbClient);
    if (window.supabase && window.supabase.createClient) {
      var cfg = window.CHAT_CFG;
      sbClient = window.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
      return Promise.resolve(sbClient);
    }
    if (!sbLoadingLib) {
      sbLoadingLib = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "js/lib/supabase.js?v=584";
        s.onload = function () {
          if (window.supabase && window.supabase.createClient) {
            var cfg = window.CHAT_CFG;
            sbClient = window.supabase.createClient(cfg.url, cfg.key, {
              auth: { persistSession: true, autoRefreshToken: true }
            });
            resolve(sbClient);
          } else {
            sbLoadingLib = null;
            reject(new Error("Không khởi tạo được thư viện Supabase"));
          }
        };
        s.onerror = function () {
          sbLoadingLib = null;
          reject(new Error("Không có kết nối Internet (không tải được thư viện Supabase)!"));
        };
        document.head.appendChild(s);
      });
    }
    return sbLoadingLib;
  }

  function formatNetError(err) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return "Không có kết nối Internet! Vui lòng kiểm tra mạng.";
    }
    var m = (err && (err.message || err.error_description || String(err))) || "Lỗi kết nối mạng";
    if (/failed to fetch|network|fetch|load failed|timeout/i.test(m)) {
      return "Mất kết nối Internet hoặc không thể kết nối tới máy chủ Supabase!";
    }
    if (/invalid login credentials/i.test(m)) {
      return "Sai tên tài khoản hoặc mật khẩu!";
    }
    if (/user already registered/i.test(m)) {
      return "Tên tài khoản này đã được đăng ký!";
    }
    return m;
  }

  function getUsername() {
    if (!sbUser || !sbUser.email) return "";
    return sbUser.email.replace(EMAIL_SUFFIX, "");
  }

  function updateCloudButtonsUI() {
    var logged = !!sbUser;
    var b1 = document.getElementById("soloCloudBtn");
    if (b1) {
      b1.style.borderColor = logged ? "#38b28b" : "#4a607a";
      b1.style.color = logged ? "#7fffd4" : "#9ec5ff";
      b1.title = logged
        ? "Lưu / Tải Đám Mây Supabase (Đã đăng nhập: " + getUsername() + ")"
        : "Đăng nhập để Lưu / Tải nhân vật trên Supabase";
    }
    var b2 = document.getElementById("u20cloudSave");
    if (b2) {
      b2.innerHTML = logged ? "☁ Lưu<br>Cloud" : "☁ Đăng<br>Nhập";
    }
  }

  // Check session on startup
  function initCloudAuth() {
    var cfg = window.CHAT_CFG || {};
    if (!cfg.url || !cfg.key) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    ensureSupabaseClient()
      .then(function (client) {
        return client.auth.getSession();
      })
      .then(function (res) {
        sbUser = res && res.data && res.data.session ? res.data.session.user : null;
        updateCloudButtonsUI();
      })
      .catch(function () {});
  }

  // Warn immediately if internet disconnects while logged in
  window.addEventListener("offline", function () {
    if (sbUser) {
      notifyError("Mất kết nối Internet! Không thể lưu dữ liệu lên Supabase lúc này.");
    }
  });
  window.addEventListener("online", function () {
    if (sbUser) {
      notifySuccess("Đã kết nối lại Internet!");
    }
  });

  // Save a slot (0..2) to Supabase `saves` table
  async function saveSlotToSupabase(slotIdx, silent) {
    if (!checkInternetOrError()) return false;
    try {
      var client = await ensureSupabaseClient();
      if (!sbUser) {
        var sess = await client.auth.getSession();
        sbUser = sess && sess.data && sess.data.session ? sess.data.session.user : null;
      }
      if (!sbUser) {
        if (!silent) notifyError("Bạn cần đăng nhập tài khoản trước khi Lưu lên Supabase!");
        return false;
      }
      if (!window.JXAdmin) return false;

      var activeSlot = window.JXAdmin.getSlot ? window.JXAdmin.getSlot() : 0;
      if (slotIdx == null) slotIdx = activeSlot;

      // Save current in-memory state to localStorage first if saving active slot
      if (slotIdx === activeSlot && window.JXAdmin.save) {
        window.JXAdmin.save();
      }

      var st = slotIdx === activeSlot ? window.JXAdmin.getState() : window.JXAdmin.getLocalSlot(slotIdx);
      if (!st || !st.fac) {
        if (!silent) notifyError("Ô nhân vật " + (slotIdx + 1) + " đang trống, chưa có nhân vật để lưu!");
        return false;
      }

      var signedChar = window.JXAdmin.encodeSave(st);
      var stashRaw = window.JXAdmin.getStash ? window.JXAdmin.getStash() : localStorage.getItem("jxidle_stash");
      var payloadData = JSON.stringify({
        v: 2,
        d: signedChar,
        k: stashRaw || null
      });

      var nowIso = new Date().toISOString();
      var res = await client.from("saves").upsert({
        owner: sbUser.id,
        slot: slotIdx,
        name: st.name || "Tân thủ",
        lvl: st.lvl | 0 || 1,
        fac: st.fac,
        data: payloadData,
        updated: nowIso
      });

      if (res.error) throw res.error;
      if (!silent) {
        notifySuccess("Đã lưu nhân vật «" + (st.name || "Tân thủ") + "» (Ô " + (slotIdx + 1) + ") lên Supabase!");
      }
      return true;
    } catch (err) {
      notifyError("Lỗi khi lưu lên Supabase: " + formatNetError(err));
      return false;
    }
  }

  // Load a slot (0..2) from Supabase `saves` table into local machine
  async function loadSlotFromSupabase(slotIdx) {
    if (!checkInternetOrError()) return false;
    try {
      var client = await ensureSupabaseClient();
      if (!sbUser) {
        notifyError("Bạn cần đăng nhập tài khoản trước khi Tải từ Supabase!");
        return false;
      }
      if (!window.JXAdmin) return false;

      var res = await client
        .from("saves")
        .select("slot,name,lvl,fac,data,updated")
        .eq("owner", sbUser.id)
        .eq("slot", slotIdx)
        .maybeSingle();

      if (res.error) throw res.error;
      if (!res.data || !res.data.data) {
        notifyError("Ô nhân vật " + (slotIdx + 1) + " trên Supabase đang trống!");
        return false;
      }

      var rawData = res.data.data;
      var parsedWrapper = null;
      try {
        parsedWrapper = JSON.parse(rawData);
      } catch (e) {}

      var signedStr = parsedWrapper && parsedWrapper.v === 2 && typeof parsedWrapper.d === "string" ? parsedWrapper.d : rawData;
      var stashStr = parsedWrapper && parsedWrapper.v === 2 ? parsedWrapper.k : null;

      var decoded = window.JXAdmin.decodeSave(signedStr);
      if (!decoded || !decoded.state || !decoded.state.fac) {
        notifyError("Dữ liệu lưu trên đám mây không hợp lệ!");
        return false;
      }

      notifySuccess("Đang nạp nhân vật «" + (decoded.state.name || "Tân thủ") + "» từ Supabase...");
      setTimeout(function () {
        window.JXAdmin.applyCloudLoad(slotIdx, decoded.state, stashStr);
      }, 300);
      return true;
    } catch (err) {
      notifyError("Lỗi khi tải từ Supabase: " + formatNetError(err));
      return false;
    }
  }

  // Periodic Auto-Save when logged in (every 2 minutes)
  setInterval(function () {
    if (!sbUser) return;
    if (localStorage.getItem("jx_cloud_autosave") === "0") return;
    var st = window.JXAdmin && window.JXAdmin.getState();
    if (!st || !st.fac) return;
    saveSlotToSupabase(null, true);
  }, 120000);

  // Open the Cloud Save / Load Modal
  async function openCloudSaveModal() {
    var existing = document.getElementById("jxCloudSaveOverlay");
    if (existing) {
      existing.remove();
      return;
    }

    var overlay = document.createElement("div");
    overlay.id = "jxCloudSaveOverlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:99998;display:flex;align-items:center;justify-content:center;padding:12px;font-family:'IBM Plex Mono',monospace;color:#f3e5ab;";

    var box = document.createElement("div");
    box.style.cssText =
      "background:#121816;border:1px solid #38b28b;border-radius:8px;max-width:560px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.9);padding:16px;";
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.onclick = function (e) {
      if (e.target === overlay) overlay.remove();
    };

    function renderLoading(text) {
      box.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2b3832;padding-bottom:10px;margin-bottom:12px;">' +
        '  <b style="color:#7fffd4;font-size:16px;">☁ LƯU TRỮ ĐÁM MÂY (SUPABASE SAVE / LOAD)</b>' +
        '  <button id="clClose" style="background:#2a1f1f;color:#ff8080;border:1px solid #6b3030;border-radius:4px;padding:4px 9px;cursor:pointer;">✕</button>' +
        "</div>" +
        '<div style="padding:24px;text-align:center;color:#8fa399;">' + text + "</div>";
      box.querySelector("#clClose").onclick = function () {
        overlay.remove();
      };
    }

    if (!checkInternetOrError()) {
      renderLoading(
        '<div style="color:#ff6b6b;font-weight:bold;font-size:14px;margin-bottom:8px;">❌ Không có kết nối Internet!</div>' +
          '<div style="font-size:12px;">Vui lòng kiểm tra kết nối mạng trước khi đăng nhập hoặc Lưu/Tải dữ liệu từ Supabase.</div>'
      );
      return;
    }

    renderLoading("⏳ Đang kết nối máy chủ lưu trữ Supabase...");

    try {
      var client = await ensureSupabaseClient();
      var sess = await client.auth.getSession();
      sbUser = sess && sess.data && sess.data.session ? sess.data.session.user : null;
      updateCloudButtonsUI();
    } catch (err) {
      notifyError(formatNetError(err));
      renderLoading(
        '<div style="color:#ff6b6b;font-weight:bold;font-size:14px;margin-bottom:8px;">❌ Lỗi kết nối máy chủ Supabase!</div>' +
          '<div style="font-size:12px;">' + formatNetError(err) + "</div>"
      );
      return;
    }

    // If not logged in -> show Login / Register form
    if (!sbUser) {
      var savedUser = "";
      try {
        savedUser = localStorage.getItem("jx_cloud_user") || "";
      } catch (e) {}

      box.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2b3832;padding-bottom:10px;margin-bottom:12px;">' +
        '  <div><b style="color:#7fffd4;font-size:16px;">☁ ĐĂNG NHẬP LƯU TRỮ SUPABASE</b><div style="font-size:11px;color:#8fa399;">Đăng nhập để Save / Load nhân vật giữa các thiết bị</div></div>' +
        '  <button id="clClose" style="background:#2a1f1f;color:#ff8080;border:1px solid #6b3030;border-radius:4px;padding:4px 9px;cursor:pointer;">✕</button>' +
        "</div>" +
        '<div style="background:#17211d;border:1px solid #293d35;border-radius:6px;padding:14px;">' +
        '  <div style="margin-bottom:10px;font-size:12px;">' +
        '    <label style="display:block;margin-bottom:4px;color:#d6cfc2;font-weight:bold;">Tên tài khoản (3–16 ký tự chữ không dấu, số, _)</label>' +
        '    <input id="clUser" type="text" maxlength="16" value="' + savedUser + '" placeholder="Ví dụ: dokhach01" style="width:100%;padding:8px;background:#0c1210;color:#ffd24a;border:1px solid #3a5248;border-radius:4px;font-family:inherit;">' +
        "  </div>" +
        '  <div style="margin-bottom:12px;font-size:12px;">' +
        '    <label style="display:block;margin-bottom:4px;color:#d6cfc2;font-weight:bold;">Mật khẩu (ít nhất 6 ký tự)</label>' +
        '    <input id="clPass" type="password" maxlength="64" placeholder="••••••" style="width:100%;padding:8px;background:#0c1210;color:#ffd24a;border:1px solid #3a5248;border-radius:4px;font-family:inherit;">' +
        "  </div>" +
        '  <div id="clErr" style="color:#ff6b6b;font-size:12px;margin-bottom:10px;display:none;"></div>' +
        '  <div style="display:flex;gap:10px;">' +
        '    <button id="clBtnIn" style="flex:1;background:#38b28b;color:#081410;border:none;padding:9px;border-radius:5px;font-weight:bold;cursor:pointer;font-family:inherit;">🔑 Đăng Nhập</button>' +
        '    <button id="clBtnUp" style="flex:1;background:#243830;color:#7fffd4;border:1px solid #38b28b;padding:9px;border-radius:5px;font-weight:bold;cursor:pointer;font-family:inherit;">✨ Đăng Ký Mới</button>' +
        "  </div>" +
        "</div>";

      box.querySelector("#clClose").onclick = function () {
        overlay.remove();
      };

      var doAuth = async function (mode) {
        var errEl = box.querySelector("#clErr");
        errEl.style.display = "none";
        if (!checkInternetOrError()) {
          errEl.textContent = "❌ Không có kết nối Internet!";
          errEl.style.display = "block";
          return;
        }
        var u = String(box.querySelector("#clUser").value || "").trim().toLowerCase();
        var p = String(box.querySelector("#clPass").value || "");
        if (!/^[a-z0-9_]{3,16}$/.test(u)) {
          errEl.textContent = "❌ Tên tài khoản phải từ 3–16 ký tự (chữ không dấu, số, _)";
          errEl.style.display = "block";
          return;
        }
        if (p.length < 6) {
          errEl.textContent = "❌ Mật khẩu phải có ít nhất 6 ký tự";
          errEl.style.display = "block";
          return;
        }
        try {
          var client = await ensureSupabaseClient();
          var email = u + EMAIL_SUFFIX;
          var res =
            mode === "up"
              ? await client.auth.signUp({ email: email, password: p })
              : await client.auth.signInWithPassword({ email: email, password: p });
          if (res.error) throw res.error;
          if (!res.data || !res.data.session) {
            throw new Error("Tài khoản chưa kích hoạt phiên (hãy tắt Confirm Email trên Supabase)");
          }
          sbUser = res.data.session.user;
          try {
            localStorage.setItem("jx_cloud_user", u);
          } catch (e) {}
          updateCloudButtonsUI();
          notifySuccess((mode === "up" ? "Đăng ký" : "Đăng nhập") + " thành công tài khoản «" + u + "»!");
          overlay.remove();
          openCloudSaveModal();
        } catch (err) {
          var msg = formatNetError(err);
          errEl.textContent = "❌ " + msg;
          errEl.style.display = "block";
          notifyError(msg);
        }
      };

      box.querySelector("#clBtnIn").onclick = function () {
        doAuth("in");
      };
      box.querySelector("#clBtnUp").onclick = function () {
        doAuth("up");
      };
      return;
    }

    // Logged in -> Fetch 3 slots from Supabase `saves`
    var cloudRows = [];
    try {
      var qRes = await sbClient
        .from("saves")
        .select("slot,name,lvl,fac,updated")
        .eq("owner", sbUser.id)
        .order("slot");
      if (qRes.error) throw qRes.error;
      cloudRows = qRes.data || [];
    } catch (err) {
      notifyError("Không tải được danh sách bản lưu: " + formatNetError(err));
    }

    var activeSlot = window.JXAdmin && window.JXAdmin.getSlot ? window.JXAdmin.getSlot() : 0;
    var autoSaveOn = localStorage.getItem("jx_cloud_autosave") !== "0";

    var rowsHtml = [0, 1, 2]
      .map(function (sIdx) {
        var cRow = cloudRows.find(function (r) {
          return r.slot === sIdx;
        });
        var lState =
          sIdx === activeSlot && window.JXAdmin
            ? window.JXAdmin.getState()
            : window.JXAdmin && window.JXAdmin.getLocalSlot
            ? window.JXAdmin.getLocalSlot(sIdx)
            : null;
        var hasLocal = !!(lState && lState.fac);
        var localDesc = hasLocal
          ? '<b style="color:#ffd24a;">' +
            (lState.name || "Tân thủ") +
            "</b> · " +
            (FAC_NAMES[lState.fac] || lState.fac) +
            " Cấp " +
            (lState.lvl || 1)
          : '<span style="color:#6c7d76;">Trống</span>';

        var cloudDesc = cRow
          ? '<b style="color:#7fffd4;">' +
            (cRow.name || "Tân thủ") +
            "</b> · " +
            (FAC_NAMES[cRow.fac] || cRow.fac || "") +
            " Cấp " +
            (cRow.lvl || 1) +
            '<div style="font-size:10.5px;color:#8fa399;">Lưu lúc: ' +
            new Date(cRow.updated).toLocaleString("vi-VN") +
            "</div>"
          : '<span style="color:#6c7d76;">Chưa có trên Cloud</span>';

        return (
          '<tr style="border-bottom:1px solid #263530;' +
          (sIdx === activeSlot ? "background:#192822;" : "") +
          '">' +
          '<td style="padding:8px;"><b>Ô ' +
          (sIdx + 1) +
          (sIdx === activeSlot ? ' <span style="color:#ffd24a;">(Đang chơi)</span>' : "") +
          "</b></td>" +
          '<td style="padding:8px;">' +
          localDesc +
          "</td>" +
          '<td style="padding:8px;">' +
          cloudDesc +
          "</td>" +
          '<td style="padding:8px;white-space:nowrap;">' +
          (hasLocal
            ? '<button class="clSaveSlot" data-slot="' +
              sIdx +
              '" style="background:#c89b3c;color:#111;border:none;padding:5px 9px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:11px;margin-right:4px;">⬆ Save</button>'
            : "") +
          (cRow
            ? '<button class="clLoadSlot" data-slot="' +
              sIdx +
              '" style="background:#2b4c3f;color:#7fffd4;border:1px solid #458068;padding:5px 9px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:11px;">⬇ Load</button>'
            : "") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2b3832;padding-bottom:10px;margin-bottom:12px;">' +
      '  <div><b style="color:#7fffd4;font-size:16px;">☁ LƯU / TẢI ĐÁM MÂY (SUPABASE)</b><div style="font-size:11px;color:#8fa399;">Tài khoản: <b style="color:#ffd24a;">' +
      getUsername() +
      "</b> · Đồng bộ nhân vật & Kho chung</div></div>" +
      '  <div style="display:flex;gap:6px;">' +
      '    <button id="clLogout" style="background:#2a1f1f;color:#ff9999;border:1px solid #6b3030;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;">Đăng xuất</button>' +
      '    <button id="clClose" style="background:#2a1f1f;color:#ff8080;border:1px solid #6b3030;border-radius:4px;padding:4px 9px;cursor:pointer;">✕</button>' +
      "  </div>" +
      "</div>" +
      '<div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">' +
      '  <button id="clQuickSave" style="flex:1;background:#c89b3c;color:#111;border:none;padding:10px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;">⬆ LƯU NGAY LÊN SUPABASE (Ô ' +
      (activeSlot + 1) +
      ")</button>" +
      '  <button id="clQuickLoad" style="flex:1;background:#244237;color:#7fffd4;border:1px solid #38b28b;padding:10px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;">⬇ TẢI TỪ SUPABASE VỀ MÁY (Ô ' +
      (activeSlot + 1) +
      ")</button>" +
      "</div>" +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;background:#161f1c;border:1px solid #263530;border-radius:6px;margin-bottom:12px;">' +
      '  <thead><tr style="background:#0f1614;color:#ffd24a;text-align:left;"><th style="padding:8px;">Ô</th><th style="padding:8px;">Trên Máy Này</th><th style="padding:8px;">Trên Supabase Cloud</th><th style="padding:8px;">Thao Tác</th></tr></thead>' +
      "  <tbody>" +
      rowsHtml +
      "</tbody>" +
      "</table>" +
      '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:#8fa399;">' +
      '  <label style="cursor:pointer;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="clAutoSave" ' +
      (autoSaveOn ? "checked" : "") +
      '> Tự động lưu lên Supabase mỗi 2 phút</label>' +
      '  <span>🌐 Trạng thái: <b style="color:#7fffd4;">Đang kết nối</b></span>' +
      "</div>";

    box.querySelector("#clClose").onclick = function () {
      overlay.remove();
    };

    box.querySelector("#clLogout").onclick = async function () {
      try {
        await sbClient.auth.signOut();
      } catch (e) {}
      sbUser = null;
      updateCloudButtonsUI();
      notifySuccess("Đã đăng xuất khỏi tài khoản lưu trữ Supabase.");
      overlay.remove();
    };

    box.querySelector("#clAutoSave").onchange = function () {
      localStorage.setItem("jx_cloud_autosave", this.checked ? "1" : "0");
    };

    box.querySelector("#clQuickSave").onclick = async function () {
      this.disabled = true;
      this.textContent = "⏳ Đang lưu...";
      var ok = await saveSlotToSupabase(activeSlot, false);
      overlay.remove();
      if (ok) openCloudSaveModal();
    };

    box.querySelector("#clQuickLoad").onclick = async function () {
      this.disabled = true;
      this.textContent = "⏳ Đang tải...";
      await loadSlotFromSupabase(activeSlot);
    };

    var saveBtns = box.querySelectorAll(".clSaveSlot");
    for (var i = 0; i < saveBtns.length; i++) {
      saveBtns[i].onclick = async function () {
        var s = +this.getAttribute("data-slot");
        this.disabled = true;
        this.textContent = "...";
        var ok = await saveSlotToSupabase(s, false);
        overlay.remove();
        if (ok) openCloudSaveModal();
      };
    }

    var loadBtns = box.querySelectorAll(".clLoadSlot");
    for (var j = 0; j < loadBtns.length; j++) {
      loadBtns[j].onclick = async function () {
        var s = +this.getAttribute("data-slot");
        this.disabled = true;
        this.textContent = "...";
        await loadSlotFromSupabase(s);
      };
    }
  }

  // ===========================================================================
  // 2. ADMIN PANEL LIVE SYNC & SNAPSHOT
  // ===========================================================================
  function getSnapshot() {
    if (!window.JXAdmin) return null;
    var st = window.JXAdmin.getState() || {};
    var rates = window.JXAdmin.getRates() || {};
    var rw = (st.rw && st.rw.stat) || {};
    var mats = st.mats || {};
    return {
      slot: window.JXAdmin.getSlot ? window.JXAdmin.getSlot() : 0,
      rates: rates,
      dtInfo: window.JXAdmin.getDtInfo ? window.JXAdmin.getDtInfo() : null,
      player: {
        name: st.name || "Tân thủ",
        fac: st.fac || null,
        lvl: st.lvl || 1,
        xp: st.xp || 0,
        gold: st.gold || 0,
        knb: st.knb || 0,
        attrPts: st.attrPts || 0,
        skPts: st.skPts || 0,
        stage: st.stage || 1,
        maxStage: st.maxStage || 1,
        reborn: rw.reborn || 0,
        fd: (st.rw && st.rw.fd) || 0,
        misc: (mats && mats.misc) || {},
        ht: (mats && mats.ht) || {}
      }
    };
  }

  function broadcastSnapshot(note) {
    if (!bc) return;
    try {
      bc.postMessage({ type: "snapshot", data: getSnapshot(), note: note || "" });
    } catch (e) {}
  }

  function handleAdminCmd(msg) {
    if (!msg || !window.JXAdmin) return;
    if (msg.type === "ping") {
      broadcastSnapshot();
      return;
    }
    if (msg.type === "setRates" && msg.rates) {
      if (typeof msg.rates.soloMode === "boolean") {
        window.SOLO_MODE = msg.rates.soloMode;
        document.documentElement.classList.toggle("solomode", msg.rates.soloMode);
        document.documentElement.classList.toggle("ptclosed", msg.rates.soloMode);
      }
      window.JXAdmin.setRates(msg.rates);
      try {
        localStorage.setItem("jx_admin_cfg", JSON.stringify(msg.rates));
      } catch (e) {}
      window.JXAdmin.log(
        '<b style="color:#ffd24a">⚙ [Admin] Cập nhật máy chủ: EXP ×' +
          msg.rates.expRate +
          " · Ngân lượng ×" +
          msg.rates.goldRate +
          " · Rớt đồ ×" +
          msg.rates.dropRate +
          "</b>"
      );
      window.JXAdmin.toast("Đã áp dụng cấu hình Admin!");
      broadcastSnapshot("Đã cập nhật cấu hình máy chủ & Dã Tẩu");
      return;
    }
    if (msg.type === "rerollDt") {
      if (window.JXAdmin.rerollDtTask) {
        var rRes = window.JXAdmin.rerollDtTask();
        window.JXAdmin.toast(rRes.msg);
        if (rRes.ok) window.JXAdmin.log('<b style="color:#ffd24a">📜 [Admin] ' + rRes.msg + "</b>");
        broadcastSnapshot(rRes.msg);
      }
      return;
    }
    if (msg.type === "completeDt") {
      if (window.JXAdmin.completeDtTask) {
        var cRes = window.JXAdmin.completeDtTask();
        window.JXAdmin.toast(cRes.msg);
        if (cRes.ok) window.JXAdmin.log('<b style="color:#7fffd4">📜 [Admin] ' + cRes.msg + "</b>");
        broadcastSnapshot(cRes.msg);
      }
      return;
    }
    if (msg.type === "setPlayer" && msg.patch) {
      window.JXAdmin.setPlayer(msg.patch);
      window.JXAdmin.toast("Admin: Đã cập nhật chỉ số nhân vật!");
      broadcastSnapshot("Đã cập nhật nhân vật");
      return;
    }
    if (msg.type === "addMat") {
      window.JXAdmin.addMat(msg.cat, msg.key, msg.count);
      window.JXAdmin.toast("Admin: Đã thêm vật phẩm (" + msg.key + " ×" + msg.count + ")");
      broadcastSnapshot("Đã phát vật phẩm");
      return;
    }
    if (msg.type === "addBuff") {
      window.JXAdmin.addBuff(msg.key, msg.val, msg.mins);
      window.JXAdmin.toast("Admin: Đã kích hoạt Buff (" + msg.mins + " phút)");
      broadcastSnapshot("Đã kích hoạt Buff");
      return;
    }
    if (msg.type === "grantGoldItem") {
      var itemName = window.JXAdmin.grantGoldItem(msg.facOnly);
      if (itemName) {
        window.JXAdmin.log('<b style="color:#ffd24a">⚙ [Admin] Nhận trang bị Hoàng Kim: ' + itemName + "</b>");
        window.JXAdmin.toast("Nhận: " + itemName);
      } else {
        window.JXAdmin.toast("Không tìm thấy trang bị phù hợp (hãy vào phái trước)");
      }
      broadcastSnapshot("Đã phát trang bị Hoàng Kim");
      return;
    }
    if (msg.type === "spawnGoldBoss") {
      if (window.JXAdmin.spawnGoldBoss) {
        var res = window.JXAdmin.spawnGoldBoss(msg.tier || 1, !!msg.free);
        window.JXAdmin.toast(res.msg);
        broadcastSnapshot(res.msg);
      }
      return;
    }
  }

  if (bc) {
    bc.onmessage = function (ev) {
      handleAdminCmd(ev.data);
    };
  }

  window.addEventListener("storage", function (ev) {
    if (ev.key === "jx_admin_cfg" && ev.newValue && window.JXAdmin) {
      try {
        var cfg = JSON.parse(ev.newValue);
        window.JXAdmin.setRates(cfg);
      } catch (e) {}
    }
  });

  function applySavedRatesOnBoot() {
    if (!window.JXAdmin) return;
    try {
      var raw = localStorage.getItem("jx_admin_cfg");
      if (raw) {
        var cfg = JSON.parse(raw);
        window.JXAdmin.setRates(cfg);
      }
    } catch (e) {}
    broadcastSnapshot();
  }

  // ===========================================================================
  // 3. ĐẤU TRƯỜNG SĂN BOSS HOÀNG KIM (SOLO BOSS HUNT MODAL)
  // ===========================================================================
  function fmtSec(sec) {
    sec = Math.max(0, Math.floor(+sec || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + " phút " + (s < 10 ? "0" + s : s) + " giây";
  }

  function openGoldBossHuntModal() {
    if (!window.JXAdmin || !window.JXAdmin.getGoldBossInfo) return;
    var existing = document.getElementById("jxGoldBossOverlay");
    if (existing) {
      existing.remove();
      return;
    }

    var info = window.JXAdmin.getGoldBossInfo();
    var overlay = document.createElement("div");
    overlay.id = "jxGoldBossOverlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99998;display:flex;align-items:center;justify-content:center;padding:12px;font-family:'IBM Plex Mono',monospace;color:#f3e5ab;";

    var cdText = info.alive
      ? '<span style="color:#ff5252;font-weight:bold;">🔥 Boss Hoàng Kim đang xuất hiện ngoài bãi!</span>'
      : info.gbT <= 0
      ? '<span style="color:#7fffd4;font-weight:bold;">✅ Đã sẵn sàng triệu hồi MIỄN PHÍ!</span>'
      : '<span style="color:#ffd24a;">⏳ Tự xuất hiện sau: <b>' + fmtSec(info.gbT) + "</b></span>";

    overlay.innerHTML =
      '<div style="background:#121816;border:1px solid #c89b3c;border-radius:8px;max-width:580px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.9);padding:16px;">' +
      '  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #2b3832;padding-bottom:10px;margin-bottom:12px;">' +
      '    <div><b style="color:#ffd24a;font-size:16px;">🐉 ĐẤU TRƯỜNG SĂN BOSS HOÀNG KIM (SOLO)</b><div style="font-size:11px;color:#8fa399;">Khiêu chiến Thập Đại Cao Thủ Hoàng Kim ngay tại bãi luyện công</div></div>' +
      '    <button id="gbClose" style="background:#2a1f1f;color:#ff8080;border:1px solid #6b3030;border-radius:4px;padding:4px 9px;cursor:pointer;font-size:13px;">✕</button>' +
      "  </div>" +
      '  <div style="background:#17211d;border:1px solid #2a3d35;border-radius:6px;padding:10px 12px;margin-bottom:12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:12px;">' +
      "    <div>" + cdText + "</div>" +
      '    <div style="color:#b8ccc2;">Đã hạ: <b style="color:#ffd24a;">' + info.killed + '</b> · Lệnh bài ST: <b style="color:#7fffd4;">' + info.lb + '</b> · Phúc duyên: <b style="color:#ffae42;">' + info.fd + "</b></div>" +
      "  </div>" +
      '  <div style="background:#18211e;border:1px solid #354a41;border-left:4px solid #ffd24a;border-radius:6px;padding:12px;margin-bottom:10px;">' +
      '    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
      "      <div>" +
      '        <b style="color:#ffd24a;font-size:14px;">1. Trùm Hoàng Kim Dã Ngoại (Máu ×2 · Công ×1.15)</b>' +
      '        <div style="font-size:11.5px;color:#b8ccc2;margin-top:4px;">🎁 Phần thưởng: <b>1 Đồ Hoàng Kim ngẫu nhiên</b> + <b>5 KNB</b> + 15 Phúc Duyên + 1–3 Thần Bí Khoáng Thạch</div>' +
      "      </div>" +
      '      <button class="gbSpawnBtn" data-tier="1" style="background:#c89b3c;color:#111;border:none;padding:8px 12px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;white-space:nowrap;">' +
      (info.gbT <= 0 ? "⚔ Gọi Miễn Phí" : "⚔ Gọi Ngay (5 Vạn)") +
      "</button>" +
      "    </div>" +
      "  </div>" +
      '  <div style="background:#18211e;border:1px solid #4a3928;border-left:4px solid #ff9f43;border-radius:6px;padding:12px;margin-bottom:10px;">' +
      '    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
      "      <div>" +
      '        <b style="color:#ff9f43;font-size:14px;">2. Đại Boss Hoàng Kim Môn Phái (Máu ×3 · Công ×1.25)</b>' +
      '        <div style="font-size:11.5px;color:#b8ccc2;margin-top:4px;">🎁 Phần thưởng: <b>100% 1 Đồ Hoàng Kim ĐÚNG MÔN PHÁI</b> + <b>15 KNB</b> + 25 Phúc Duyên + 2 Huyền Tinh + 45% rơi <b>Bí Kíp 90</b></div>' +
      '        <div style="font-size:11px;color:#8fa399;margin-top:2px;">Chi phí: <b>1 Lệnh Bài Sát Thủ</b> (ưu tiên) hoặc <b>20 Phúc Duyên</b></div>' +
      "      </div>" +
      '      <button class="gbSpawnBtn" data-tier="2" style="background:#e67e22;color:#111;border:none;padding:8px 12px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;white-space:nowrap;">🔥 Khiêu Chiến</button>' +
      "    </div>" +
      "  </div>" +
      '  <div style="background:#18211e;border:1px solid #592828;border-left:4px solid #ff5252;border-radius:6px;padding:12px;margin-bottom:12px;">' +
      '    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
      "      <div>" +
      '        <b style="color:#ff5252;font-size:14px;">3. Tuyệt Thế Thập Đại Hoàng Kim (Máu ×5 · Công ×1.4)</b>' +
      '        <div style="font-size:11.5px;color:#b8ccc2;margin-top:4px;">🎁 Phần thưởng: <b>2 Đồ Hoàng Kim (1 Đúng Phái + 1 An Bang/Định Quốc)</b> + <b>35 KNB</b> + <b>1 Rương Ngựa</b> + 50 Phúc Duyên + 3 Huyền Tinh</div>' +
      '        <div style="font-size:11px;color:#8fa399;margin-top:2px;">Chi phí: <b>50 Phúc Duyên</b> (ưu tiên) hoặc <b>30 Vạn Lượng</b></div>' +
      "      </div>" +
      '      <button class="gbSpawnBtn" data-tier="3" style="background:#e05252;color:#fff;border:none;padding:8px 12px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;white-space:nowrap;">👑 Quyết Chiến</button>' +
      "    </div>" +
      "  </div>" +
      '  <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:#8fa399;padding-top:6px;border-top:1px solid #263530;">' +
      '    <span>💡 Mẹo: Hãy bật ưu tiên mục tiêu "Boss Hoàng Kim" trong Trợ Thủ để nhân vật dồn sát thương vào Boss!</span>' +
      '    <a href="guide.html#goldboss" target="_blank" style="color:#ffd24a;text-decoration:none;font-weight:bold;white-space:nowrap;margin-left:8px;">📖 Xem Cẩm Nang</a>' +
      "  </div>" +
      "</div>";

    document.body.appendChild(overlay);

    overlay.querySelector("#gbClose").onclick = function () {
      overlay.remove();
    };
    overlay.onclick = function (e) {
      if (e.target === overlay) overlay.remove();
    };

    var btns = overlay.querySelectorAll(".gbSpawnBtn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].onclick = function () {
        var tier = +this.getAttribute("data-tier") || 1;
        var res = window.JXAdmin.spawnGoldBoss(tier, false);
        window.JXAdmin.toast(res.msg);
        if (res.ok) overlay.remove();
      };
    }
  }

  // ===========================================================================
  // 4. QUICK IN-GAME ADMIN MODAL
  // ===========================================================================
  function openQuickAdminModal() {
    if (!window.JXAdmin) return;
    var existing = document.getElementById("jxQuickAdminOverlay");
    if (existing) {
      existing.remove();
      return;
    }

    var snap = getSnapshot();
    var r = snap.rates;
    var p = snap.player;
    var dt = r.dtTypes || { killm: 50, elite: 25, boss: 15, gold: 10, item: 0, mat: 0 };
    var dtInfo = snap.dtInfo;

    var overlay = document.createElement("div");
    overlay.id = "jxQuickAdminOverlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px;font-family:'IBM Plex Mono',monospace;color:#f3e5ab;";

    overlay.innerHTML =
      '<div style="background:#121816;border:1px solid #c89b3c;border-radius:8px;max-width:580px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.85);padding:16px;">' +
      '  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #2b3832;padding-bottom:10px;margin-bottom:12px;">' +
      '    <div><b style="color:#ffd24a;font-size:16px;">⚙ BẢNG ĐIỀU KHIỂN ADMIN NHANH</b><div style="font-size:11px;color:#8fa399;">Chỉnh trực tiếp thông số máy chủ, Dã Tẩu & nhân vật</div></div>' +
      '    <div style="display:flex;gap:8px;align-items:center;">' +
      '      <a href="admin.html" target="_blank" style="background:#2b4c3f;color:#7fffd4;border:1px solid #458068;padding:5px 10px;border-radius:4px;text-decoration:none;font-size:12px;font-weight:bold;">↗ Mở Trang Admin Đầy Đủ</a>' +
      '      <button id="qaClose" style="background:#2a1f1f;color:#ff8080;border:1px solid #6b3030;border-radius:4px;padding:4px 9px;cursor:pointer;font-size:13px;">✕</button>' +
      "    </div>" +
      "  </div>" +
      '  <div style="background:#18211e;border:1px solid #263530;border-radius:6px;padding:12px;margin-bottom:10px;">' +
      '    <div style="color:#ffd24a;font-weight:bold;font-size:13px;margin-bottom:8px;">⚡ TỐC ĐỘ & TỶ LỆ MÁY CHỦ (ÁP DỤNG TỨC THÌ)</div>' +
      '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">' +
      '      <label>Hệ số EXP (1.5 = ~30p lên cấp 20)<input id="qaExp" type="number" step="0.1" min="0.1" value="' + r.expRate + '" style="width:100%;margin-top:4px;padding:6px;background:#0d1311;color:#ffd24a;border:1px solid #3a4f47;border-radius:4px;font-weight:bold;"></label>' +
      '      <label>Hệ số Ngân lượng rơi (Gold)<input id="qaGoldR" type="number" step="0.5" min="0.1" value="' + r.goldRate + '" style="width:100%;margin-top:4px;padding:6px;background:#0d1311;color:#ffd24a;border:1px solid #3a4f47;border-radius:4px;font-weight:bold;"></label>' +
      '      <label>Hệ số Rớt đồ & Nguyên liệu<input id="qaDropR" type="number" step="0.5" min="0.1" value="' + r.dropRate + '" style="width:100%;margin-top:4px;padding:6px;background:#0d1311;color:#ffd24a;border:1px solid #3a4f47;border-radius:4px;font-weight:bold;"></label>' +
      '      <label>Tốc độ ra quái (Spawn Speed)<input id="qaSpawn" type="number" step="0.1" min="0.5" max="5" value="' + r.spawnSpeed + '" style="width:100%;margin-top:4px;padding:6px;background:#0d1311;color:#ffd24a;border:1px solid #3a4f47;border-radius:4px;font-weight:bold;"></label>' +
      "    </div>" +
      '    <div style="margin-top:10px;padding-top:8px;border-top:1px solid #263530;">' +
      '      <div style="color:#ffd24a;font-weight:bold;font-size:12px;margin-bottom:6px;">📜 BẬT / TẮT LOẠI NHIỆM VỤ DÃ TẨU:</div>' +
      '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11.5px;">' +
      '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" class="qaDtChk" data-k="killm" data-w="50" ' + (dt.killm > 0 ? "checked" : "") + '> ⚔️ Săn quái thường</label>' +
      '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" class="qaDtChk" data-k="elite" data-w="25" ' + (dt.elite > 0 ? "checked" : "") + '> 💀 Diệt Tinh Anh</label>' +
      '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" class="qaDtChk" data-k="boss" data-w="15" ' + (dt.boss > 0 ? "checked" : "") + '> 👹 Hạ Trùm (Lv30+, ×1.5)</label>' +
      '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" class="qaDtChk" data-k="gold" data-w="10" ' + (dt.gold > 0 ? "checked" : "") + '> 💰 Nộp Ngân lượng</label>' +
      '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" class="qaDtChk" data-k="item" data-w="20" ' + (dt.item > 0 ? "checked" : "") + '> 📜 Tìm Trang bị (×1.5)</label>' +
      '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" class="qaDtChk" data-k="mat" data-w="15" ' + (dt.mat > 0 ? "checked" : "") + '> 💎 Nộp Huyền Tinh</label>' +
      "      </div>" +
      (dtInfo && dtInfo.task
        ? '<div style="margin-top:6px;font-size:11px;color:#8fa399;display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;"><span>Đang nhận: <b style="color:#7fffd4;" id="qaDtCur">' +
          dtInfo.task +
          '</b></span><div style="display:flex;gap:4px;"><button id="qaDtReroll" style="background:#23332c;color:#f3e5ab;border:1px solid #3d594d;padding:3px 7px;border-radius:4px;cursor:pointer;font-size:11px;">🎲 Đổi NV</button><button id="qaDtDone" style="background:#233b28;color:#7dff7d;border:1px solid #3d6b46;padding:3px 7px;border-radius:4px;cursor:pointer;font-size:11px;">✅ Xong ngay</button></div></div>'
        : "") +
      "    </div>" +
      '    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">' +
      '      <button class="qaPreset" data-exp="1" style="background:#1e2925;color:#ccc;border:1px solid #384d45;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">EXP ×1 (Chuẩn)</button>' +
      '      <button class="qaPreset" data-exp="1.5" style="background:#2d3b22;color:#b8ff70;border:1px solid #55733d;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">EXP ×1.5 (~30p Lv20)</button>' +
      '      <button class="qaPreset" data-exp="2" style="background:#1e2925;color:#ccc;border:1px solid #384d45;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">EXP ×2 (~20p Lv20)</button>' +
      '      <button class="qaPreset" data-exp="5" style="background:#1e2925;color:#ccc;border:1px solid #384d45;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">EXP ×5</button>' +
      '      <button id="qaSaveRates" style="margin-left:auto;background:#c89b3c;color:#111;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">💾 Lưu Cấu Hình</button>' +
      "    </div>" +
      "  </div>" +
      '  <div style="background:#18211e;border:1px solid #263530;border-radius:6px;padding:12px;margin-bottom:12px;">' +
      '    <div style="color:#ffd24a;font-weight:bold;font-size:13px;margin-bottom:8px;">🧙‍♂️ CHỈNH NHANH NHÂN VẬT: ' + p.name + " (Cấp " + p.lvl + ")</div>" +
      '    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px;margin-bottom:10px;">' +
      '      <label>Cấp độ (1-200)<input id="qaLvl" type="number" min="1" max="200" value="' + p.lvl + '" style="width:100%;margin-top:4px;padding:5px;background:#0d1311;color:#fff;border:1px solid #3a4f47;border-radius:4px;"></label>' +
      '      <label>Trùng sinh (0-10)<input id="qaReborn" type="number" min="0" max="10" value="' + p.reborn + '" style="width:100%;margin-top:4px;padding:5px;background:#0d1311;color:#fff;border:1px solid #3a4f47;border-radius:4px;"></label>' +
      '      <label>Mở Map tối đa<input id="qaMaxStage" type="number" min="1" max="300" value="' + p.maxStage + '" style="width:100%;margin-top:4px;padding:5px;background:#0d1311;color:#fff;border:1px solid #3a4f47;border-radius:4px;"></label>' +
      "    </div>" +
      '    <div style="display:flex;gap:6px;flex-wrap:wrap;">' +
      '      <button id="qaApplyChar" style="background:#3a6df0;color:#fff;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;">Áp dụng Cấp/Map</button>' +
      '      <button data-gold="100000" class="qaAddGold" style="background:#2b2618;color:#ffd24a;border:1px solid #665222;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:11px;">+10 Vạn Lượng</button>' +
      '      <button data-gold="1000000" class="qaAddGold" style="background:#2b2618;color:#ffd24a;border:1px solid #665222;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:11px;">+100 Vạn Lượng</button>' +
      '      <button data-knb="500" class="qaAddKnb" style="background:#2b1d28;color:#ff99e6;border:1px solid #6b325c;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:11px;">+500 KNB</button>' +
      '      <button data-knb="5000" class="qaAddKnb" style="background:#2b1d28;color:#ff99e6;border:1px solid #6b325c;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:11px;">+5,000 KNB</button>' +
      '      <button id="qaGiveHkmp" style="background:#382614;color:#ffae42;border:1px solid #8a5a24;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:11px;">+1 Đồ HKMP</button>' +
      '      <button id="qaSpawnBoss" style="background:#3a1818;color:#ff8080;border:1px solid #803030;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:11px;">🐉 Gọi Boss HK (Free)</button>' +
      "    </div>" +
      "  </div>" +
      '  <div style="font-size:11px;color:#8fa399;text-align:center;">Mẹo: Bấm <b>Ctrl + Shift + A</b> để đóng/mở nhanh bảng này · <a href="guide.html" target="_blank" style="color:#7fffd4;">📖 Cẩm Nang Tân Thủ</a> · <a href="admin.html" target="_blank" style="color:#ffd24a;">⚙ Trang Admin Đầy Đủ</a></div>' +
      "</div>";

    document.body.appendChild(overlay);

    overlay.querySelector("#qaClose").onclick = function () {
      overlay.remove();
    };
    overlay.onclick = function (e) {
      if (e.target === overlay) overlay.remove();
    };

    var presets = overlay.querySelectorAll(".qaPreset");
    for (var i = 0; i < presets.length; i++) {
      presets[i].onclick = function () {
        overlay.querySelector("#qaExp").value = this.getAttribute("data-exp");
      };
    }

    var btnReroll = overlay.querySelector("#qaDtReroll");
    if (btnReroll) {
      btnReroll.onclick = function () {
        handleAdminCmd({ type: "rerollDt" });
        var info2 = window.JXAdmin.getDtInfo && window.JXAdmin.getDtInfo();
        var curEl = overlay.querySelector("#qaDtCur");
        if (curEl && info2) curEl.textContent = info2.task || "Hết lượt";
      };
    }

    var btnDone = overlay.querySelector("#qaDtDone");
    if (btnDone) {
      btnDone.onclick = function () {
        handleAdminCmd({ type: "completeDt" });
        var info2 = window.JXAdmin.getDtInfo && window.JXAdmin.getDtInfo();
        var curEl = overlay.querySelector("#qaDtCur");
        if (curEl && info2) curEl.textContent = info2.task || "Hết lượt";
      };
    }

    overlay.querySelector("#qaSaveRates").onclick = function () {
      var cur = window.JXAdmin.getRates();
      cur.expRate = Math.max(0.1, +overlay.querySelector("#qaExp").value || 1.5);
      cur.goldRate = Math.max(0.1, +overlay.querySelector("#qaGoldR").value || 1);
      cur.dropRate = Math.max(0.1, +overlay.querySelector("#qaDropR").value || 1);
      cur.spawnSpeed = Math.max(0.5, +overlay.querySelector("#qaSpawn").value || 1);
      var newDt = {};
      var dtChks = overlay.querySelectorAll(".qaDtChk");
      for (var c = 0; c < dtChks.length; c++) {
        var k = dtChks[c].getAttribute("data-k");
        var w = +dtChks[c].getAttribute("data-w") || 15;
        newDt[k] = dtChks[c].checked ? (cur.dtTypes && cur.dtTypes[k] > 0 ? cur.dtTypes[k] : w) : 0;
      }
      cur.dtTypes = newDt;
      handleAdminCmd({ type: "setRates", rates: cur });
      var info2 = window.JXAdmin.getDtInfo && window.JXAdmin.getDtInfo();
      var curEl = overlay.querySelector("#qaDtCur");
      if (curEl && info2) curEl.textContent = info2.task || "Hết lượt";
    };

    overlay.querySelector("#qaApplyChar").onclick = function () {
      handleAdminCmd({
        type: "setPlayer",
        patch: {
          lvl: +overlay.querySelector("#qaLvl").value || 1,
          reborn: +overlay.querySelector("#qaReborn").value || 0,
          maxStage: +overlay.querySelector("#qaMaxStage").value || 1,
          heal: true
        }
      });
    };

    var goldBtns = overlay.querySelectorAll(".qaAddGold");
    for (var j = 0; j < goldBtns.length; j++) {
      goldBtns[j].onclick = function () {
        handleAdminCmd({ type: "setPlayer", patch: { addGold: +this.getAttribute("data-gold") } });
      };
    }

    var knbBtns = overlay.querySelectorAll(".qaAddKnb");
    for (var k = 0; k < knbBtns.length; k++) {
      knbBtns[k].onclick = function () {
        handleAdminCmd({ type: "setPlayer", patch: { addKnb: +this.getAttribute("data-knb") } });
      };
    }

    overlay.querySelector("#qaGiveHkmp").onclick = function () {
      handleAdminCmd({ type: "grantGoldItem", facOnly: true });
    };

    overlay.querySelector("#qaSpawnBoss").onclick = function () {
      handleAdminCmd({ type: "spawnGoldBoss", tier: 2, free: true });
      overlay.remove();
    };
  }

  function injectSoloButtons() {
    // 1. Mobile / Standard header bar (#top)
    var topBar = document.getElementById("top");
    if (topBar && !document.getElementById("adminBtn")) {
      var compactBtn = document.getElementById("compactBtn");

      var cloudBtn = document.createElement("button");
      cloudBtn.id = "soloCloudBtn";
      cloudBtn.title = "Lưu / Tải Đám Mây (Supabase Save/Load)";
      cloudBtn.textContent = "☁";
      cloudBtn.style.cssText =
        "background:#14222b;color:#9ec5ff;border:1px solid #4a607a;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:13px;margin-left:3px;";
      cloudBtn.onclick = openCloudSaveModal;

      var bossBtn = document.createElement("button");
      bossBtn.id = "soloBossBtn";
      bossBtn.title = "Đấu Trường Săn Boss Hoàng Kim";
      bossBtn.textContent = "🐉";
      bossBtn.style.cssText =
        "background:#2a1d12;color:#ffd24a;border:1px solid #99652a;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:13px;margin-left:3px;";
      bossBtn.onclick = openGoldBossHuntModal;

      var guideBtn = document.createElement("button");
      guideBtn.id = "soloGuideBtn";
      guideBtn.title = "Cẩm Nang Tân Thủ & Lộ Trình Độc Hành";
      guideBtn.textContent = "📖";
      guideBtn.style.cssText =
        "background:#152620;color:#7fffd4;border:1px solid #356b56;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:13px;margin-left:3px;";
      guideBtn.onclick = function () {
        window.open("guide.html", "_blank");
      };

      var adminBtn = document.createElement("button");
      adminBtn.id = "adminBtn";
      adminBtn.title = "Admin Panel (Ctrl+Shift+A)";
      adminBtn.textContent = "⚙";
      adminBtn.style.cssText =
        "background:#231d12;color:#ffd24a;border:1px solid #8a6d2b;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:13px;margin-left:3px;";
      adminBtn.onclick = openQuickAdminModal;

      if (compactBtn && compactBtn.parentNode === topBar) {
        topBar.insertBefore(cloudBtn, compactBtn);
        topBar.insertBefore(bossBtn, compactBtn);
        topBar.insertBefore(guideBtn, compactBtn);
        topBar.insertBefore(adminBtn, compactBtn);
      } else {
        topBar.appendChild(cloudBtn);
        topBar.appendChild(bossBtn);
        topBar.appendChild(guideBtn);
        topBar.appendChild(adminBtn);
      }
      updateCloudButtonsUI();
    }

    // 2. Desktop UI (#u20r right button column)
    var u20r = document.getElementById("u20r");
    if (u20r && !document.getElementById("u20bossHunt")) {
      u20r.style.flexWrap = "wrap";
      u20r.style.justifyContent = "flex-end";
      u20r.style.maxWidth = "152px";
      var bCloud = document.createElement("button");
      bCloud.className = "u20rb";
      bCloud.id = "u20cloudSave";
      bCloud.innerHTML = sbUser ? "☁ Lưu<br>Cloud" : "☁ Đăng<br>Nhập";
      bCloud.title = "Lưu / Tải nhân vật trên Supabase Cloud";
      bCloud.onclick = openCloudSaveModal;
      u20r.appendChild(bCloud);

      var bHunt = document.createElement("button");
      bHunt.className = "u20rb";
      bHunt.id = "u20bossHunt";
      bHunt.innerHTML = "Săn<br>Boss";
      bHunt.title = "Đấu Trường Săn Boss Hoàng Kim";
      bHunt.onclick = openGoldBossHuntModal;
      u20r.appendChild(bHunt);

      var bGuide = document.createElement("button");
      bGuide.className = "u20rb";
      bGuide.id = "u20guide";
      bGuide.innerHTML = "Cẩm<br>Nang";
      bGuide.title = "Cẩm Nang Tân Thủ & Lộ Trình Chơi Đơn";
      bGuide.onclick = function () {
        window.open("guide.html", "_blank");
      };
      u20r.appendChild(bGuide);
    }

    // 3. Character Select Screen (#csel .cs-small) -> Add "☁ Lưu / Tải Supabase" button
    var csSmall = document.querySelector("#csel .cs-small");
    if (csSmall && !document.getElementById("csCloudBtn")) {
      var csBtn = document.createElement("button");
      csBtn.id = "csCloudBtn";
      csBtn.textContent = sbUser ? "☁ Lưu / Tải Supabase (" + getUsername() + ")" : "☁ Đăng nhập Supabase";
      csBtn.onclick = openCloudSaveModal;
      csSmall.appendChild(csBtn);
    }

    // 4. System Tab (#t-more #bDl) -> Add "☁ Lưu / Tải Supabase" button right next to "Tải file lưu (.jxsave)"
    var bDl = document.getElementById("bDl");
    if (bDl && bDl.parentNode && !document.getElementById("bSysCloud")) {
      var sysCloudBtn = document.createElement("button");
      sysCloudBtn.className = "btn on";
      sysCloudBtn.id = "bSysCloud";
      sysCloudBtn.textContent = "☁ Lưu / Tải Đám Mây (Supabase)";
      sysCloudBtn.onclick = openCloudSaveModal;
      bDl.parentNode.insertBefore(sysCloudBtn, bDl);
    }
  }

  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
      e.preventDefault();
      openQuickAdminModal();
    }
  });

  function initBridge() {
    injectSoloButtons();
    applySavedRatesOnBoot();
    initCloudAuth();
    setInterval(injectSoloButtons, 800);
    if (location.search.indexOf("admin=1") !== -1) openQuickAdminModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBridge);
  } else {
    initBridge();
  }
})();
