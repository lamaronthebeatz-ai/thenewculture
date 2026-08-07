-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 19: TNCOS Dashboard V2.2 Phase M6 —
-- HỆ THỐNG QUẢN TRỊ TÀI SẢN SỐ (Digital Asset Management / Valuation System).
--
-- TRIẾT LÝ (đúng spec): mọi giá trị TNC tạo ra là 1 tài sản, phải được ghi
-- nhận — định giá — tính toán — phân tích — theo dõi — dự báo. Dashboard
-- KHÔNG cho nhập tay số liệu TỔNG — chỉ nhập dữ liệu ĐẦU VÀO (Giá trị cơ
-- bản, các điểm/metric), toàn bộ phép TÍNH do Valuation Engine (PL/pgSQL,
-- chạy trong chính Postgres qua trigger) đảm nhiệm. Không hardcode công
-- thức trong code Dashboard/build.py — công thức sống trong 2 bảng
-- valuation_formulas/valuation_formula_terms, Engine đọc rồi tính.
--
-- KIẾN TRÚC 8 BẢNG (chuẩn hoá, không lặp dữ liệu):
--   asset_categories        — Danh mục tài sản (Nội dung/Thương hiệu/...).
--   asset_types             — Loại tài sản (Bài viết/Series/Media/...),
--                              thuộc 1 category.
--   valuation_rules         — Quy tắc định giá của 1 asset_type (EEV mặc
--                              định, đơn vị, phương pháp, override/cộng
--                              dồn/khấu hao). Versioned (is_active) — sửa =
--                              tạo bản mới is_active=true, KHÔNG update đè.
--   valuation_formulas      — 1 công thức (versioned, is_active) của 1
--                              asset_type khi valuation_method='formula'.
--   valuation_formula_terms — CÁC DÒNG của công thức (vd "Giá trị cơ bản",
--                              "Điểm SEO"...) — đây là nơi công thức THẬT
--                              SỰ sống trong Database (xem PHẦN 3).
--   asset_items              — Sổ tài sản: từng tài sản THẬT. Chỉ nhập
--                              base_value/metrics (đầu vào) — computed_value
--                              do Engine ghi, KHÔNG nhập tay.
--   asset_ledger             — Lịch sử giá trị, append-only, KHÔNG ghi đè
--                              (Ngày/Người sửa/Giá trị cũ/Giá trị mới/Lý do).
--   asset_kpi                — KPI: CHỈ lưu MỤC TIÊU (target_value). "Đã
--                              đạt bao nhiêu" luôn tính trực tiếp từ dữ liệu
--                              qua asset_kpi_progress() — không có cột nào
--                              lưu kết quả, không thể nhập tay kết quả.
--   asset_reports             — Nhật ký các lần xuất báo cáo (PDF/Excel/
--                              CSV) — không lưu nội dung file (Dashboard
--                              sinh file phía client), chỉ audit trail.
--
-- ENGINE (PHẦN 3): compute_asset_value() là 1 hàm PL/pgSQL THUẦN — đọc
-- valuation_rules + valuation_formula_terms của 1 asset_type, tính TỔNG CÓ
-- TRỌNG SỐ (weighted sum) các "term" (base_value/field trong metrics
-- jsonb/constant), áp khấu hao tuyến tính nếu có, rồi cộng dồn nếu
-- is_cumulative. Chọn mô hình "tổng có trọng số" thay vì viết 1 trình dịch
-- biểu thức toán học (expression parser) tuỳ ý trong PL/pgSQL vì: (a) đủ
-- tổng quát cho MỌI ví dụ trong spec (Bài viết = Giá trị cơ bản + Điểm SEO +
-- Điểm nghiên cứu + Điểm nổi bật — đây CHÍNH XÁC là 1 tổng có trọng số),
-- (b) an toàn tuyệt đối — không eval() chuỗi tuỳ ý (rủi ro injection/lỗi
-- runtime không kiểm soát được), (c) Dashboard sinh form "thêm dòng công
-- thức" dễ dàng và AN TOÀN cho Admin tự chỉnh sau này đúng yêu cầu spec,
-- không cần viết code mới cho công thức mới — chỉ cần thêm dòng term.
--
-- Trigger trên asset_items tự chạy Engine mỗi khi base_value/metrics/
-- type_id đổi (kể cả lúc insert). Trigger trên valuation_rules/
-- valuation_formulas/valuation_formula_terms tự "chạm" (touch) lại mọi
-- asset_items của đúng type liên quan để Engine tính lại — đúng yêu cầu
-- "mỗi khi dữ liệu thay đổi, Engine tự chạy, không cần Build, không cần
-- Refresh" (Dashboard đọc trực tiếp Supabase realtime/refetch — không qua
-- build.py, không có khái niệm "build" ở đây).
--
-- "CÓ CỘNG DỒN" (is_cumulative) — quyết định thiết kế cần nói rõ vì spec
-- không định nghĩa chi tiết: tài sản cộng dồn (vd Website/Dashboard — mỗi
-- lần nâng cấp là 1 khoản giá trị MỚI được ghi nhận THÊM, không thay thế)
-- CHỈ cộng dồn khi chính DỮ LIỆU ĐẦU VÀO của tài sản đó đổi (user sửa
-- base_value/metrics/type — 1 "sự kiện" ghi nhận giá trị thật). Khi Engine
-- tính lại do THAY ĐỔI CÔNG THỨC/QUY TẮC (không phải do tài sản đó có dữ
-- liệu mới), tài sản cộng dồn GIỮ NGUYÊN giá trị đã tích luỹ (không cộng
-- lại từ đầu mỗi lần Admin sửa công thức — sẽ làm phình giá trị sai); tài
-- sản KHÔNG cộng dồn thì luôn tính lại theo công thức mới ngay lập tức. Xem
-- compute_asset_value() p_accumulate.
--
-- AN TOÀN SẢN XUẤT: migration này CHỈ thêm bảng/hàm/trigger MỚI — không
-- đổi bất kỳ bảng/cột/API/route nào hiện có, không đổi build.py, không ảnh
-- hưởng website production. Idempotent toàn bộ (create table/index if not
-- exists, create or replace function, drop trigger if exists + create,
-- insert...on conflict).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PHẦN 1 — Bảng danh mục/loại + quy tắc/công thức định giá.
-- ----------------------------------------------------------------------------

