# Tài liệu Triển khai: Financial Reports Dashboard (AP / AR / GL)

Tài liệu này ghi nhận lại toàn bộ quá trình thiết kế và triển khai 7 module báo cáo tài chính trên Fiori Custom Dashboard. Sidebar "Reports" vẫn dùng các `key` cũ (`report_ap01` … `report_gl01`), nhưng **danh sách không còn nằm trong `Main.view.xml`**: mỗi report mở bằng route `sap.fe.templates.ListReport` (full-screen), dữ liệu từ các CDS View expose qua OData service `ZSD_DRS_MAIN_O4`.

---

## 1. Tổng quan 7 Report

| Key sidebar | Entity Set | CDS View | Nội dung |
|---|---|---|---|
| `report_ap01` | `AP01_VendorOpenItems` | `ZI_RPT_AP01` | Các khoản phải trả chưa thanh toán theo nhà cung cấp |
| `report_ap02` | `AP02_VendorBalances` | `ZI_RPT_AP02` | Số dư tài khoản phải trả theo kỳ kế toán |
| `report_ap03` | `AP03_APAgingReport` | `ZI_RPT_AP03` | Phân tích tuổi nợ phải trả (Aging) |
| `report_ar01` | `AR01_CustomerOpenItems` | `ZI_RPT_AR01` | Các khoản phải thu chưa thu được theo khách hàng |
| `report_ar02` | `AR02_CustomerBalances` | `ZI_RPT_AR02` | Số dư tài khoản phải thu theo kỳ kế toán |
| `report_ar03` | `AR03_ARAgingReport` | `ZI_RPT_AR03` | Phân tích tuổi nợ phải thu (Aging) |
| `report_gl01` | `GL01_GLAccountBalances` | `ZCR_RPT_GL01` | Số dư tài khoản kế toán tổng hợp (General Ledger) |

### Đặc điểm chung của tất cả 7 report

- **Read-only hoàn toàn**: Đây là các report tài chính — không có tính năng Create/Edit/Delete.
- **Backend đã có đầy đủ UI annotations**: Khác với `DrsJobConfig` và `JobHistoryAnalytics` (phải define annotation local), cả 7 entity này đã có sẵn `UI.LineItem`, `UI.SelectionFields`, `UI.HeaderInfo`, `UI.Facets` trong các file DDLX backend (`zcr_drs_*_mde.ddlx.asddlxs`, `zc_drs_*_mde.ddlx.asddlxs`). Local `annotation.xml` không cần sửa.
- **Object Page drill-down**: Mỗi entity có composition `_Items` trỏ về detail view. FPM Object Page tự render header + detail items.
- **Compound key**: Không có UUID đơn giản như `DrsFile` — tất cả đều dùng key tổng hợp nhiều field (xem chi tiết ở mục 3).

---

## 2. Kiến trúc Backend

### 2.1 Nhóm AP (Accounts Payable — Khoản phải trả)

#### AP01 — Vendor Open Items

**Key fields:** `Ledger`, `SourceLedger`, `CompanyCode`, `Supplier`

| Field | Mô tả |
|---|---|
| `Ledger`, `SourceLedger` | Sổ cái kế toán (Key) |
| `CompanyCode` | Mã công ty (Key) |
| `Supplier` | Mã nhà cung cấp (Key) |
| `SupplierName` | Tên nhà cung cấp |
| `TotalOpenAmount` | Tổng giá trị chưa thanh toán |
| `LocalCurrency` | Đơn vị tiền tệ |
| `MaxDaysOverdue` | Số ngày trễ hạn tối đa |
| `NetDueDate` | Ngày đến hạn thanh toán cuối |
| `_Items` | Navigation → `AP01_VendorOpenItemsDetail` |

**UI.SelectionFields (từ backend DDLX):** `Ledger`, `SourceLedger`, `CompanyCode`, `Supplier`

#### AP02 — Vendor Balances

**Key fields:** `CompanyCode`, `Supplier`, `FiscalYear`, `PostingDate`

