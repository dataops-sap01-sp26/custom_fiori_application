# Kiến trúc Backend DRS (Data Report Subscription) — `d:\ders-main-backup`

> Đây là backend ABAP SAP RAP (RESTful Application Programming) triển khai hệ thống **Đăng ký Báo cáo & Lập lịch Job tự động** cho SAP S/4HANA.

---

## 1. Tổng quan hệ thống

```
┌─────────────────────────────── FIORI UI ─────────────────────────────────┐
│  [Job Configuration]     [Subscription]     [Job History Analytics]       │
└──────────────┬─────────────────┬──────────────────────┬───────────────────┘
               │ OData V4        │ OData V4             │ OData V2 (Analytics)
┌──────────────▼─────────────────▼──────────────────────▼───────────────────┐
│                         RAP Business Objects                               │
│  ZIR_DRS_JOB_CONFIG  ZIR_DRS_SUBSCR  ZIR_DRS_CATALOG  ZI_DRS_JOB_HISTORY │
└──────────────┬─────────────────┬──────────────────────────────────────────┘
               │                 │
┌──────────────▼─────────────────▼──────────────────────────────────────────┐
│                         ABAP Classes (Business Logic)                      │
│  ZCL_JOB_BUSINESS_LOGIC  ZCL_REPORT_FACTORY  ZCL_JOB_LOG                  │
│  ZCL_MANAGER_EMAIL       ZCL_*_FORMATTER     ZCL_REPORT_*                  │
└──────────────┬─────────────────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────────────────┐
│                          Database Tables                                     │
│  ZDRS_JOB_CONFIG  ZDRS_SUBSCR  ZDRS_FILE  ZDRS_JOB_HISTORY                 │
│  ZDRS_PARAM_GL01 .. ZDRS_PARAM_AP03  ZDRS_CUSTOMERS  ZDRS_VENDORS           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Ba Business Object chính (RAP)

### 2.1 `ZIR_DRS_JOB_CONFIG` — Job Configuration BO
- **Bảng dữ liệu**: `ZDRS_JOB_CONFIG` (active), `ZDRS_JOB_CONFIGD` (draft)
- **BDEF internal**: `zir_drs_job_config.bdef.asbdef`
- **BDEF projection**: `zcr_drs_job_config.bdef.asbdef`
- **Behavior class**: `ZBP_DRS_JOB_CONFIG` → `zbp_drs_job_config.clas.locals_imp.abap`

**Chức năng**:
| Method | Loại | Mô tả |
|--------|-------|--------|
| `setDefaultValues` | Determination (ON MODIFY) | Gán JobId, JobTemplateName, RunType, Timezone, PeriodicGranularity mặc định |
| `validateDescription` | Validation (ON SAVE) | Bắt buộc JobText không được trống |
| `validateRunType` | Validation | Kiểm tra RunType hợp lệ (`ZDRS_RUN_TYPE_VT`) |
| `validateSubscrId` | Validation | Kiểm tra SubscrId tồn tại trong DB |
| `validatePeriodicGranularity` | Validation | Validate granularity cho Periodic job |
| `validateShiftDirection` | Validation | Validate ShiftDirection hợp lệ |
| `validateStartRestriction` | Validation | Validate ExceptionRestrictionCode |
| `validateCalendarId` | Validation | Validate ExceptionCalendarId từ CDS VH |
| `validateRunSettings` | Validation (ON SAVE) | **Validate toàn bộ logic lập lịch** (xem bên dưới) |
| `scheduleJob` | Action (MODIFY) | **Kết nối CL_APJ_RT_API để lập lịch APJ** |
| `cancelJob` | Action (MODIFY) | Hủy job đang chạy qua APJ API |
| `refreshStatus` | Action (MODIFY) | Cập nhật trạng thái job từ APJ |

**Các loại RunType được hỗ trợ**:
- `I` — Immediate (chạy ngay)
- `O` — Once (chạy một lần tại thời điểm cụ thể)
- `P` — Periodic (lặp lại theo granularity)

**Periodic Granularity** (`LS_JOB-PeriodicGranularity`):
- `MI` — Mỗi N phút
- `H` — Mỗi N giờ
- `D` — Mỗi N ngày
- `W` — Hàng tuần (chọn ngày trong tuần)
- `WM` — Tuần thứ N trong tháng
- `MO` — Hàng tháng vào ngày cụ thể

**Logic đặc biệt trong `scheduleJob`**:
- Chuyển đổi timestamp từ UTC → Local Timezone (không lưu trực tiếp UTC)
- **W/WM workaround**: Do `CL_APJ_RT_API` không hỗ trợ `IV_ADJUST_START_INFO`, code phải tự tính toán ngày bắt đầu khớp với ngày trong tuần
- **EndInfo workaround**: Trên môi trường SAP TUM, `DATE` type hoạt động cho `W`, `D`, `MO`, `WM`; còn `H`/`MI` dùng `NUM` (số lần lặp)

---

### 2.2 `ZIR_DRS_SUBSCR` — Subscription BO
- **Bảng dữ liệu**: `ZDRS_SUBSCR` (active), `ZDRS_D_SUBSCR` (draft)
- **BDEF internal**: `zir_drs_subscr.bdef.asbdef`
- **BDEF projection**: `zcr_drs_subscr.bdef.asbdef`
- **Behavior class**: `ZBP_R_SUBSCR` → `zbp_r_subscr.clas.locals_imp.abap`

**Cấu trúc Composition (Parent–Child)**:
```
Subscription (ZIR_DRS_SUBSCR)
├── _ParamGL01 (ZI_DRS_PARAM_GL01) → zdrs_param_gl01
├── _ParamAR01 (ZI_DRS_PARAM_AR01) → zdrs_param_ar01
├── _ParamAR02 (ZI_DRS_PARAM_AR02) → zdrs_param_ar02
├── _ParamAR03 (ZI_DRS_PARAM_AR03) → zdrs_param_ar03
├── _ParamAP01 (ZI_DRS_PARAM_AP01) → zdrs_param_ap01
├── _ParamAP02 (ZI_DRS_PARAM_AP02) → zdrs_param_ap02
├── _ParamAP03 (ZI_DRS_PARAM_AP03) → zdrs_param_ap03
├── _Customers (ZI_DRS_CUSTOMERS)  → zdrs_customers
└── _Vendors   (ZI_DRS_VENDORS)    → zdrs_vendors
```

**Các module báo cáo (ReportId)**:
| ReportId | Loại | Tham số bắt buộc |
|----------|------|------------------|
| `GL-01` | General Ledger | CompanyCode, FiscalYear, Period, GlAccount range |
| `AR-01` | Accounts Receivable 01 | CompanyCode, Customer range, KeyDate |
| `AR-02` | Accounts Receivable 02 | CompanyCode, Customer range, FiscalYear |
| `AR-03` | Accounts Receivable 03 | CompanyCode, Customer range, KeyDate |
| `AP-01` | Accounts Payable 01 | CompanyCode, Vendor range, KeyDate |
| `AP-02` | Accounts Payable 02 | CompanyCode, Vendor range, FiscalYear |
| `AP-03` | Accounts Payable 03 | CompanyCode, Vendor range, KeyDate |

**Actions trên Subscription**:
| Action | Mô tả |
|--------|--------|
| `copySubscription` | Tạo bản sao Subscription kèm ParamGL01 |
| `pauseSubscription` | Status: A → P (Paused) |
| `resumeSubscription` | Status: P → A (Active) |
| `createReportParams` | Tạo child parameter record theo ReportId |

**Authorization**:
- **Global**: Cho phép CREATE/UPDATE/DELETE ở cấp toàn cục
- **Instance**: Chỉ creator (`CreatedBy`) được sửa/xóa; kiểm tra `ZDRS_REP` (Report access) và `F_BKPF_BUK` (Company Code access)
- **Instance Features**: Khóa field `ReportId` nếu đã có parameter record con

---

### 2.3 `ZIR_DRS_CATALOG` — Report Catalog BO
- Quản lý danh mục báo cáo có thể đăng ký
- BDEF: `zir_drs_catalog.bdef.asbdef`

---

## 3. Luồng thực thi Job (Core Flow)

```
[Fiori: scheduleJob action]
        │
        ▼