create table if not exists public.asset_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint asset_categories_name_not_blank check (btrim(name) <> ''),
  constraint asset_categories_slug_not_blank check (btrim(slug) <> '')
);
create unique index if not exists asset_categories_slug_key on public.asset_categories (slug) where deleted_at is null;
create index if not exists asset_categories_deleted_at_idx on public.asset_categories (deleted_at);

drop trigger if exists trg_asset_categories_updated_at on public.asset_categories;
create trigger trg_asset_categories_updated_at
  before update on public.asset_categories
  for each row execute function public.set_updated_at();


create table if not exists public.asset_types (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.asset_categories (id) on delete restrict,
  name         text not null,
  slug         text not null,
  description  text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint asset_types_name_not_blank check (btrim(name) <> ''),
  constraint asset_types_slug_not_blank check (btrim(slug) <> '')
);
create unique index if not exists asset_types_slug_key on public.asset_types (slug) where deleted_at is null;
create index if not exists asset_types_category_id_idx on public.asset_types (category_id);
create index if not exists asset_types_deleted_at_idx on public.asset_types (deleted_at);

drop trigger if exists trg_asset_types_updated_at on public.asset_types;
create trigger trg_asset_types_updated_at
  before update on public.asset_types
  for each row execute function public.set_updated_at();


-- Versioned: sửa Quy tắc định giá = tạo bản MỚI is_active=true + tắt bản cũ
-- (xem RPC phía Dashboard) — giữ lịch sử "quy tắc từng áp dụng lúc nào",
-- nhất quán với triết lý "mọi thứ đều ghi nhận, không ghi đè" của cả Phase.
-- unique index đảm bảo tại 1 thời điểm mỗi asset_type có ĐÚNG 1 rule active.
create table if not exists public.valuation_rules (
  id                   uuid primary key default gen_random_uuid(),
  asset_type_id        uuid not null references public.asset_types (id) on delete cascade,
  name                 text not null,
  default_value        numeric(18,2) not null default 0,
  unit                 text not null default 'VND',
  valuation_method     text not null default 'fixed'
                       check (valuation_method in ('fixed', 'formula', 'manual')),
  notes                text,
  allow_override       boolean not null default true,
  is_cumulative        boolean not null default false,
  has_depreciation     boolean not null default false,
  depreciation_rate    numeric(6,3),
  depreciation_period  text check (depreciation_period in ('daily', 'weekly', 'monthly', 'yearly')),
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint valuation_rules_name_not_blank check (btrim(name) <> ''),
  constraint valuation_rules_depreciation_consistent check (
    has_depreciation = false or (depreciation_rate is not null and depreciation_period is not null)
  )
);
create unique index if not exists valuation_rules_active_per_type
  on public.valuation_rules (asset_type_id) where deleted_at is null and is_active = true;
create index if not exists valuation_rules_asset_type_id_idx on public.valuation_rules (asset_type_id);
create index if not exists valuation_rules_deleted_at_idx on public.valuation_rules (deleted_at);

drop trigger if exists trg_valuation_rules_updated_at on public.valuation_rules;
create trigger trg_valuation_rules_updated_at
  before update on public.valuation_rules
  for each row execute function public.set_updated_at();


create table if not exists public.valuation_formulas (
  id             uuid primary key default gen_random_uuid(),
  asset_type_id  uuid not null references public.asset_types (id) on delete cascade,
  name           text not null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint valuation_formulas_name_not_blank check (btrim(name) <> '')
);
create unique index if not exists valuation_formulas_active_per_type
  on public.valuation_formulas (asset_type_id) where deleted_at is null and is_active = true;
create index if not exists valuation_formulas_asset_type_id_idx on public.valuation_formulas (asset_type_id);
create index if not exists valuation_formulas_deleted_at_idx on public.valuation_formulas (deleted_at);

drop trigger if exists trg_valuation_formulas_updated_at on public.valuation_formulas;
create trigger trg_valuation_formulas_updated_at
  before update on public.valuation_formulas
  for each row execute function public.set_updated_at();


-- Đây là nơi "công thức" THẬT SỰ sống trong Database (không hardcode trong
-- code) — mỗi dòng là 1 số hạng trong tổng có trọng số. 'field' đọc từ
-- asset_items.metrics (jsonb) theo field_path (vd 'seo_score').
create table if not exists public.valuation_formula_terms (
  id              uuid primary key default gen_random_uuid(),
  formula_id      uuid not null references public.valuation_formulas (id) on delete cascade,
  label           text not null,
  source          text not null check (source in ('base_value', 'field', 'constant')),
  field_path      text,
  constant_value  numeric(18,2),
  weight          numeric(9,4) not null default 1,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  constraint valuation_formula_terms_label_not_blank check (btrim(label) <> ''),
  constraint valuation_formula_terms_source_data_consistent check (
    (source = 'field' and field_path is not null and btrim(field_path) <> '')
    or (source = 'constant' and constant_value is not null)
    or (source = 'base_value')
  )
);
create index if not exists valuation_formula_terms_formula_id_idx on public.valuation_formula_terms (formula_id, sort_order);


-- ----------------------------------------------------------------------------
-- PHẦN 2 — Sổ tài sản (asset_items) + lịch sử (asset_ledger) + KPI + Báo cáo.
-- ----------------------------------------------------------------------------

