// =============================================================================
// CẤU HÌNH MÁY CHỦ SUPABASE (VÕ LÂM IDLE)
// Thay thế `url` và `key` bên dưới bằng thông tin Project Supabase của bạn:
//   - Project URL: https://<project-ref>.supabase.co
//   - API Key:     anon / publishable key (trong Project Settings -> API)
//
// Lưu ý:
//   - Nếu để url: "" và key: "", game sẽ tự động chạy ở chế độ Offline (local).
//   - Đặt window.PARTY_OFF = false để bật tính năng Tổ đội (Party).
//   - window.EXP_RATE: Hệ số kinh nghiệm máy chủ (1 = chuẩn gốc, 1.5 = ~30 phút lên cấp 20, 2 = nhanh vừa).
// =============================================================================

window.PARTY_OFF = false;
window.EXP_RATE = 1.5;

window.CHAT_CFG = {
  url: "https://bjqyirxhwpnjxqltvvur.supabase.co",
  key: "sb_publishable_um7EGy32IhYejISHO_cLKg_L9Ryjgjm",
  turnstile: ""
};