| Field | Mô tả |
|---|---|
| `CompanyCode`, `Supplier`, `FiscalYear`, `PostingDate` | Keys |
| `SupplierName`, `Address` | Thông tin nhà cung cấp |
| `LocalCurrency` | Đơn vị tiền tệ |
| `OpeningBalance` | Số dư đầu kỳ |
| `Debit` | Phát sinh Nợ |
| `Credit` | Phát sinh Có |
| `PeriodActivity` | Biến động trong kỳ |
| `ClosingBalance` | Số dư cuối kỳ |
| `_Items` | Navigation → chi tiết chứng từ |

**UI.SelectionFields:** `CompanyCode`, `Supplier`, `FiscalYear`, `PostingDate`

#### AP03 — AP Aging Report

**Key fields:** `CompanyCode`, `Supplier`, `LocalCurrency`

| Field | Mô tả |
|---|---|
| `CompanyCode`, `Supplier`, `LocalCurrency` | Keys |
| `SupplierName` | Tên nhà cung cấp |
| `TotalAmount` | Tổng khoản phải trả |
| `Bucket_NotDue` | Chưa đến hạn |
| `Bucket_0_30` | Trễ 0–30 ngày |
| `Bucket_31_60` | Trễ 31–60 ngày |
| `Bucket_61_90` | Trễ 61–90 ngày |
| `Bucket_Over_90` | Trễ trên 90 ngày |
| `NetDueDate` | Ẩn (`@UI.hidden: true`) |
| `_Items` | Navigation → chi tiết |

**UI.SelectionFields:** `CompanyCode`, `Supplier`

---

### 2.2 Nhóm AR (Accounts Receivable — Khoản phải thu)

#### AR01 — Customer Open Items

**Key fields:** `Ledger`, `SourceLedger`, `CompanyCode`, `Customer`

| Field | Mô tả |
|---|---|
| `Ledger`, `SourceLedger`, `CompanyCode`, `Customer` | Keys |
| `CustomerName` | Tên khách hàng |
| `TotalOpenAmount` | Tổng giá trị chưa thu |
| `LocalCurrency` | Đơn vị tiền tệ |
| `MaxDaysOverdue` | Số ngày trễ hạn tối đa |
| `NetDueDate` | Ngày đến hạn cuối |
| `_Items` | Navigation → chi tiết hóa đơn |

**UI.SelectionFields:** `Ledger`, `SourceLedger`, `CompanyCode`, `Customer`

> **Lưu ý kỹ thuật CDS:** `AR01` và `AP01` đều dùng cơ chế tham số (`p_key_date: $session.system_date`) — dữ liệu open items được tính tại ngày hiện tại của session. Đây là lý do entity này là **view với tham số** (`ZI_RPT_AR01_H(p_key_date: $session.system_date)`), không phải bảng tĩnh.

#### AR02 — Customer Balances

**Key fields:** `CompanyCode`, `Customer`, `FiscalYear`, `PostingDate`

| Field | Mô tả |
|---|---|
| `CompanyCode`, `Customer`, `FiscalYear`, `PostingDate` | Keys |
| `CustomerName`, `Address` | Thông tin khách hàng |
| `LocalCurrency` | Đơn vị tiền tệ |
| `OpeningBalance` | Số dư đầu kỳ |
| `Debit` | Phát sinh Nợ |
| `Credit` | Phát sinh Có |
| `PeriodActivity` | Biến động trong kỳ |
| `ClosingBalance` | Số dư cuối kỳ |
| `_Items` | Navigation → chi tiết |

**UI.SelectionFields:** `CompanyCode`, `Customer`, `FiscalYear`, `PostingDate`

#### AR03 — AR Aging Report

**Key fields:** `CompanyCode`, `Customer`, `LocalCurrency`

| Field | Mô tả |
|---|---|
| `CompanyCode`, `Customer`, `LocalCurrency` | Keys |
| `CustomerName` | Tên khách hàng |
| `TotalAmount` | Tổng khoản phải thu |
| `Bucket_NotDue` | Chưa đến hạn |
| `Bucket_0_30` | Trễ 0–30 ngày |
| `Bucket_31_60` | Trễ 31–60 ngày |
| `Bucket_61_90` | Trễ 61–90 ngày |
| `Bucket_Over_90` | Trễ trên 90 ngày |
| `_Items` | Navigation → chi tiết |