create table if not exists public.asset_items (
  id              uuid primary key default gen_random_uuid(),
  type_id         uuid not null references public.asset_types (id) on delete restrict,
  name            text not null,
  description     text,
  -- Đầu vào (nhập tay) — Engine đọc 2 cột này để tính, KHÔNG bao giờ nhập
  -- tay computed_value.
  base_value      numeric(18,2) not null default 0,
  metrics         jsonb not null default '{}'::jsonb,
  -- Engine ghi — xem asset_item_valuate().
  computed_value  numeric(18,2),
  -- Ghi đè riêng cho ĐÚNG tài sản này (PHẦN XI spec) — chỉ ảnh hưởng tài
  -- sản đó, không ảnh hưởng công thức/asset khác.
  override_value  numeric(18,2),
  -- "Giá trị chính thức" cuối cùng — mọi Tổng quan/Phân tích/KPI/Báo cáo
  -- CHỈ đọc cột này, không đọc computed_value/override_value trực tiếp.
  effective_value numeric(18,2) generated always as (coalesce(override_value, computed_value)) stored,
  -- Gắn thẻ tuỳ chọn để lọc "Theo Series/Theo Author/Theo Module" (PHẦN X)
  -- — text thuần (không FK cứng sang articles/authors) vì 1 tài sản có thể
  -- không gắn với bài viết/author cụ thể nào (vd tài sản "Website").
  series_slug     text,
  author_id       uuid references public.authors (id) on delete set null,
  module_key      text,
  is_active       boolean not null default true,
  created_by      uuid references public.dashboard_users (id) on delete set null,
  updated_by      uuid references public.dashboard_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint asset_items_name_not_blank check (btrim(name) <> ''),
  constraint asset_items_metrics_is_object check (jsonb_typeof(metrics) = 'object')
);
create index if not exists asset_items_type_id_idx on public.asset_items (type_id);
create index if not exists asset_items_series_slug_idx on public.asset_items (series_slug);
create index if not exists asset_items_author_id_idx on public.asset_items (author_id);
create index if not exists asset_items_module_key_idx on public.asset_items (module_key);
create index if not exists asset_items_is_active_idx on public.asset_items (is_active);
create index if not exists asset_items_deleted_at_idx on public.asset_items (deleted_at);
create index if not exists asset_items_updated_at_idx on public.asset_items (updated_at);

drop trigger if exists trg_asset_items_updated_at on public.asset_items;
create trigger trg_asset_items_updated_at
  before update on public.asset_items
  for each row execute function public.set_updated_at();


-- Append-only — KHÔNG có updated_at/UPDATE policy nào ở PHẦN 5, đúng yêu
-- cầu "Lưu toàn bộ lịch sử. Không ghi đè."
create table if not exists public.asset_ledger (
  id             uuid primary key default gen_random_uuid(),
  asset_item_id  uuid not null references public.asset_items (id) on delete cascade,
  changed_at     timestamptz not null default now(),
  changed_by     uuid references public.dashboard_users (id) on delete set null,
  old_value      numeric(18,2),
  new_value      numeric(18,2),
  reason         text not null check (reason in ('created', 'engine_recompute', 'manual_override')),
  created_at     timestamptz not null default now()
);
create index if not exists asset_ledger_asset_item_id_idx on public.asset_ledger (asset_item_id, changed_at desc);
create index if not exists asset_ledger_changed_at_idx on public.asset_ledger (changed_at desc);


-- KPI: value đạt được KHÔNG có cột lưu — luôn tính trực tiếp qua
-- asset_kpi_progress() (PHẦN 3), đúng yêu cầu "KPI KHÔNG được nhập kết quả".
create table if not exists public.asset_kpi (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  metric_type         text not null check (
                        metric_type in ('count_total', 'count_by_type', 'count_by_category', 'total_value')
                      ),
  target_value        numeric(18,2) not null,
  target_type_id      uuid references public.asset_types (id) on delete cascade,
  target_category_id  uuid references public.asset_categories (id) on delete cascade,
  period              text not null default 'all_time'
                       check (period in ('all_time', 'yearly', 'monthly', 'weekly')),
  period_start        timestamptz,
  period_end          timestamptz,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint asset_kpi_name_not_blank check (btrim(name) <> ''),
  constraint asset_kpi_target_consistent check (
    (metric_type <> 'count_by_type' or target_type_id is not null)
    and (metric_type <> 'count_by_category' or target_category_id is not null)
  )
);
create index if not exists asset_kpi_deleted_at_idx on public.asset_kpi (deleted_at);

drop trigger if exists trg_asset_kpi_updated_at on public.asset_kpi;
create trigger trg_asset_kpi_updated_at
  before update on public.asset_kpi
  for each row execute function public.set_updated_at();


-- Nhật ký xuất báo cáo — audit trail, KHÔNG lưu nội dung file (file sinh ở
-- phía client, xem dashboard/src/lib/assetExport.js).
create table if not exists public.asset_reports (
  id            uuid primary key default gen_random_uuid(),
  report_type   text not null check (report_type in ('overview', 'ledger', 'kpi', 'items')),
  format        text not null check (format in ('pdf', 'excel', 'csv')),
  filters       jsonb not null default '{}'::jsonb,
  row_count     integer,
  generated_by  uuid references public.dashboard_users (id) on delete set null,
  generated_at  timestamptz not null default now()
);
create index if not exists asset_reports_generated_at_idx on public.asset_reports (generated_at desc);


-- ----------------------------------------------------------------------------
-- PHẦN 3 — VALUATION ENGINE (compute_asset_value + trigger tự động).
-- ----------------------------------------------------------------------------

create or replace function public.compute_asset_value(
  p_type_id      uuid,
  p_base_value   numeric,
  p_metrics      jsonb,
  p_old_computed numeric,
  p_created_at   timestamptz,
  p_accumulate   boolean
) returns numeric
language plpgsql
stable
as $$
declare
  v_rule      public.valuation_rules;
  v_formula_id uuid;
  v_term      public.valuation_formula_terms;
  v_raw       numeric := 0;
  v_periods   numeric := 0;
  v_result    numeric;