ZBP_DRS_JOB_CONFIG::scheduleJob
        │  → CL_APJ_RT_API=>SCHEDULE_JOB()
        │     (lập lịch APJ với template ZDRS_JOB_TEMPLATE_V2)
        │
[APJ tự động trigger theo lịch]
        │
        ▼
ZCL_JOB_BUSINESS_LOGIC::IF_APJ_RT_EXEC_OBJECT~EXECUTE()
        │
        ├─ PARSE_PARAMETERS()      → Đọc JOB_UUID / JOB_ID từ APJ params
        ├─ FIND_JOB_RECORD()       → Tìm Subscription từ DB (ZDRS_JOB_CONFIG)
        ├─ ZCL_JOB_LOG::LOG_JOB_START()  → Ghi lịch sử chạy vào ZDRS_JOB_HISTORY
        ├─ PROCESS_SUBSCRSCRIPTION()
        │       ├─ Đọc Subscription (ZDRS_SUBSCR)
        │       ├─ ZCL_REPORT_FACTORY::CREATE() → Dynamic instantiate Report class
        │       ├─ IS_DUPLICATE()  → Kiểm tra chạy trùng trong 30 giây
        │       ├─ LO_REPORT->EXECUTE() → Chạy báo cáo → trả về XSTRING file
        │       ├─ STORE_FILE()    → Lưu file vào ZDRS_FILE
        │       └─ ZCL_MANAGER_EMAIL::SEND_EMAIL() → Gửi email đến Email_To/CC
        └─ ZCL_JOB_LOG::LOG_JOB_END() → Cập nhật trạng thái F(Finish) hoặc A(Failed)