**UI.SelectionFields:** `CompanyCode`, `Customer`

---

### 2.3 Nhóm GL (General Ledger — Kế toán tổng hợp)

#### GL01 — GL Account Balances

**Key fields:** `Ledger`, `SourceLedger`, `FiscalYear`, `Period`, `CompanyCode`, `GLAccount`

| Field | Mô tả |
|---|---|
| `Ledger`, `SourceLedger` | Sổ cái kế toán (Key) |
| `FiscalYear`, `Period` | Năm tài chính, kỳ (Key) |
| `CompanyCode`, `GLAccount` | Mã công ty, tài khoản GL (Key) |
| `GLAccountName` | Tên tài khoản GL |
| `DebitAmount` | Tổng phát sinh Nợ |
| `CreditAmount` | Tổng phát sinh Có |
| `BalanceAmount` | Số dư thuần |
| `LocalCurrency` | Ẩn (`@UI.hidden: true`) |
| `_Items` | Navigation → `ZC_RPT_GL01_I` (chứng từ) |

**UI.SelectionFields (từ backend DDLX):** `FiscalYear`, `Period`, `CompanyCode`

> **Lưu ý:** `GL01` có key tổng hợp 6 fields — phức tạp nhất trong 7 report. URL Object Page sẽ có dạng: `GL01_GLAccountBalances(Ledger='0L',SourceLedger='0L',FiscalYear='2026',Period='001',CompanyCode='1000',GLAccount='1100000000')`.

---

## 3. Routing & Navigation (`manifest.json`)

### 3.1 Vấn đề Compound Key

Khác với `DrsFile` (chỉ có `FileUuid` — 1 key), các report entity dùng **composite key** (nhiều field làm key). Điều này ảnh hưởng trực tiếp đến cách khai báo route pattern.

**Cú pháp route cho compound key trong FPM:**
```
"pattern": "EntitySet(Key1={Key1},Key2={Key2},...):?query:"
```

FPM sẽ tự build URL theo đúng format này khi user click vào dòng trên table, ví dụ:
```
#/AP03_APAgingReport(CompanyCode=1000,Supplier=100000,LocalCurrency=VND)
```

> **Tại sao phải liệt kê đầy đủ tên key trong pattern?** FPM routing dùng pattern để match URL ngược lại khi user copy/paste link hoặc navigate back. Nếu pattern không khớp chính xác với URL format mà FPM tạo ra → không navigate được.

### 3.2 Routes Object Page đã thêm (7 entries)

```json
{ "name": "AP01ObjectPage", "pattern": "AP01_VendorOpenItems(Ledger={Ledger},SourceLedger={SourceLedger},CompanyCode={CompanyCode},Supplier={Supplier}):?query:", "target": "AP01ObjectPage" },
{ "name": "AP02ObjectPage", "pattern": "AP02_VendorBalances(CompanyCode={CompanyCode},Supplier={Supplier},FiscalYear={FiscalYear},PostingDate={PostingDate}):?query:", "target": "AP02ObjectPage" },
{ "name": "AP03ObjectPage", "pattern": "AP03_APAgingReport(CompanyCode={CompanyCode},Supplier={Supplier},LocalCurrency={LocalCurrency}):?query:", "target": "AP03ObjectPage" },
{ "name": "AR01ObjectPage", "pattern": "AR01_CustomerOpenItems(Ledger={Ledger},SourceLedger={SourceLedger},CompanyCode={CompanyCode},Customer={Customer}):?query:", "target": "AR01ObjectPage" },
{ "name": "AR02ObjectPage", "pattern": "AR02_CustomerBalances(CompanyCode={CompanyCode},Customer={Customer},FiscalYear={FiscalYear},PostingDate={PostingDate}):?query:", "target": "AR02ObjectPage" },
{ "name": "AR03ObjectPage", "pattern": "AR03_ARAgingReport(CompanyCode={CompanyCode},Customer={Customer},LocalCurrency={LocalCurrency}):?query:", "target": "AR03ObjectPage" },
{ "name": "GL01ObjectPage", "pattern": "GL01_GLAccountBalances(Ledger={Ledger},SourceLedger={SourceLedger},FiscalYear={FiscalYear},Period={Period},CompanyCode={CompanyCode},GLAccount={GLAccount}):?query:", "target": "GL01ObjectPage" }
```