begin
  select vr.* into v_rule
  from public.valuation_rules vr
  where vr.asset_type_id = p_type_id and vr.deleted_at is null and vr.is_active = true
  limit 1;

  -- Chưa cấu hình Quy tắc định giá cho loại tài sản này: dùng thẳng Giá trị
  -- cơ bản (đầu vào), KHÔNG suy diễn/fake số liệu nào khác.
  if v_rule is null then
    return round(coalesce(p_base_value, 0), 2);
  end if;

  if v_rule.valuation_method = 'manual' then
    -- 'manual': Engine không tự tính — chỉ Ghi đè (override_value) mới có
    -- giá trị hiệu lực (xem asset_items.effective_value).
    return null;
  elsif v_rule.valuation_method = 'fixed' then
    v_raw := coalesce(v_rule.default_value, 0);
  else
    -- 'formula': tổng có trọng số các term của công thức đang active.
    select id into v_formula_id
    from public.valuation_formulas
    where asset_type_id = p_type_id and deleted_at is null and is_active = true
    limit 1;

    if v_formula_id is null then
      v_raw := coalesce(v_rule.default_value, 0); -- chưa có công thức active: fallback EEV mặc định
    else
      for v_term in
        select * from public.valuation_formula_terms where formula_id = v_formula_id order by sort_order
      loop
        v_raw := v_raw + coalesce(v_term.weight, 1) * (
          case v_term.source
            when 'base_value' then coalesce(p_base_value, 0)
            when 'constant'   then coalesce(v_term.constant_value, 0)
            when 'field'      then coalesce((p_metrics ->> v_term.field_path)::numeric, 0)
            else 0
          end
        );
      end loop;
    end if;
  end if;

  -- Khấu hao tuyến tính theo số kỳ trôi qua kể từ created_at (giá trị
  -- chưa khấu hao tối thiểu 0 — không cho ra giá trị âm).
  if v_rule.has_depreciation and v_rule.depreciation_rate is not null and v_rule.depreciation_rate > 0 then
    v_periods := case v_rule.depreciation_period
      when 'daily'   then extract(epoch from (now() - p_created_at)) / 86400.0
      when 'weekly'  then extract(epoch from (now() - p_created_at)) / (86400.0 * 7)
      when 'monthly' then extract(epoch from (now() - p_created_at)) / (86400.0 * 30)
      when 'yearly'  then extract(epoch from (now() - p_created_at)) / (86400.0 * 365)
      else 0
    end;
    v_raw := greatest(0, v_raw * (1 - (v_rule.depreciation_rate / 100.0) * v_periods));
  end if;

  if v_rule.is_cumulative then
    if p_accumulate then
      -- Dữ liệu đầu vào của CHÍNH tài sản này vừa đổi (hoặc mới tạo) — đây
      -- là 1 sự kiện ghi nhận giá trị mới, cộng thêm vào tổng đã tích luỹ.
      v_result := coalesce(p_old_computed, 0) + v_raw;
    else
      -- Bị "chạm" lại chỉ vì công thức/quy tắc đổi (không phải do tài sản
      -- này có dữ liệu mới) — GIỮ NGUYÊN giá trị đã tích luỹ, không cộng
      -- lại (tránh phình giá trị sai mỗi lần Admin sửa công thức).
      v_result := coalesce(p_old_computed, v_raw);
    end if;
  else
    v_result := v_raw;
  end if;

  return round(v_result, 2);
end;
$$;


create or replace function public.asset_item_valuate() returns trigger
language plpgsql
as $$
declare
  v_input_changed boolean;
begin
  if TG_OP = 'INSERT' then
    v_input_changed := true;
  else
    v_input_changed := (NEW.base_value is distinct from OLD.base_value)
                     or (NEW.metrics is distinct from OLD.metrics)
                     or (NEW.type_id is distinct from OLD.type_id);
  end if;

  NEW.computed_value := public.compute_asset_value(
    NEW.type_id,
    NEW.base_value,
    NEW.metrics,
    case when TG_OP = 'UPDATE' then OLD.computed_value else 0 end,
    coalesce(NEW.created_at, now()),
    v_input_changed
  );
  return NEW;
end;
$$;

drop trigger if exists trg_asset_items_valuate on public.asset_items;
create trigger trg_asset_items_valuate
  before insert or update on public.asset_items
  for each row execute function public.asset_item_valuate();


