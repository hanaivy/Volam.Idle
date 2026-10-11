// =============================================================================
// ADMIN BRIDGE & IN-GAME QUICK ADMIN MODAL (VÕ LÂM IDLE)
// Kết nối thời gian thực giữa trang /admin.html và tab game đang chạy,
// đồng thời cung cấp cửa sổ Admin nhanh ngay trong game (nút ⚙ hoặc Ctrl+Shift+A).
// =============================================================================
(function () {
  "use strict";

  var bc = null;
  try {
    bc = new BroadcastChannel("jx_admin_channel");
  } catch (e) {}

  function getSnapshot() {
    if (!window.JXAdmin) return null;
    var st = window.JXAdmin.getState() || {};
    var rates = window.JXAdmin.getRates() || {};
    var rw = (st.rw && st.rw.stat) || {};
    var mats = st.mats || {};
    return {
      slot: window.JXAdmin.getSlot ? window.JXAdmin.getSlot() : 0,
      rates: rates,
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
      broadcastSnapshot("Đã cập nhật tỷ lệ máy chủ");
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
        window.JXAdmin.toast("Đã đồng bộ tỷ lệ máy chủ từ Admin Panel!");
      } catch (e) {}
    }
  });

  // Apply stored rates once JXAdmin is ready
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

  // Quick In-Game Admin Modal
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

    var overlay = document.createElement("div");
    overlay.id = "jxQuickAdminOverlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px;font-family:'IBM Plex Mono',monospace;color:#f3e5ab;";

    overlay.innerHTML =
      '<div style="background:#121816;border:1px solid #c89b3c;border-radius:8px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.85);padding:16px;">' +
      '  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #2b3832;padding-bottom:10px;margin-bottom:12px;">' +
      '    <div><b style="color:#ffd24a;font-size:16px;">⚙ BẢNG ĐIỀU KHIỂN ADMIN NHANH</b><div style="font-size:11px;color:#8fa399;">Chỉnh trực tiếp thông số máy chủ & nhân vật</div></div>' +
      '    <div style="display:flex;gap:8px;align-items:center;">' +
      '      <a href="admin.html" target="_blank" style="background:#2b4c3f;color:#7fffd4;border:1px solid #458068;padding:5px 10px;border-radius:4px;text-decoration:none;font-size:12px;font-weight:bold;">↗ Mở Trang Admin Đầy Đủ</a>' +
      '      <button id="qaClose" style="background:#2a1f1f;color:#ff8080;border:1px solid #6b3030;border-radius:4px;padding:4px 9px;cursor:pointer;font-size:13px;">✕</button>' +
      "    </div>" +
      "  </div>" +
      '  <div style="background:#18211e;border:1px solid #263530;border-radius:6px;padding:12px;margin-bottom:12px;">' +
      '    <div style="color:#ffd24a;font-weight:bold;font-size:13px;margin-bottom:8px;">⚡ TỐC ĐỘ & TỶ LỆ MÁY CHỦ (ÁP DỤNG TỨC THÌ)</div>' +
      '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">' +
      '      <label>Hệ số EXP (1.5 = ~30p lên cấp 20)<input id="qaExp" type="number" step="0.1" min="0.1" value="' + r.expRate + '" style="width:100%;margin-top:4px;padding:6px;background:#0d1311;color:#ffd24a;border:1px solid #3a4f47;border-radius:4px;font-weight:bold;"></label>' +
      '      <label>Hệ số Ngân lượng rơi (Gold)<input id="qaGoldR" type="number" step="0.5" min="0.1" value="' + r.goldRate + '" style="width:100%;margin-top:4px;padding:6px;background:#0d1311;color:#ffd24a;border:1px solid #3a4f47;border-radius:4px;font-weight:bold;"></label>' +
      '      <label>Hệ số Rớt đồ & Nguyên liệu<input id="qaDropR" type="number" step="0.5" min="0.1" value="' + r.dropRate + '" style="width:100%;margin-top:4px;padding:6px;background:#0d1311;color:#ffd24a;border:1px solid #3a4f47;border-radius:4px;font-weight:bold;"></label>' +
      '      <label>Tốc độ ra quái (Spawn Speed)<input id="qaSpawn" type="number" step="0.1" min="0.5" max="5" value="' + r.spawnSpeed + '" style="width:100%;margin-top:4px;padding:6px;background:#0d1311;color:#ffd24a;border:1px solid #3a4f47;border-radius:4px;font-weight:bold;"></label>' +
      "    </div>" +
      '    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">' +
      '      <button class="qaPreset" data-exp="1" style="background:#1e2925;color:#ccc;border:1px solid #384d45;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">EXP ×1 (Chuẩn)</button>' +
      '      <button class="qaPreset" data-exp="1.5" style="background:#2d3b22;color:#b8ff70;border:1px solid #55733d;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">EXP ×1.5 (~30p Lv20)</button>' +
      '      <button class="qaPreset" data-exp="2" style="background:#1e2925;color:#ccc;border:1px solid #384d45;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">EXP ×2 (~20p Lv20)</button>' +
      '      <button class="qaPreset" data-exp="5" style="background:#1e2925;color:#ccc;border:1px solid #384d45;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">EXP ×5</button>' +
      '      <button class="qaPreset" data-exp="10" style="background:#1e2925;color:#ccc;border:1px solid #384d45;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">EXP ×10</button>' +
      '      <button id="qaSaveRates" style="margin-left:auto;background:#c89b3c;color:#111;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">💾 Lưu Tỷ Lệ</button>' +
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
      "    </div>" +
      "  </div>" +
      '  <div style="font-size:11px;color:#8fa399;text-align:center;">Mẹo: Bấm <b>Ctrl + Shift + A</b> bất cứ lúc nào để đóng/mở nhanh bảng này, hoặc mở trang <a href="admin.html" target="_blank" style="color:#ffd24a;">/admin.html</a> để dùng đầy đủ tính năng.</div>' +
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

    overlay.querySelector("#qaSaveRates").onclick = function () {
      var cur = window.JXAdmin.getRates();
      cur.expRate = Math.max(0.1, +overlay.querySelector("#qaExp").value || 1.5);
      cur.goldRate = Math.max(0.1, +overlay.querySelector("#qaGoldR").value || 1);
      cur.dropRate = Math.max(0.1, +overlay.querySelector("#qaDropR").value || 1);
      cur.spawnSpeed = Math.max(0.5, +overlay.querySelector("#qaSpawn").value || 1);
      handleAdminCmd({ type: "setRates", rates: cur });
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
  }

  function injectAdminButton() {
    var topBar = document.getElementById("top");
    if (!topBar || document.getElementById("adminBtn")) return;
    var btn = document.createElement("button");
    btn.id = "adminBtn";
    btn.title = "Admin Panel (Ctrl+Shift+A)";
    btn.textContent = "⚙";
    btn.style.cssText =
      "background:#231d12;color:#ffd24a;border:1px solid #8a6d2b;border-radius:4px;padding:2px 7px;cursor:pointer;font-size:13px;margin-left:4px;";
    btn.onclick = openQuickAdminModal;
    var compactBtn = document.getElementById("compactBtn");
    if (compactBtn && compactBtn.parentNode === topBar) {
      topBar.insertBefore(btn, compactBtn);
    } else {
      topBar.appendChild(btn);
    }
  }

  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
      e.preventDefault();
      openQuickAdminModal();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      injectAdminButton();
      applySavedRatesOnBoot();
      if (location.search.indexOf("admin=1") !== -1) openQuickAdminModal();
    });
  } else {
    injectAdminButton();
    applySavedRatesOnBoot();
    if (location.search.indexOf("admin=1") !== -1) openQuickAdminModal();
  }
})();