### 3.3 Navigation linking (trong `DashboardMainPage`)

Các entry sau vẫn cần nếu user mở entity từ **trong** Custom FPM page (ví dụ tương lai nhúng lại macro). Với luồng chính hiện tại, drill-down từ list sang Object Page dùng `navigation` trong từng target **ListReport** (mục 3.5).

```json
"AP01_VendorOpenItems":    { "detail": { "route": "AP01ObjectPage" } },
"AP02_VendorBalances":     { "detail": { "route": "AP02ObjectPage" } },
"AP03_APAgingReport":      { "detail": { "route": "AP03ObjectPage" } },
"AR01_CustomerOpenItems":  { "detail": { "route": "AR01ObjectPage" } },
"AR02_CustomerBalances":   { "detail": { "route": "AR02ObjectPage" } },
"AR03_ARAgingReport":      { "detail": { "route": "AR03ObjectPage" } },
"GL01_GLAccountBalances":  { "detail": { "route": "GL01ObjectPage" } }
```

### 3.5 List Report routes & targets (triển khai hiện tại)

Thêm **7 route** (pattern list, không có key trong path — khác Object Page):

| Route name | Pattern (rút gọn) | Target |
|------------|-------------------|--------|
| `AP01ListPage` | `AP01_VendorOpenItems:?query:` | `AP01ListPage` |
| `AP02ListPage` | `AP02_VendorBalances:?query:` | `AP02ListPage` |
| `AP03ListPage` | `AP03_APAgingReport:?query:` | `AP03ListPage` |
| `AR01ListPage` | `AR01_CustomerOpenItems:?query:` | `AR01ListPage` |
| `AR02ListPage` | `AR02_CustomerBalances:?query:` | `AR02ListPage` |
| `AR03ListPage` | `AR03_ARAgingReport:?query:` | `AR03ListPage` |
| `GL01ListPage` | `GL01_GLAccountBalances:?query:` | `GL01ListPage` |

Mỗi target:

- `"name": "sap.fe.templates.ListReport"`
- `"options.settings.contextPath": "/EntitySetName"` (ví dụ `/AP01_VendorOpenItems`)
- `"options.settings.navigation": { "AP01_VendorOpenItems": { "detail": { "route": "AP01ObjectPage" } } }` (tên entity set khớp metadata)

Kèm theo: `sap.ui5/dependencies/libs` có `"sap.fe.templates": {}`. `sap.fe.app.enableLazyLoading: true` giúp chỉ tải target khi navigate.

### 3.6 Targets Object Page (7 entries — tất cả `editableHeaderContent: false`)

```json
"AP01ObjectPage": { "contextPath": "/AP01_VendorOpenItems",   "editableHeaderContent": false },
"AP02ObjectPage": { "contextPath": "/AP02_VendorBalances",    "editableHeaderContent": false },
"AP03ObjectPage": { "contextPath": "/AP03_APAgingReport",     "editableHeaderContent": false },
"AR01ObjectPage": { "contextPath": "/AR01_CustomerOpenItems", "editableHeaderContent": false },
"AR02ObjectPage": { "contextPath": "/AR02_CustomerBalances",  "editableHeaderContent": false },
"AR03ObjectPage": { "contextPath": "/AR03_ARAgingReport",     "editableHeaderContent": false },
"GL01ObjectPage": { "contextPath": "/GL01_GLAccountBalances", "editableHeaderContent": false }
```

> **Tại sao tất cả `editableHeaderContent: false`?** Đây là financial reports — dữ liệu chỉ được đọc từ journal entries và master data, không cho phép sửa trực tiếp trên UI.

---