create or replace function public.asset_item_log_ledger() returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid;
begin
  select du.id into v_actor from public.dashboard_users du where du.id = auth.uid();

  if TG_OP = 'INSERT' then
    insert into public.asset_ledger (asset_item_id, changed_by, old_value, new_value, reason)
    values (NEW.id, v_actor, null, NEW.effective_value, 'created');
  elsif OLD.effective_value is distinct from NEW.effective_value then
    insert into public.asset_ledger (asset_item_id, changed_by, old_value, new_value, reason)
    values (
      NEW.id, v_actor, OLD.effective_value, NEW.effective_value,
      case when OLD.override_value is distinct from NEW.override_value then 'manual_override' else 'engine_recompute' end
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_asset_items_ledger on public.asset_items;
create trigger trg_asset_items_ledger
  after insert or update on public.asset_items
  for each row execute function public.asset_item_log_ledger();


-- "Chạm" lại mọi asset_items của 1 type để Engine tính lại — SET vô hại
-- (gán lại chính nó) vẫn kích hoạt trg_asset_items_valuate/trg_asset_items_ledger
-- vì Postgres luôn chạy row trigger khi cột nằm trong SET, bất kể giá trị
-- có đổi hay không. Tái dùng ĐÚNG 1 đường tính (không viết lại logic Engine
-- lần 2), đúng nguyên tắc DRY.
create or replace function public.recompute_asset_type(p_type_id uuid) returns void
language sql
as $$
  update public.asset_items set base_value = base_value
  where type_id = p_type_id and deleted_at is null;
$$;


create or replace function public.trg_valuation_rules_changed() returns trigger
language plpgsql
as $$
begin
  perform public.recompute_asset_type(coalesce(NEW.asset_type_id, OLD.asset_type_id));
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_valuation_rules_recompute on public.valuation_rules;
create trigger trg_valuation_rules_recompute
  after insert or update or delete on public.valuation_rules
  for each row execute function public.trg_valuation_rules_changed();


create or replace function public.trg_valuation_formulas_changed() returns trigger
language plpgsql
as $$
begin
  perform public.recompute_asset_type(coalesce(NEW.asset_type_id, OLD.asset_type_id));
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_valuation_formulas_recompute on public.valuation_formulas;
create trigger trg_valuation_formulas_recompute
  after insert or update or delete on public.valuation_formulas
  for each row execute function public.trg_valuation_formulas_changed();


create or replace function public.trg_valuation_formula_terms_changed() returns trigger
language plpgsql
as $$
declare
  v_type_id uuid;
begin
  select f.asset_type_id into v_type_id
  from public.valuation_formulas f
  where f.id = coalesce(NEW.formula_id, OLD.formula_id);

  if v_type_id is not null then
    perform public.recompute_asset_type(v_type_id);
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_valuation_formula_terms_recompute on public.valuation_formula_terms;
create trigger trg_valuation_formula_terms_recompute
  after insert or update or delete on public.valuation_formula_terms
  for each row execute function public.trg_valuation_formula_terms_changed();


-- ----------------------------------------------------------------------------
-- PHẦN 4 — RPC đọc: Tổng quan / KPI progress / Phân tích. Toàn bộ STABLE,
-- SECURITY INVOKER (mặc định) — chạy dưới quyền RLS của người gọi, không
-- cần security definer vì chỉ SELECT dữ liệu người gọi vốn đã có quyền xem.
-- ----------------------------------------------------------------------------

create or replace function public.asset_total_value() returns numeric
language sql stable as $$
  select coalesce(sum(effective_value), 0) from public.asset_items where deleted_at is null and is_active = true;
$$;

-- Tổng thay đổi giá trị (tăng/giảm ròng) kể từ 1 mốc thời gian — dùng
-- chung cho "Hôm nay/Tuần này/Tháng này/Năm nay tăng bao nhiêu" (gọi hàm
-- này với since khác nhau phía Dashboard).
create or replace function public.asset_value_delta(p_since timestamptz) returns numeric
language sql stable as $$
  select coalesce(sum(coalesce(new_value, 0) - coalesce(old_value, 0)), 0)
  from public.asset_ledger
  where changed_at >= p_since;
$$;

-- Chuỗi tổng giá trị theo từng ngày trong N ngày gần nhất (running total
-- dựng lại từ delta của asset_ledger) — dùng cho Biểu đồ tăng trưởng.
create or replace function public.asset_growth_series(p_days integer default 30)
returns table (day date, total_value numeric)
language sql stable as $$
  with days as (
    select generate_series(current_date - (p_days - 1), current_date, interval '1 day')::date as day
  ),
  daily_delta as (
    select changed_at::date as day, sum(coalesce(new_value, 0) - coalesce(old_value, 0)) as delta
    from public.asset_ledger
    group by changed_at::date
  ),
  base as (
    select coalesce(sum(coalesce(new_value, 0) - coalesce(old_value, 0)), 0) as base_total
    from public.asset_ledger
    where changed_at::date < (current_date - (p_days - 1))
  )
  select
    d.day,
    (select base_total from base) +
      coalesce(sum(dd.delta) over (order by d.day rows between unbounded preceding and current row), 0) as total_value
  from days d
  left join daily_delta dd on dd.day = d.day
  order by d.day;
$$;

-- Phân bố tổng giá trị theo Danh mục — dùng cho Biểu đồ phân bố.
create or replace function public.asset_distribution_by_category()
returns table (category_id uuid, category_name text, total_value numeric, item_count bigint)
language sql stable as $$
  select ac.id, ac.name, coalesce(sum(ai.effective_value), 0) as total_value, count(ai.id) as item_count
  from public.asset_categories ac
  left join public.asset_types at2 on at2.category_id = ac.id and at2.deleted_at is null
  left join public.asset_items ai on ai.type_id = at2.id and ai.deleted_at is null and ai.is_active = true
  where ac.deleted_at is null
  group by ac.id, ac.name
  order by total_value desc nulls last;
$$;

-- Top tài sản / danh mục / loại tài sản theo effective_value — dùng cho
-- "Top tài sản/Top danh mục/Top loại tài sản" (PHẦN XIII).
create or replace function public.asset_top_items(p_limit integer default 5)
returns table (id uuid, name text, effective_value numeric, type_name text)
language sql stable as $$
  select ai.id, ai.name, ai.effective_value, at2.name
  from public.asset_items ai
  join public.asset_types at2 on at2.id = ai.type_id
  where ai.deleted_at is null and ai.is_active = true and ai.effective_value is not null
  order by ai.effective_value desc
  limit greatest(p_limit, 0);
$$;

create or replace function public.asset_top_categories(p_limit integer default 5)
returns table (id uuid, name text, total_value numeric)
language sql stable as $$
  select category_id, category_name, total_value
  from public.asset_distribution_by_category()
  order by total_value desc nulls last
  limit greatest(p_limit, 0);
$$;

create or replace function public.asset_top_types(p_limit integer default 5)
returns table (id uuid, name text, total_value numeric, item_count bigint)
language sql stable as $$
  select at2.id, at2.name, coalesce(sum(ai.effective_value), 0), count(ai.id)
  from public.asset_types at2
  left join public.asset_items ai on ai.type_id = at2.id and ai.deleted_at is null and ai.is_active = true
  where at2.deleted_at is null
  group by at2.id, at2.name
  order by 3 desc nulls last
  limit greatest(p_limit, 0);
$$;


-- KPI: "đã đạt bao nhiêu" — luôn tính trực tiếp, KHÔNG đọc cột kết quả nào
-- (không tồn tại cột đó trong asset_kpi), đúng yêu cầu spec PHẦN XIV.
create or replace function public.asset_kpi_progress(p_kpi_id uuid) returns numeric
language plpgsql stable as $$
declare
  v_kpi    public.asset_kpi;
  v_result numeric;
begin
  select * into v_kpi from public.asset_kpi where id = p_kpi_id and deleted_at is null;
  if v_kpi is null then
    return null;
  end if;

  if v_kpi.metric_type = 'count_total' then
    select count(*) into v_result
    from public.asset_items
    where deleted_at is null
      and (v_kpi.period_start is null or created_at >= v_kpi.period_start)
      and (v_kpi.period_end is null or created_at <= v_kpi.period_end);
  elsif v_kpi.metric_type = 'count_by_type' then
    select count(*) into v_result
    from public.asset_items
    where deleted_at is null and type_id = v_kpi.target_type_id
      and (v_kpi.period_start is null or created_at >= v_kpi.period_start)
      and (v_kpi.period_end is null or created_at <= v_kpi.period_end);
  elsif v_kpi.metric_type = 'count_by_category' then
    select count(*) into v_result
    from public.asset_items ai
    join public.asset_types at2 on at2.id = ai.type_id
    where ai.deleted_at is null and at2.category_id = v_kpi.target_category_id
      and (v_kpi.period_start is null or ai.created_at >= v_kpi.period_start)
      and (v_kpi.period_end is null or ai.created_at <= v_kpi.period_end);
  elsif v_kpi.metric_type = 'total_value' then
    select coalesce(sum(ai.effective_value), 0) into v_result
    from public.asset_items ai
    left join public.asset_types at2 on at2.id = ai.type_id
    where ai.deleted_at is null
      and (v_kpi.target_type_id is null or ai.type_id = v_kpi.target_type_id)
      and (v_kpi.target_category_id is null or at2.category_id = v_kpi.target_category_id)
      and (v_kpi.period_start is null or ai.created_at >= v_kpi.period_start)
      and (v_kpi.period_end is null or ai.created_at <= v_kpi.period_end);
  else
    v_result := 0;
  end if;

  return coalesce(v_result, 0);
end;
$$;


-- Phân tích tự động (PHẦN XV) — trả 1 mảng jsonb (mở rộng được: thêm loại
-- insight mới không cần đổi schema hàm trả về). Đúng 6 ví dụ spec liệt kê,
-- toàn bộ tính từ dữ liệu thật (asset_items/asset_ledger) — "Không AI.
-- Không API. Chỉ dùng dữ liệu."
create or replace function public.asset_analysis_insights() returns jsonb
language plpgsql stable as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_row    record;
begin
  -- 1. Danh mục tăng nhanh nhất (30 ngày, theo delta thật trong ledger).
  select ac.name as label, sum(coalesce(al.new_value, 0) - coalesce(al.old_value, 0)) as v
  into v_row
  from public.asset_ledger al
  join public.asset_items ai on ai.id = al.asset_item_id
  join public.asset_types at2 on at2.id = ai.type_id
  join public.asset_categories ac on ac.id = at2.category_id
  where al.changed_at >= now() - interval '30 days'
  group by ac.name
  order by v desc nulls last
  limit 1;
  if v_row.label is not null then
    v_result := v_result || jsonb_build_object(
      'type', 'top_growing_category', 'label', 'Danh mục tăng nhanh nhất (30 ngày)',
      'detail', v_row.label, 'value', v_row.v
    );
  end if;

  -- 2. Loại tài sản giá trị cao nhất.
  select at2.name as label, sum(ai.effective_value) as v
  into v_row
  from public.asset_items ai
  join public.asset_types at2 on at2.id = ai.type_id
  where ai.deleted_at is null and ai.is_active = true
  group by at2.name
  order by v desc nulls last
  limit 1;
  if v_row.label is not null then
    v_result := v_result || jsonb_build_object(
      'type', 'top_value_type', 'label', 'Loại tài sản giá trị cao nhất',
      'detail', v_row.label, 'value', v_row.v
    );
  end if;

  -- 3. Tài sản chưa cập nhật (>90 ngày).
  select count(*) as v into v_row
  from public.asset_items
  where deleted_at is null and is_active = true and updated_at < now() - interval '90 days';
  v_result := v_result || jsonb_build_object(
    'type', 'stale_items', 'label', 'Tài sản chưa cập nhật (trên 90 ngày)',
    'detail', null, 'value', coalesce(v_row.v, 0)
  );

  -- 4. Tài sản không còn sử dụng.
  select count(*) as v into v_row from public.asset_items where deleted_at is null and is_active = false;
  v_result := v_result || jsonb_build_object(
    'type', 'inactive_items', 'label', 'Tài sản không còn sử dụng',
    'detail', null, 'value', coalesce(v_row.v, 0)
  );

  -- 5. Tài sản tăng mạnh nhất (30 ngày).
  select ai.name as label, sum(coalesce(al.new_value, 0) - coalesce(al.old_value, 0)) as v
  into v_row
  from public.asset_ledger al
  join public.asset_items ai on ai.id = al.asset_item_id
  where al.changed_at >= now() - interval '30 days'
  group by ai.id, ai.name
  order by v desc nulls last
  limit 1;
  if v_row.label is not null and v_row.v > 0 then
    v_result := v_result || jsonb_build_object(
      'type', 'top_gainer', 'label', 'Tài sản tăng mạnh nhất (30 ngày)',
      'detail', v_row.label, 'value', v_row.v
    );
  end if;

  -- 6. Tài sản giảm mạnh nhất (30 ngày).
  select ai.name as label, sum(coalesce(al.new_value, 0) - coalesce(al.old_value, 0)) as v
  into v_row
  from public.asset_ledger al
  join public.asset_items ai on ai.id = al.asset_item_id
  where al.changed_at >= now() - interval '30 days'
  group by ai.id, ai.name
  order by v asc nulls last
  limit 1;
  if v_row.label is not null and v_row.v < 0 then
    v_result := v_result || jsonb_build_object(
      'type', 'top_loser', 'label', 'Tài sản giảm mạnh nhất (30 ngày)',
      'detail', v_row.label, 'value', v_row.v
    );
  end if;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- PHẦN 5 — Permission catalog: module "assets", 4 action chuẩn. Đây là dữ
-- liệu TÀI CHÍNH/ĐỊNH GIÁ nội bộ (không phải nội dung xuất bản) nên phạm vi
-- cấp quyền hẹp hơn Layout Builder: super_admin/administrator toàn quyền,
-- managing_editor CHỈ xem (oversight), các role còn lại (editor/author/
-- reviewer/contributor/publisher/guest) không có quyền — đúng tinh thần
-- "Admin có thể tạo thêm" (PHẦN V/VI spec ngụ ý đây là tác vụ cấp Admin).
-- ----------------------------------------------------------------------------

insert into public.permissions (module, action, key, description)
values
  ('assets', 'view', 'assets.view', 'Xem Hệ thống Quản trị Tài sản số'),
  ('assets', 'create', 'assets.create', 'Thêm Danh mục/Loại/Quy tắc/Công thức/Tài sản/KPI mới'),
  ('assets', 'edit', 'assets.edit', 'Sửa Danh mục/Loại/Quy tắc/Công thức/Tài sản/KPI'),
  ('assets', 'delete', 'assets.delete', 'Xoá Danh mục/Loại/Quy tắc/Công thức/Tài sản/KPI')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'administrator' and p.key <> 'permissions.manage'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'managing_editor' and p.module = 'assets' and p.action = 'view'
on conflict do nothing;


-- ----------------------------------------------------------------------------
-- PHẦN 6 — RLS. TOÀN BỘ 8 bảng CHỈ dành cho Dashboard/editor có quyền —
-- KHÔNG có policy Public read nào (khác Layout Builder/Series...): đây là
-- dữ liệu quản trị nội bộ, build.py không đọc, website production không
-- hiển thị — đúng yêu cầu "Không ảnh hưởng Website Production".
-- ----------------------------------------------------------------------------

alter table public.asset_categories        enable row level security;
alter table public.asset_types              enable row level security;
alter table public.valuation_rules          enable row level security;
alter table public.valuation_formulas       enable row level security;
alter table public.valuation_formula_terms  enable row level security;
alter table public.asset_items              enable row level security;
alter table public.asset_ledger             enable row level security;
alter table public.asset_kpi                enable row level security;
alter table public.asset_reports            enable row level security;

-- asset_categories
drop policy if exists "Editors can view asset_categories" on public.asset_categories;
create policy "Editors can view asset_categories" on public.asset_categories
  for select to authenticated using (public.is_active_editor() and public.has_permission('assets.view'));
drop policy if exists "Editors can insert asset_categories" on public.asset_categories;
create policy "Editors can insert asset_categories" on public.asset_categories
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('assets.create'));
drop policy if exists "Editors can update asset_categories" on public.asset_categories;
create policy "Editors can update asset_categories" on public.asset_categories
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')))
  with check (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')));

-- asset_types
drop policy if exists "Editors can view asset_types" on public.asset_types;
create policy "Editors can view asset_types" on public.asset_types
  for select to authenticated using (public.is_active_editor() and public.has_permission('assets.view'));
drop policy if exists "Editors can insert asset_types" on public.asset_types;
create policy "Editors can insert asset_types" on public.asset_types
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('assets.create'));
drop policy if exists "Editors can update asset_types" on public.asset_types;
create policy "Editors can update asset_types" on public.asset_types
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')))
  with check (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')));

-- valuation_rules
drop policy if exists "Editors can view valuation_rules" on public.valuation_rules;
create policy "Editors can view valuation_rules" on public.valuation_rules
  for select to authenticated using (public.is_active_editor() and public.has_permission('assets.view'));
drop policy if exists "Editors can insert valuation_rules" on public.valuation_rules;
create policy "Editors can insert valuation_rules" on public.valuation_rules
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('assets.create'));
drop policy if exists "Editors can update valuation_rules" on public.valuation_rules;
create policy "Editors can update valuation_rules" on public.valuation_rules
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')))
  with check (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')));

-- valuation_formulas
drop policy if exists "Editors can view valuation_formulas" on public.valuation_formulas;
create policy "Editors can view valuation_formulas" on public.valuation_formulas
  for select to authenticated using (public.is_active_editor() and public.has_permission('assets.view'));
drop policy if exists "Editors can insert valuation_formulas" on public.valuation_formulas;
create policy "Editors can insert valuation_formulas" on public.valuation_formulas
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('assets.create'));
drop policy if exists "Editors can update valuation_formulas" on public.valuation_formulas;
create policy "Editors can update valuation_formulas" on public.valuation_formulas
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')))
  with check (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')));

-- valuation_formula_terms (không có is_active/deleted_at riêng — sống/chết
-- theo formula cha qua "on delete cascade"; policy soi quyền qua formula).
drop policy if exists "Editors can view valuation_formula_terms" on public.valuation_formula_terms;
create policy "Editors can view valuation_formula_terms" on public.valuation_formula_terms
  for select to authenticated using (public.is_active_editor() and public.has_permission('assets.view'));
drop policy if exists "Editors can insert valuation_formula_terms" on public.valuation_formula_terms;
create policy "Editors can insert valuation_formula_terms" on public.valuation_formula_terms
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('assets.create'));
drop policy if exists "Editors can update valuation_formula_terms" on public.valuation_formula_terms;
create policy "Editors can update valuation_formula_terms" on public.valuation_formula_terms
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')))
  with check (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')));
drop policy if exists "Editors can delete valuation_formula_terms" on public.valuation_formula_terms;
create policy "Editors can delete valuation_formula_terms" on public.valuation_formula_terms
  for delete to authenticated using (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')));

-- asset_items
drop policy if exists "Editors can view asset_items" on public.asset_items;
create policy "Editors can view asset_items" on public.asset_items
  for select to authenticated using (public.is_active_editor() and public.has_permission('assets.view'));
drop policy if exists "Editors can insert asset_items" on public.asset_items;
create policy "Editors can insert asset_items" on public.asset_items
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('assets.create'));
drop policy if exists "Editors can update asset_items" on public.asset_items;
create policy "Editors can update asset_items" on public.asset_items
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')))
  with check (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')));

-- asset_ledger — CHỈ đọc, KHÔNG có policy insert/update/delete cho
-- authenticated (mọi dòng đều do trigger asset_item_log_ledger() ghi, chạy
-- security definer — bỏ qua RLS đúng nghĩa "hệ thống ghi sổ", người dùng
-- thường không tự ý sửa/xoá lịch sử).
drop policy if exists "Editors can view asset_ledger" on public.asset_ledger;
create policy "Editors can view asset_ledger" on public.asset_ledger
  for select to authenticated using (public.is_active_editor() and public.has_permission('assets.view'));

-- asset_kpi
drop policy if exists "Editors can view asset_kpi" on public.asset_kpi;
create policy "Editors can view asset_kpi" on public.asset_kpi
  for select to authenticated using (public.is_active_editor() and public.has_permission('assets.view'));
drop policy if exists "Editors can insert asset_kpi" on public.asset_kpi;
create policy "Editors can insert asset_kpi" on public.asset_kpi
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('assets.create'));
drop policy if exists "Editors can update asset_kpi" on public.asset_kpi;
create policy "Editors can update asset_kpi" on public.asset_kpi
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')))
  with check (public.is_active_editor() and (public.has_permission('assets.edit') or public.has_permission('assets.delete')));

-- asset_reports — mọi editor có quyền xem đều tự ghi được 1 dòng khi họ
-- xuất báo cáo (không cần quyền create riêng cho việc log xuất báo cáo).
drop policy if exists "Editors can view asset_reports" on public.asset_reports;
create policy "Editors can view asset_reports" on public.asset_reports
  for select to authenticated using (public.is_active_editor() and public.has_permission('assets.view'));
drop policy if exists "Editors can insert asset_reports" on public.asset_reports;
create policy "Editors can insert asset_reports" on public.asset_reports
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('assets.view'));


