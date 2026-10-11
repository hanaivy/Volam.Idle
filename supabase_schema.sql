-- =============================================================================
-- VÕ LÂM IDLE - SUPABASE FULL DATABASE SCHEMA & RPC FUNCTIONS
-- Hướng dẫn:
--   1. Tạo project mới trên https://supabase.com
--   2. Vào Authentication -> Providers -> Email -> TẮT "Confirm email" -> Save
--   3. Vào SQL Editor -> New Query -> Dán toàn bộ nội dung file này vào -> Run
--   4. Copy Project URL và Publishable/Anon Key dán vào file config.js
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CÁC BẢNG DỮ LIỆU CHÍNH (TABLES)
-- -----------------------------------------------------------------------------

-- 1.1. Bảng lưu dữ liệu đám mây (3 nhân vật / tài khoản + kho chung)
CREATE TABLE IF NOT EXISTS public.saves (
    owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slot integer NOT NULL CHECK (slot >= 0 AND slot <= 2),
    name text NOT NULL DEFAULT '',
    lvl integer NOT NULL DEFAULT 1,
    fac text,
    data text NOT NULL,
    updated timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner, slot)
);

-- 1.2. Bảng thông tin nhân vật công khai (Xếp hạng, soi trang bị, tổ đội)
CREATE TABLE IF NOT EXISTS public.chars (
    owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slot integer NOT NULL CHECK (slot >= 0 AND slot <= 2),
    name text NOT NULL,
    fac text,
    sex integer NOT NULL DEFAULT 0,
    lvl integer NOT NULL DEFAULT 1,
    reborn integer NOT NULL DEFAULT 0,
    power bigint NOT NULL DEFAULT 0,
    tower integer NOT NULL DEFAULT 0,
    bosses integer NOT NULL DEFAULT 0,
    gear jsonb NOT NULL DEFAULT '{}'::jsonb,
    snap jsonb,
    updated timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner, slot)
);
CREATE UNIQUE INDEX IF NOT EXISTS chars_name_lower_idx ON public.chars (lower(name));
CREATE INDEX IF NOT EXISTS chars_updated_idx ON public.chars (updated DESC);