## 4. Điều hướng từ sidebar (không còn macros trong `Main.view.xml`)

### 4.1 Vì sao bỏ `ScrollContainer` + macros cho 7 report

Nhúng 7 cặp `macros:FilterBar` + `macros:Table` trong một `Main.view.xml` khiến FPM XML preprocessor chạy toàn bộ lúc mở app → khởi động chậm. Template `sap.fe.templates.ListReport` qua router chỉ preprocess khi user mở đúng route.

### 4.2 Ánh xạ sidebar key → route name

`Main.controller.js` (`onItemSelect`) và `DashboardController.js` (`navigateToPage`) dùng cùng một map:

| Sidebar key | `router.navTo(...)` |
|---|---|
| `report_ap01` | `AP01ListPage` |
| `report_ap02` | `AP02ListPage` |
| `report_ap03` | `AP03ListPage` |
| `report_ar01` | `AR01ListPage` |
| `report_ar02` | `AR02ListPage` |
| `report_ar03` | `AR03ListPage` |
| `report_gl01` | `GL01ListPage` |

### 4.3 UX

Màn List Report là **full-screen** (không còn `ToolPage` sidebar). Người dùng quay lại dashboard bằng nút **Back** / breadcrumb của shell Fiori (hash về route `DashboardMainPage`).

### 4.4 Tính năng Fiori Elements trên List Report

Filter bar, bảng, variant, export, P13n, drill-down Object Page do template `ListReport` + annotations backend đảm nhiệm — tương đương chức năng khi còn dùng macro, không cần XML view tùy chỉnh cho từng report.

---

## 5. Annotation (`annotation.xml`)

**Không có thay đổi nào trong `annotation.xml`.**

Đây là điểm khác biệt quan trọng so với các module trước:

| Module | annotation.xml local | Lý do |
|---|---|---|
| `DrsJobConfig` | Cần định nghĩa đầy đủ | Backend không expose UI annotations ra frontend |
| `JobHistoryAnalytics` | Cần định nghĩa + Aggregation | Backend có annotations nhưng Aggregation annotations thiếu |
| `DrsFile` | LineItem / SelectionFields / FieldGroups (override) | Backend có metadata extension (`FileCreationDate`, …); local bổ sung **`FileCreationDate`** trên list + Admin facet |
| **7 Report entities** | **Không cần** | Backend DDLX đã định nghĩa đủ `LineItem` + `SelectionFields` + `HeaderInfo` + `Facets` |

Các file DDLX backend liên quan:

| Entity | DDLX File |
|---|---|
| `GL01_GLAccountBalances` | `zcr_drs_gl01_mde.ddlx.asddlxs` |
| `AR01_CustomerOpenItems` | `zcr_drs_ar01_mde.ddlx.asddlxs` |
| `AR02_CustomerBalances` | `zcr_drs_ar02_mde.ddlx.asddlxs` |
| `AR03_ARAgingReport` | `zcr_drs_ar03_mde.ddlx.asddlxs` |
| `AP01_VendorOpenItems` | `zc_drs_ap01_mde.ddlx.asddlxs` |
| `AP02_VendorBalances` | `zc_drs_ap02_mde.ddlx.asddlxs` |
| `AP03_APAgingReport` | `zc_drs_ap03_mde.ddlx.asddlxs` |

---

## 6. Controller (`Main.controller.js`, `DashboardController.js`)

**Có thay đổi:** điều hướng report qua router.

- `Main.controller.js` — `onItemSelect`: nếu `sKey` là một trong 7 key `report_*` → `this.getAppComponent().getRouter().navTo("AP01ListPage")` (v.v. theo bảng mục 4.2) và `return` (không gọi `NavContainer.to`).
- `DashboardController.js` — `navigateToPage`: cùng map `report_*` → `router.navTo` (quick action / tile không thể `byId("report_ap01")` vì không còn page trong NavContainer).

List Report template tự xử lý filter, table, navigate Object Page — không cần thêm handler trong controller cho từng report.

---

## 7. Columns và Filters chi tiết

### Columns trên Table (từ `UI.LineItem` backend)