-- ----------------------------------------------------------------------------
-- PHẦN 7 — Seed: Danh mục + Loại tài sản mặc định, ĐÚNG các ví dụ liệt kê ở
-- spec PHẦN V/VI (Admin xem đây là điểm khởi đầu, tự thêm được — is_active
-- true, KHÔNG seed asset_items/valuation_rules/formulas nào — "Không fake
-- data": tài sản/quy tắc định giá thật phải do Admin tự nhập, migration
-- không tự bịa số liệu tài sản/giá trị nào). Idempotent qua unique(slug).
-- ----------------------------------------------------------------------------

insert into public.asset_categories (name, slug, sort_order)
select v.name, v.slug, v.sort_order
from (values
  ('Nội dung', 'noi-dung', 10),
  ('Thương hiệu', 'thuong-hieu', 20),
  ('Hạ tầng', 'ha-tang', 30),
  ('Thiết kế', 'thiet-ke', 40),
  ('Nghiên cứu', 'nghien-cuu', 50),
  ('Kiến thức', 'kien-thuc', 60),
  ('Phần mềm', 'phan-mem', 70),
  ('Marketing', 'marketing', 80),
  ('Kinh doanh', 'kinh-doanh', 90),
  ('Khác', 'khac', 100)
) as v(name, slug, sort_order)
where not exists (select 1 from public.asset_categories c where c.slug = v.slug and c.deleted_at is null);