```

---

## 4. Report Factory Pattern

```
ZCL_REPORT_FACTORY::CREATE(ReportId)
        │
        ├─ Lookup ZDRS_RP_REGISTRY → class name
        └─ CREATE OBJECT TYPE (class_name) → ZIF_REPORT
```

**Interface `ZIF_REPORT`**:
```abap
METHODS EXECUTE
  RETURNING VALUE(RS_RESULT) TYPE TY_RESULT.

" TY_RESULT:
"   XSTRING          → Binary file content
"   EXTENSION        → 'csv' / 'xlsx'
"   MIME_TYPE        → 'text/csv' / application/...
"   FILE_NAME_PREFIX → 'GL_LineItems'
```

**Các class report cụ thể**:
- `ZCL_REPORT_GL01` → GL Line Items
- `ZCL_REPORT_AR01/AR02/AR03` → AR Reports
- `ZCL_REPORT_AP01/AP02/AP03` → AP Reports
- Mỗi loại có `ZCL_XLSX_FORMATTER_*` tương ứng

---

## 5. Formatter Pattern

```
ZCL_FORMATTER_FACTORY → ZIF_FILE_FORMATTER
│
├── ZCL_CSV_FORMATTER   → output CSV
└── ZCL_XLSX_FORMATTER  → output XLSX (có các subclass per-report)
    ├── ZCL_XLSX_FORMATTER_GL01
    ├── ZCL_XLSX_FORMATTER_AR01/AR02/AR03
    └── ZCL_XLSX_FORMATTER_AP01/AP02/AP03
