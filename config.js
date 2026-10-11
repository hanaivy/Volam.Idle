// =============================================================================
// CẤU HÌNH MÁY CHỦ & THÔNG SỐ GAME (VÕ LÂM IDLE)
// Bạn có thể chỉnh trực tiếp tại đây HOẶC mở trang /admin.html (hoặc bấm nút ⚙
// trên thanh công cụ trong game / phím tắt Ctrl + Shift + A) để chỉnh trực quan.
// =============================================================================

window.PARTY_OFF = false;

// --- Thông số Tỷ lệ Máy Chủ Mặc Định ---
window.EXP_RATE = 1.5;          // Hệ số EXP toàn máy chủ (1.5 = ~30 phút lên cấp 20)
window.GOLD_RATE = 1.0;         // Hệ số Ngân lượng rơi từ quái
window.DROP_RATE = 1.0;         // Hệ số Tỷ lệ rớt trang bị & nguyên liệu
window.NOVICE_MAX_LVL = 30;     // Cấp giới hạn nhận Hào Quang Tân Thủ
window.NOVICE_EXP_BONUS = 2.0;  // Cộng thêm EXP Tân Thủ (2.0 = +200%, tức x3 EXP)
window.SPAWN_SPEED = 1.0;       // Tốc độ gọi đợt quái mới (1.0 = chuẩn)
window.MOB_HP_MULT = 1.0;       // Hệ số Máu của quái (1.0 = chuẩn)
window.MOB_DMG_MULT = 1.0;      // Hệ số Sát thương của quái (1.0 = chuẩn)

// --- Kết nối Supabase Backend ---
window.CHAT_CFG = {
  url: "https://bjqyirxhwpnjxqltvvur.supabase.co",
  key: "sb_publishable_um7EGy32IhYejISHO_cLKg_L9Ryjgjm",
  turnstile: ""
};

// --- Tự động nạp cấu hình đã lưu từ Admin Panel (localStorage) ---
(function () {
  try {
    var raw = localStorage.getItem("jx_admin_cfg");
    if (!raw) return;
    var cfg = JSON.parse(raw);
    if (!cfg || typeof cfg !== "object") return;
    if (+cfg.expRate > 0) window.EXP_RATE = +cfg.expRate;
    if (+cfg.goldRate > 0) window.GOLD_RATE = +cfg.goldRate;
    if (+cfg.dropRate > 0) window.DROP_RATE = +cfg.dropRate;
    if (cfg.noviceMaxLvl != null && +cfg.noviceMaxLvl >= 0) window.NOVICE_MAX_LVL = Math.floor(+cfg.noviceMaxLvl);
    if (cfg.noviceExpBonus != null && +cfg.noviceExpBonus >= 0) window.NOVICE_EXP_BONUS = +cfg.noviceExpBonus;
    if (+cfg.spawnSpeed > 0) window.SPAWN_SPEED = +cfg.spawnSpeed;
    if (+cfg.mobHpMult > 0) window.MOB_HP_MULT = +cfg.mobHpMult;
    if (+cfg.mobDmgMult > 0) window.MOB_DMG_MULT = +cfg.mobDmgMult;
    if (typeof cfg.partyOff === "boolean") window.PARTY_OFF = cfg.partyOff;
  } catch (e) {}
})();