insert into public.asset_types (category_id, name, slug, sort_order)
select c.id, v.name, v.slug, v.sort_order
from (values
  ('noi-dung', 'Bài viết', 'bai-viet', 10),
  ('noi-dung', 'Số tạp chí', 'so-tap-chi', 20),
  ('noi-dung', 'Series', 'series', 30),
  ('noi-dung', 'Media', 'media', 40),
  ('noi-dung', 'Ảnh', 'anh', 50),
  ('thuong-hieu', 'Banner', 'banner', 60),
  ('thuong-hieu', 'Video', 'video', 70),
  ('thuong-hieu', 'Logo', 'logo', 80),
  ('ha-tang', 'Website', 'website', 90),
  ('ha-tang', 'Dashboard', 'dashboard', 100),
  ('ha-tang', 'Layout Builder', 'layout-builder', 110),
  ('kinh-doanh', 'Premium', 'premium', 120),
  ('phan-mem', 'Prompt Library', 'prompt-library', 130),
  ('kien-thuc', 'Knowledge Base', 'knowledge-base', 140),
  ('phan-mem', 'Automation', 'automation', 150)
) as v(category_slug, name, slug, sort_order)
join public.asset_categories c on c.slug = v.category_slug and c.deleted_at is null
where not exists (select 1 from public.asset_types t where t.slug = v.slug and t.deleted_at is null);

-- ============================================================================
-- HẾT Rev 19.
-- ============================================================================