```

---

## 6. Database Tables chính

| Table | Mô tả |
|-------|--------|
| `ZDRS_JOB_CONFIG` | Job configuration (active) |
| `ZDRS_JOB_CONFIGD` | Job configuration (draft) |
| `ZDRS_SUBSCR` | Subscription records |
| `ZDRS_D_SUBSCR` | Subscription draft |
| `ZDRS_PARAM_GL01..AP03` | Report parameters per module |
| `ZDRS_D_PGL01..D_PAP03` | Parameter drafts |
| `ZDRS_JOB_HISTORY` | Job execution history (log) |
| `ZDRS_FILE` | Generated report files (BLOB) |
| `ZDRS_CUSTOMERS` | Customer list per subscription |
| `ZDRS_VENDORS` | Vendor list per subscription |
| `ZDRS_RP_REGISTRY` | Report ID → Class name mapping |
| `ZDRS_FM_REGISTRY` | Formatter mapping |
| `ZDRS_CATALOG` | Report catalog definitions |

---

## 7. CDS Views Layer

### Analytical (Job History)
```
ZDRS_JOB_HISTORY (table)
    └── ZI_DRS_JOB_HISTORY_FACT   (CDS Fact view)
        └── ZI_DRS_JOB_HISTORY_CUBE (CDS Cube — OLAP)
            └── ZC_DRS_JOB_HISTORY_CUBE (Consumption/Query)
                ↗ ZUI_DRS_JH_ANALYTICS_O2 (OData V2 service)
```

### Transactional
```
ZIR_DRS_SUBSCR.ddls (Internal view)
    └── ZCR_DRS_SUBSCR.ddls (Projection/Consumption view)
        └── ZUID_DRS_MAIN_O4 (OData V4 service binding)
```

### Value Helps (VH)
- `ZI_VH_DRS_FORMAT` — Định dạng output
- `ZI_VH_DRS_MODULE` — Module/Report
- `ZI_VH_DRS_CALENDAR_ID` — Factory Calendar
- `ZI_VH_DRS_RUN_TYPE` — Run type
- `ZI_VH_DRS_PERIODIC_GRANULARITY` — Granularity
- `ZI_VH_DRS_SHIFT_DIRECTION` — Shift direction
- `ZI_VH_DRS_START_RESTRICTION` — Start restriction

---

## 8. Job Status Codes (APJ)

| Code | Ý nghĩa | Có thể Cancel? |
|------|---------|----------------|
| `S` | Scheduled | ✅ |
| `Y` | Ready | ✅ |
| `P` | Released | ✅ |
| `F` | Finished | ❌ |
| `A` | Failed | ❌ |
| `C` | Cancelled | ❌ |
| `D` | Deleted | ❌ |
| `K` | Skipped | ❌ |
| `U` | User Error | ❌ |
| `X` | Unknown | ❌ |

---

## 9. Authorization Objects

| Object | Trường | Dùng cho |
|--------|--------|---------|
| `ZDRS_REP` | `ZREP_ID`, `ACTVT=03` | Quyền xem/sửa theo Report ID |
| `F_BKPF_BUK` | `BUKRS`, `ACTVT=03` | Quyền theo Company Code |
| DCL (`ZIR_DRS_SUBSCR`) | — | Row-level access control |

---

## 10. Những điểm đáng chú ý / Technical Decisions

1. **Number Range (`ZDRS_JOBID`)**: JobId được tạo qua SNRO, fallback về MAX+1 nếu có lỗi
2. **Duplicate detection**: Kiểm tra 30 giây để tránh job chạy trùng do APJ retry
3. **Timezone handling**: Timestamp UI → UTC → Convert về Local TZ của job
4. **EndInfo DATE vs NUM**: Bug trên môi trường SAP TUM — `DATE` type chỉ hoạt động cho W/D/MO/WM; H/MI phải dùng NUM
5. **W/WM date-shift workaround**: Server APJ validate ngày bắt đầu phải khớp weekday — code backend tự shift ngày trước khi submit
6. **Draft enabled**: Cả Job Config và Subscription đều hỗ trợ Draft (người dùng có thể lưu tạm trước khi Activate)
7. **Composition cascade delete**: Khi xóa Subscription, SAP RAP tự xóa các child Parameter records