| Report | Columns |
|---|---|
| **AP01** | CompanyCode, Supplier, SupplierName, TotalOpenAmount, LocalCurrency, MaxDaysOverdue, NetDueDate |
| **AP02** | CompanyCode, Supplier, FiscalYear, PostingDate, SupplierName, Address, LocalCurrency, OpeningBalance, Debit, Credit, PeriodActivity, ClosingBalance |
| **AP03** | CompanyCode, Supplier, SupplierName, LocalCurrency, TotalAmount, Bucket_NotDue, Bucket_0_30, Bucket_31_60, Bucket_61_90, Bucket_Over_90 |
| **AR01** | CompanyCode, Customer, CustomerName, TotalOpenAmount, LocalCurrency, MaxDaysOverdue, NetDueDate |
| **AR02** | CompanyCode, Customer, FiscalYear, PostingDate, CustomerName, Address, LocalCurrency, OpeningBalance, Debit, Credit, PeriodActivity, ClosingBalance |
| **AR03** | CompanyCode, Customer, CustomerName, LocalCurrency, TotalAmount, Bucket_NotDue, Bucket_0_30, Bucket_31_60, Bucket_61_90, Bucket_Over_90 |
| **GL01** | FiscalYear, Period, CompanyCode, GLAccount, GLAccountName, DebitAmount, CreditAmount, BalanceAmount |

### Filter Fields (từ `UI.SelectionFields` backend)

| Report | Filter Fields |
|---|---|
| **AP01** | Ledger, SourceLedger, CompanyCode, Supplier |
| **AP02** | CompanyCode, Supplier, FiscalYear, PostingDate |
| **AP03** | CompanyCode, Supplier |
| **AR01** | Ledger, SourceLedger, CompanyCode, Customer |
| **AR02** | CompanyCode, Customer, FiscalYear, PostingDate |
| **AR03** | CompanyCode, Customer |
| **GL01** | FiscalYear, Period, CompanyCode |

---

## 8. Tổng Kết

**Các file đã thay đổi (trạng thái sau Option C — List Report):**

| File | Thay đổi |
|---|---|
| `manifest.json` | +7 routes list + 7 targets `sap.fe.templates.ListReport` (mỗi target có `navigation` → Object Page); lib `sap.fe.templates`; giữ nguyên 7 route/target Object Page (compound key) |
| `Main.view.xml` | **Xóa** 7 khối `ScrollContainer` + macros cho report (sidebar keys giữ nguyên) |
| `Main.controller.js` | `onItemSelect`: map `report_*` → `router.navTo` |
| `DashboardController.js` | `navigateToPage`: cùng map cho tile/quick action |
| `annotation.xml` | **Không thay đổi** |

**Luồng hoạt động (giống nhau cho cả 7 report):**

```
User click menu sidebar (vd: "Report AP-03")
    → onItemSelect() → router.navTo("AP03ListPage")
    → Target ListReport load (lazy) → FilterBar + Table từ annotations backend
    → GET /AP03_APAgingReport?$select=...&$top=...

User nhập filter rồi nhấn "Go"
    → ListReport tự build OData query — không cần code controller

User click vào một dòng
    → navigation trong target ListReport → AP03ObjectPage
    → URL: #/AP03_APAgingReport(CompanyCode=...,Supplier=...,LocalCurrency=...)
    → Object Page: HeaderInfo + Facets + _Items
```

**So sánh độ phức tạp triển khai:**

| Module | Số file sửa | Cần annotation local? | Controller |
|---|---|---|---|
| Job Config | 4 | Có (đầy đủ) | CRUD logic |
| Job History | 4 | Có (Aggregation) | Chart data |
| DrsFile (list) | manifest + 2 JS | Có (SelectionFields) | Router map |
| **7 Reports** | manifest + Main.view + 2 JS | **Không** | Chỉ map router |

> **Ghi chú:** List Report là template chuẩn SAP — có auto-refresh / lifecycle tốt hơn so với `macros:Table` nhúng trong Custom FPM page; trade-off là màn list full-screen, không còn sidebar ToolPage.