-- 1.3. Bảng kênh chat Thế giới
CREATE TABLE IF NOT EXISTS public.chat (
    id bigserial PRIMARY KEY,
    cid text,
    name text NOT NULL,
    fac text,
    lvl integer NOT NULL DEFAULT 1,
    msg text NOT NULL,
    item jsonb,
    ts timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_id_idx ON public.chat (id DESC);

-- 1.4. Bảng Hộp thư (nhận đồ Chợ, quà từ người chơi, Giftcode)
CREATE TABLE IF NOT EXISTS public.mail (
    id bigserial PRIMARY KEY,
    to_name text NOT NULL,
    to_owner uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    from_name text NOT NULL DEFAULT 'Hệ Thống',
    from_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    kind text NOT NULL DEFAULT 'sys',
    item jsonb,
    gold bigint NOT NULL DEFAULT 0,
    knb integer NOT NULL DEFAULT 0,
    note text DEFAULT '',
    created timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mail_to_owner_idx ON public.mail (to_owner);
CREATE INDEX IF NOT EXISTS mail_to_name_idx ON public.mail (lower(to_name));

-- Trigger tự động điền to_owner từ tên nhân vật khi gửi thư
CREATE OR REPLACE FUNCTION public.trg_mail_fill_to_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.to_owner IS NULL AND NEW.to_name IS NOT NULL THEN
        SELECT owner INTO NEW.to_owner
        FROM public.chars
        WHERE lower(name) = lower(trim(NEW.to_name))
        LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER mail_fill_to_owner
BEFORE INSERT ON public.mail
FOR EACH ROW EXECUTE FUNCTION public.trg_mail_fill_to_owner();

-- 1.5. Bảng Chợ (bày bán vật phẩm bằng Lượng hoặc KNB)
CREATE TABLE IF NOT EXISTS public.market (
    id bigserial PRIMARY KEY,
    seller uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    seller_name text NOT NULL,
    item jsonb NOT NULL,
    iname text NOT NULL,
    price bigint NOT NULL CHECK (price > 0),
    cur text NOT NULL DEFAULT 'gold',
    created timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_created_idx ON public.market (created DESC);

-- 1.6. Bảng Ví Kim Nguyên Bảo (KNB) và Lịch sử giao dịch KNB
CREATE TABLE IF NOT EXISTS public.knb_wallets (
    owner uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    bal integer NOT NULL DEFAULT 500, -- Tặng mặc định 500 KNB khi tạo tài khoản mới
    day_date date NOT NULL DEFAULT CURRENT_DATE,
    day jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knb_history (
    id bigserial PRIMARY KEY,
    owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount integer NOT NULL,
    refunded integer NOT NULL DEFAULT 0,
    why text,
    created timestamptz NOT NULL DEFAULT now()
);

-- 1.7. Bảng Giftcode & Lịch sử nhập Giftcode
CREATE TABLE IF NOT EXISTS public.giftcodes (
    code text PRIMARY KEY,
    reward jsonb NOT NULL DEFAULT '{}'::jsonb,
    note text DEFAULT '',
    active boolean NOT NULL DEFAULT true,
    max_uses integer DEFAULT NULL,
    used_count integer NOT NULL DEFAULT 0,
    created timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.giftcode_claims (
    code text NOT NULL REFERENCES public.giftcodes(code) ON DELETE CASCADE,
    owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cname text,
    claimed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (code, owner)
);

-- Thêm sẵn một số Giftcode mẫu cho server riêng của bạn
INSERT INTO public.giftcodes (code, reward, note, active)
VALUES
    ('TANTHU', '{"knb": 1000, "gold": 5000000, "xpbuff": 0.5, "buff": {"xp": [1, 1440], "drop": [1, 1440]}}'::jsonb, 'Quà Tân Thủ', true),
    ('VOLAM2026', '{"knb": 2000, "gold": 10000000, "buff": {"xp": [2, 1440], "drop": [2, 1440]}}'::jsonb, 'Quà Mừng Server Mới', true),
    ('VIP999', '{"knb": 50000, "gold": 500000000}'::jsonb, 'Quà Admin VIP', true)
ON CONFLICT (code) DO NOTHING;

-- 1.8. Bảng Tổ đội (Parties, Members, Invites, Party Chat)
CREATE TABLE IF NOT EXISTS public.parties (
    id bigserial PRIMARY KEY,
    leader_name text NOT NULL,
    closed boolean NOT NULL DEFAULT false,
    created timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.party_members (
    pid bigint NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
    owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    leader boolean NOT NULL DEFAULT false,
    at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (name)
);
CREATE INDEX IF NOT EXISTS party_members_pid_idx ON public.party_members (pid);

CREATE TABLE IF NOT EXISTS public.party_invites (
    id bigserial PRIMARY KEY,
    pid bigint NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
    from_name text NOT NULL,
    to_name text NOT NULL,
    created timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS party_invites_to_idx ON public.party_invites (lower(to_name));

CREATE TABLE IF NOT EXISTS public.party_chat (
    id bigserial PRIMARY KEY,
    pid bigint NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
    owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    name text NOT NULL,
    fac text,
    lvl integer NOT NULL DEFAULT 1,
    msg text NOT NULL,
    ts timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS party_chat_pid_id_idx ON public.party_chat (pid, id);

-- 1.9. Bảng Hệ thống / Anti-cheat / Quản trị (flags, bans, resets)
CREATE TABLE IF NOT EXISTS public.flags (
    id bigserial PRIMARY KEY,
    owner uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    name text,
    kind text,
    info jsonb,
    created timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bans (
    owner uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    reason text,
    created timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.char_resets (
    id bigserial PRIMARY KEY,
    owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slot integer NOT NULL DEFAULT 0,
    kind text NOT NULL DEFAULT 'attr',
    created timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS POLICIES - BẬT CHO TẤT CẢ 14 BẢNG)
-- -----------------------------------------------------------------------------
ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knb_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knb_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giftcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giftcode_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.char_resets ENABLE ROW LEVEL SECURITY;

-- SAVES: Chỉ chủ tài khoản mới được đọc/ghi save của mình
CREATE POLICY saves_self_all ON public.saves
    FOR ALL TO authenticated
    USING (owner = auth.uid())
    WITH CHECK (owner = auth.uid());

-- CHARS: Mọi người đọc được bảng xếp hạng, chủ tài khoản được upsert
CREATE POLICY chars_read_all ON public.chars
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY chars_write_self ON public.chars
    FOR ALL TO authenticated
    USING (owner = auth.uid())
    WITH CHECK (owner = auth.uid());

-- CHAT: Mọi người đọc được, người đã đăng nhập gửi được tin nhắn
CREATE POLICY chat_read_all ON public.chat
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY chat_insert_auth ON public.chat
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- MAIL: Đọc thư gửi cho tài khoản hoặc tên nhân vật của mình, gửi thư khi đã đăng nhập
CREATE POLICY mail_read_self ON public.mail
    FOR SELECT TO authenticated
    USING (
        to_owner = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.chars c
            WHERE c.owner = auth.uid() AND lower(c.name) = lower(mail.to_name)
        )
    );

CREATE POLICY mail_insert_auth ON public.mail
    FOR INSERT TO authenticated
    WITH CHECK (from_owner = auth.uid());

-- MARKET: Mọi người xem được chợ, người bán đăng được đồ của mình
CREATE POLICY market_read_all ON public.market
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY market_insert_self ON public.market
    FOR INSERT TO authenticated
    WITH CHECK (seller = auth.uid());

-- PARTY_CHAT: Đọc tin nhắn tổ đội
CREATE POLICY party_chat_read_auth ON public.party_chat
    FOR SELECT TO authenticated
    USING (true);

-- FLAGS: Ghi log client
CREATE POLICY flags_insert_auth ON public.flags
    FOR INSERT TO authenticated
    WITH CHECK (owner = auth.uid());

-- Bật Realtime cho bảng chat thế giới
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 3. CÁC HÀM RPC (POSTGRESQL FUNCTIONS)
-- -----------------------------------------------------------------------------

-- 3.1. Đếm số người đang online (cập nhật trong 12 phút gần nhất)
CREATE OR REPLACE FUNCTION public.jx_online()
RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
    SELECT GREATEST(1, count(DISTINCT owner)::integer)
    FROM public.chars
    WHERE updated >= now() - interval '12 minutes';
$$;

-- 3.2. Kiểm tra trạng thái tài khoản khi vào game
CREATE OR REPLACE FUNCTION public.jx_hello(dev text DEFAULT '', mark bigint DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    is_ban boolean := false;
BEGIN
    SELECT EXISTS(SELECT 1 FROM public.bans WHERE owner = auth.uid()) INTO is_ban;
    INSERT INTO public.knb_wallets (owner) VALUES (auth.uid()) ON CONFLICT (owner) DO NOTHING;
    RETURN jsonb_build_object('ban', is_ban);
END;
$$;

CREATE OR REPLACE FUNCTION public.jx_am_banned()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(SELECT 1 FROM public.bans WHERE owner = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.jx_reset_get(s integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'kind', kind)), '[]'::jsonb)
    FROM public.char_resets
    WHERE owner = auth.uid() AND slot = s;
$$;

-- 3.3. Hệ thống Ví Kim Nguyên Bảo (knb_sync, knb_spend, knb_refund, knb_gift)
CREATE OR REPLACE FUNCTION public.knb_sync(e jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    w public.knb_wallets%ROWTYPE;
    k text;
    v integer;
    cur_day integer;
    cap integer;
    add_amt integer;
    got jsonb := '{}'::jsonb;
    caps jsonb := '{"boss": 1500, "reward": 8000, "book": 5000, "buy": 10000}'::jsonb;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;

    INSERT INTO public.knb_wallets (owner) VALUES (uid) ON CONFLICT (owner) DO NOTHING;
    SELECT * INTO w FROM public.knb_wallets WHERE owner = uid FOR UPDATE;

    IF w.day_date < CURRENT_DATE THEN
        w.day_date := CURRENT_DATE;
        w.day := '{}'::jsonb;
    END IF;

    IF e IS NOT NULL AND jsonb_typeof(e) = 'object' THEN
        FOR k, v IN SELECT key, GREATEST(0, (value::text)::integer) FROM jsonb_each(e) LOOP
            IF v > 0 THEN
                cur_day := COALESCE((w.day->>k)::integer, 0);
                cap := COALESCE((caps->>k)::integer, 50000);
                add_amt := GREATEST(0, LEAST(v, cap - cur_day));
                IF add_amt > 0 THEN
                    w.bal := w.bal + add_amt;
                    w.day := jsonb_set(w.day, ARRAY[k], to_jsonb(cur_day + add_amt));
                END IF;
                got := jsonb_set(got, ARRAY[k], to_jsonb(add_amt));
            END IF;
        END LOOP;
    END IF;

    w.updated := now();
    UPDATE public.knb_wallets SET bal = w.bal, day_date = w.day_date, day = w.day, updated = w.updated WHERE owner = uid;

    RETURN jsonb_build_object('bal', w.bal, 'day', w.day, 'got', got);
END;
$$;

CREATE OR REPLACE FUNCTION public.knb_spend(n integer, why text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    cur_bal integer;
    v_hid bigint;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
    IF n IS NULL OR n <= 0 THEN RAISE EXCEPTION 'Số KNB không hợp lệ'; END IF;

    INSERT INTO public.knb_wallets (owner) VALUES (uid) ON CONFLICT (owner) DO NOTHING;
    SELECT bal INTO cur_bal FROM public.knb_wallets WHERE owner = uid FOR UPDATE;

    IF cur_bal < n THEN
        RAISE EXCEPTION 'Không đủ Kim Nguyên Bảo (có %, cần %)', cur_bal, n;
    END IF;

    UPDATE public.knb_wallets SET bal = bal - n, updated = now() WHERE owner = uid RETURNING bal INTO cur_bal;
    INSERT INTO public.knb_history (owner, amount, why) VALUES (uid, n, why) RETURNING id INTO v_hid;

    RETURN jsonb_build_object('bal', cur_bal, 'hid', v_hid);
END;
$$;

CREATE OR REPLACE FUNCTION public.knb_refund(hid bigint, n integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    h public.knb_history%ROWTYPE;
    cur_bal integer;
    ref_amt integer;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
    SELECT * INTO h FROM public.knb_history WHERE id = hid AND owner = uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy giao dịch KNB'; END IF;

    ref_amt := GREATEST(0, LEAST(n, h.amount - h.refunded));
    IF ref_amt > 0 THEN
        UPDATE public.knb_history SET refunded = refunded + ref_amt WHERE id = hid;
        UPDATE public.knb_wallets SET bal = bal + ref_amt, updated = now() WHERE owner = uid RETURNING bal INTO cur_bal;
    ELSE
        SELECT bal INTO cur_bal FROM public.knb_wallets WHERE owner = uid;
    END IF;

    RETURN jsonb_build_object('bal', COALESCE(cur_bal, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.knb_gift(cname text, to_name text, k integer, note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    cur_bal integer;
    target_owner uuid;
    target_cname text;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
    IF k IS NULL OR k <= 0 THEN RAISE EXCEPTION 'Số KNB gửi phải lớn hơn 0'; END IF;

    SELECT owner, name INTO target_owner, target_cname
    FROM public.chars
    WHERE lower(name) = lower(trim(to_name))
    LIMIT 1;

    IF target_owner IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy nhân vật "%"', to_name;
    END IF;

    INSERT INTO public.knb_wallets (owner) VALUES (uid) ON CONFLICT (owner) DO NOTHING;
    SELECT bal INTO cur_bal FROM public.knb_wallets WHERE owner = uid FOR UPDATE;
    IF cur_bal < k THEN
        RAISE EXCEPTION 'Không đủ KNB';
    END IF;

    UPDATE public.knb_wallets SET bal = bal - k, updated = now() WHERE owner = uid RETURNING bal INTO cur_bal;

    INSERT INTO public.mail (to_name, to_owner, from_name, from_owner, kind, knb, note)
    VALUES (target_cname, target_owner, COALESCE(NULLIF(trim(cname), ''), 'Ẩn danh'), uid, 'gift', k, COALESCE(note, ''));

    RETURN jsonb_build_object('bal', cur_bal);
END;
$$;

-- 3.4. Hệ thống Hộp thư (claim_mail, reject_mail)
CREATE OR REPLACE FUNCTION public.claim_mail(mid bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    m public.mail%ROWTYPE;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;

    SELECT * INTO m FROM public.mail
    WHERE id = mid AND (
        to_owner = uid
        OR EXISTS (SELECT 1 FROM public.chars c WHERE c.owner = uid AND lower(c.name) = lower(mail.to_name))
    )
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Thư không tồn tại hoặc đã nhận';
    END IF;

    IF COALESCE(m.knb, 0) > 0 THEN
        INSERT INTO public.knb_wallets (owner, bal) VALUES (uid, m.knb)
        ON CONFLICT (owner) DO UPDATE SET bal = public.knb_wallets.bal + EXCLUDED.bal, updated = now();
    END IF;

    DELETE FROM public.mail WHERE id = mid;
    RETURN to_jsonb(m);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_mail(mid bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    m public.mail%ROWTYPE;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;

    SELECT * INTO m FROM public.mail
    WHERE id = mid AND (
        to_owner = uid
        OR EXISTS (SELECT 1 FROM public.chars c WHERE c.owner = uid AND lower(c.name) = lower(mail.to_name))
    )
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Thư không tồn tại'; END IF;
    IF m.kind <> 'gift' THEN RAISE EXCEPTION 'Chỉ trả lại được thư người chơi gửi'; END IF;

    DELETE FROM public.mail WHERE id = mid;

    IF m.from_owner IS NOT NULL THEN
        INSERT INTO public.mail (to_name, to_owner, from_name, from_owner, kind, item, gold, knb, note)
        VALUES (m.from_name, m.from_owner, m.to_name, uid, 'return', m.item, m.gold, m.knb, 'Hoàn trả thư từ ' || m.to_name);
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3.5. Hệ thống Giftcode (jx_gift_open, jx_redeem2, jx_redeem)
CREATE OR REPLACE FUNCTION public.jx_gift_open()
RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
    SELECT count(*)::integer FROM public.giftcodes WHERE active = true;
$$;

CREATE OR REPLACE FUNCTION public.jx_redeem2(c text, cname text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    v_code text := upper(trim(COALESCE(c, '')));
    gc public.giftcodes%ROWTYPE;
    v_knb integer;
    v_gold bigint;
    v_item jsonb;
BEGIN
    IF uid IS NULL THEN RETURN jsonb_build_object('err', 'Cần đăng nhập tài khoản'); END IF;

    SELECT * INTO gc FROM public.giftcodes WHERE code = v_code AND active = true FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('err', 'Giftcode không tồn tại hoặc đã hết hạn');
    END IF;

    IF gc.max_uses IS NOT NULL AND gc.used_count >= gc.max_uses THEN
        RETURN jsonb_build_object('err', 'Giftcode đã hết lượt sử dụng');
    END IF;

    IF EXISTS (SELECT 1 FROM public.giftcode_claims WHERE code = v_code AND owner = uid) THEN
        RETURN jsonb_build_object('err', 'Tài khoản của bạn đã nhận giftcode này rồi');
    END IF;

    INSERT INTO public.giftcode_claims (code, owner, cname) VALUES (v_code, uid, cname);
    UPDATE public.giftcodes SET used_count = used_count + 1 WHERE code = v_code;

    v_knb := COALESCE((gc.reward->>'knb')::integer, 0);
    v_gold := COALESCE((gc.reward->>'gold')::bigint, 0);
    v_item := gc.reward->'item';

    IF v_knb > 0 OR v_gold > 0 OR v_item IS NOT NULL THEN
        INSERT INTO public.mail (to_name, to_owner, from_name, kind, item, gold, knb, note)
        VALUES (COALESCE(NULLIF(trim(cname), ''), 'Nhân vật'), uid, 'Hệ Thống', 'sys', v_item, v_gold, v_knb, 'Giftcode ' || v_code || COALESCE(' (' || NULLIF(gc.note, '') || ')', ''));
    END IF;

    RETURN jsonb_build_object('reward', gc.reward, 'note', gc.note);
END;
$$;

CREATE OR REPLACE FUNCTION public.jx_redeem(c text, cname text DEFAULT '')
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
    SELECT public.jx_redeem2(c, cname);
$$;

-- 3.6. Hệ thống Chợ (market_expire, market_cancel, market_buy, market_buy2)
CREATE OR REPLACE FUNCTION public.market_expire()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        DELETE FROM public.market
        WHERE created < now() - interval '2 hours'
        RETURNING *
    LOOP
        INSERT INTO public.mail (to_name, to_owner, from_name, kind, item, note)
        VALUES (r.seller_name, r.seller, 'Chợ Giang Hồ', 'sys', r.item, 'Hàng hết hạn 2 giờ tự hoàn trả');
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_cancel(lid bigint, cname text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    m public.market%ROWTYPE;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;

    DELETE FROM public.market
    WHERE id = lid AND seller = uid
    RETURNING * INTO m;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Món hàng không tồn tại hoặc đã được mua';
    END IF;

    INSERT INTO public.mail (to_name, to_owner, from_name, kind, item, note)
    VALUES (m.seller_name, m.seller, 'Chợ Giang Hồ', 'sys', m.item, 'Gỡ hàng khỏi Chợ');

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- Mua hàng trên chợ (hỗ trợ cả KNB và Ngân lượng)
CREATE OR REPLACE FUNCTION public.market_buy2(lid bigint, buyer text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    m public.market%ROWTYPE;
    cur_bal integer := 0;
    net_gain bigint;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;

    SELECT * INTO m FROM public.market WHERE id = lid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Món hàng đã có người mua hoặc đã gỡ';
    END IF;
    IF m.seller = uid THEN
        RAISE EXCEPTION 'Không thể tự mua hàng của chính mình';
    END IF;

    net_gain := GREATEST(1, floor(m.price * 0.95)::bigint);

    IF m.cur = 'knb' THEN
        INSERT INTO public.knb_wallets (owner) VALUES (uid) ON CONFLICT (owner) DO NOTHING;
        SELECT bal INTO cur_bal FROM public.knb_wallets WHERE owner = uid FOR UPDATE;
        IF cur_bal < m.price THEN
            RAISE EXCEPTION 'Không đủ Kim Nguyên Bảo';
        END IF;

        UPDATE public.knb_wallets SET bal = bal - m.price::integer, updated = now() WHERE owner = uid RETURNING bal INTO cur_bal;

        -- Cộng KNB trực tiếp vào ví người bán và gửi thông báo qua Thư
        INSERT INTO public.knb_wallets (owner, bal) VALUES (m.seller, net_gain::integer)
        ON CONFLICT (owner) DO UPDATE SET bal = public.knb_wallets.bal + EXCLUDED.bal, updated = now();

        INSERT INTO public.mail (to_name, to_owner, from_name, kind, note)
        VALUES (m.seller_name, m.seller, 'Chợ Giang Hồ', 'sys',
                format('Bán "%s" cho %s: +%s KNB (đã cộng thẳng vào ví KNB)', m.iname, COALESCE(NULLIF(buyer, ''), 'người chơi'), net_gain));
    ELSE
        -- Mua bằng Ngân lượng (client người mua đã trừ lượng, gửi lượng vào Thư người bán)
        INSERT INTO public.mail (to_name, to_owner, from_name, kind, gold, note)
        VALUES (m.seller_name, m.seller, 'Chợ Giang Hồ', 'sys', net_gain,
                format('Bán "%s" cho %s', m.iname, COALESCE(NULLIF(buyer, ''), 'người chơi')));
        SELECT COALESCE(bal, 0) INTO cur_bal FROM public.knb_wallets WHERE owner = uid;
    END IF;

    -- Gửi món đồ vào Thư người mua
    INSERT INTO public.mail (to_name, to_owner, from_name, kind, item, note)
    VALUES (COALESCE(NULLIF(buyer, ''), 'Nhân vật'), uid, 'Chợ Giang Hồ', 'sys', m.item,
            format('Mua của %s giá %s %s', m.seller_name, m.price, CASE WHEN m.cur = 'knb' THEN 'KNB' ELSE 'lượng' END));

    DELETE FROM public.market WHERE id = lid;

    RETURN jsonb_build_object('ok', true, 'bal', COALESCE(cur_bal, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.market_buy(lid bigint, buyer text DEFAULT '')
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
    SELECT public.market_buy2(lid, buyer);
$$;

-- 3.7. Hệ thống Tổ đội (TO_DOI.sql)
CREATE OR REPLACE FUNCTION public.party_state(p_me text, p_full boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    v_pid bigint;
    v_closed boolean := false;
    v_leader boolean := false;
    v_inv jsonb := '[]'::jsonb;
    v_mem jsonb := '[]'::jsonb;
    v_chat bigint := 0;
BEGIN
    IF uid IS NULL OR COALESCE(trim(p_me), '') = '' THEN
        RETURN '{}'::jsonb;
    END IF;

    -- Dọn lời mời quá 5 phút
    DELETE FROM public.party_invites WHERE created < now() - interval '5 minutes';

    -- Lấy danh sách lời mời đang chờ
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'from_name', from_name, 'created', created)), '[]'::jsonb)
    INTO v_inv
    FROM public.party_invites
    WHERE lower(to_name) = lower(trim(p_me));

    -- Kiểm tra tổ đội hiện tại
    SELECT pm.pid, pm.leader, p.closed
    INTO v_pid, v_leader, v_closed
    FROM public.party_members pm
    JOIN public.parties p ON p.id = pm.pid
    WHERE lower(pm.name) = lower(trim(p_me))
    LIMIT 1;

    IF v_pid IS NULL THEN
        RETURN jsonb_build_object('inv', v_inv, 'pid', NULL);
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'owner', pm.owner,
            'name', pm.name,
            'leader', pm.leader,
            'at', pm.at,
            'lvl', COALESCE(c.lvl, 1),
            'fac', c.fac,
            'updated', COALESCE(c.updated, pm.at),
            'snap', CASE WHEN p_full THEN c.snap ELSE NULL END
        ) ORDER BY pm.leader DESC, pm.at ASC
    ), '[]'::jsonb)
    INTO v_mem
    FROM public.party_members pm
    LEFT JOIN public.chars c ON lower(c.name) = lower(pm.name)
    WHERE pm.pid = v_pid;

    SELECT COALESCE(max(id), 0) INTO v_chat FROM public.party_chat WHERE pid = v_pid;

    RETURN jsonb_build_object(
        'pid', v_pid,
        'closed', v_closed,
        'leader', v_leader,
        'inv', v_inv,
        'mem', v_mem,
        'chat', v_chat
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.party_invite(p_from text, p_to text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    v_pid bigint;
    v_leader boolean;
    v_closed boolean;
    v_cnt integer;
    v_target_name text;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;

    SELECT name INTO v_target_name FROM public.chars WHERE lower(name) = lower(trim(p_to)) LIMIT 1;
    IF v_target_name IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy nhân vật "%"', p_to;
    END IF;

    IF EXISTS (SELECT 1 FROM public.party_members WHERE lower(name) = lower(v_target_name)) THEN
        RAISE EXCEPTION '% đang ở trong một tổ đội khác', v_target_name;
    END IF;

    SELECT pm.pid, pm.leader, p.closed INTO v_pid, v_leader, v_closed
    FROM public.party_members pm
    JOIN public.parties p ON p.id = pm.pid
    WHERE lower(pm.name) = lower(trim(p_from))
    LIMIT 1;

    IF v_pid IS NULL THEN
        INSERT INTO public.parties (leader_name) VALUES (trim(p_from)) RETURNING id INTO v_pid;
        INSERT INTO public.party_members (pid, owner, name, leader) VALUES (v_pid, uid, trim(p_from), true);
    ELSE
        IF NOT v_leader THEN RAISE EXCEPTION 'Chỉ đội trưởng mới được mời thành viên'; END IF;
        IF v_closed THEN RAISE EXCEPTION 'Tổ đội đang đóng'; END IF;
        SELECT count(*) INTO v_cnt FROM public.party_members WHERE pid = v_pid;
        IF v_cnt >= 8 THEN RAISE EXCEPTION 'Tổ đội đã đủ 8 người'; END IF;
    END IF;

    DELETE FROM public.party_invites WHERE pid = v_pid AND lower(to_name) = lower(v_target_name);
    INSERT INTO public.party_invites (pid, from_name, to_name) VALUES (v_pid, trim(p_from), v_target_name);

    RETURN jsonb_build_object('ok', true, 'pid', v_pid);
END;
$$;

CREATE OR REPLACE FUNCTION public.party_answer(p_id bigint, p_ok boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    inv public.party_invites%ROWTYPE;
    v_closed boolean;
    v_cnt integer;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;

    DELETE FROM public.party_invites WHERE id = p_id RETURNING * INTO inv;
    IF NOT FOUND THEN RETURN 'expired'; END IF;
    IF NOT p_ok THEN RETURN 'no'; END IF;

    SELECT closed INTO v_closed FROM public.parties WHERE id = inv.pid;
    IF NOT FOUND OR v_closed THEN RETURN 'expired'; END IF;

    SELECT count(*) INTO v_cnt FROM public.party_members WHERE pid = inv.pid;
    IF v_cnt >= 8 THEN RAISE EXCEPTION 'Tổ đội đã đầy (8/8)'; END IF;

    DELETE FROM public.party_members WHERE lower(name) = lower(inv.to_name);
    INSERT INTO public.party_members (pid, owner, name, leader)
    VALUES (inv.pid, uid, inv.to_name, false);

    RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.party_leave(p_me text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_pid bigint;
    v_was_leader boolean;
    v_next_name text;
BEGIN
    DELETE FROM public.party_members
    WHERE lower(name) = lower(trim(p_me))
    RETURNING pid, leader INTO v_pid, v_was_leader;

    IF v_pid IS NOT NULL THEN
        SELECT name INTO v_next_name FROM public.party_members WHERE pid = v_pid ORDER BY at ASC LIMIT 1;
        IF v_next_name IS NULL THEN
            DELETE FROM public.parties WHERE id = v_pid;
        ELSIF v_was_leader THEN
            UPDATE public.party_members SET leader = true WHERE pid = v_pid AND name = v_next_name;
            UPDATE public.parties SET leader_name = v_next_name WHERE id = v_pid;
        END IF;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.party_kick(p_me text, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_pid bigint;
    v_leader boolean;
BEGIN
    SELECT pid, leader INTO v_pid, v_leader FROM public.party_members WHERE lower(name) = lower(trim(p_me));
    IF NOT COALESCE(v_leader, false) THEN RAISE EXCEPTION 'Chỉ đội trưởng mới có quyền mời ra'; END IF;
    DELETE FROM public.party_members WHERE pid = v_pid AND lower(name) = lower(trim(p_name));
END;
$$;

CREATE OR REPLACE FUNCTION public.party_appoint(p_me text, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_pid bigint;
    v_leader boolean;
BEGIN
    SELECT pid, leader INTO v_pid, v_leader FROM public.party_members WHERE lower(name) = lower(trim(p_me));
    IF NOT COALESCE(v_leader, false) THEN RAISE EXCEPTION 'Chỉ đội trưởng mới có quyền bổ nhiệm'; END IF;
    UPDATE public.party_members SET leader = (lower(name) = lower(trim(p_name))) WHERE pid = v_pid;
    UPDATE public.parties SET leader_name = trim(p_name) WHERE id = v_pid;
END;
$$;

CREATE OR REPLACE FUNCTION public.party_disband(p_me text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_pid bigint;
    v_leader boolean;
BEGIN
    SELECT pid, leader INTO v_pid, v_leader FROM public.party_members WHERE lower(name) = lower(trim(p_me));
    IF NOT COALESCE(v_leader, false) THEN RAISE EXCEPTION 'Chỉ đội trưởng mới có quyền giải tán'; END IF;
    DELETE FROM public.parties WHERE id = v_pid;
END;
$$;

CREATE OR REPLACE FUNCTION public.party_close(p_me text, p_closed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_pid bigint;
    v_leader boolean;
BEGIN
    SELECT pid, leader INTO v_pid, v_leader FROM public.party_members WHERE lower(name) = lower(trim(p_me));
    IF NOT COALESCE(v_leader, false) THEN RAISE EXCEPTION 'Chỉ đội trưởng mới có quyền đóng/mở tổ đội'; END IF;
    UPDATE public.parties SET closed = COALESCE(p_closed, false) WHERE id = v_pid;
END;
$$;

CREATE OR REPLACE FUNCTION public.party_say(p_name text, p_fac text, p_lvl integer, p_msg text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid uuid := auth.uid();
    v_pid bigint;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
    SELECT pid INTO v_pid FROM public.party_members WHERE lower(name) = lower(trim(p_name)) LIMIT 1;
    IF v_pid IS NULL THEN RAISE EXCEPTION 'Bạn chưa có tổ đội'; END IF;

    INSERT INTO public.party_chat (pid, owner, name, fac, lvl, msg)
    VALUES (v_pid, uid, trim(p_name), p_fac, COALESCE(p_lvl, 1), left(trim(p_msg), 150));
END;
$$;

