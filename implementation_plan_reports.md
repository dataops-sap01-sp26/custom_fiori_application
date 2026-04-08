# Tài liệu Triển khai: Financial Reports Dashboard (AP / AR / GL)

Tài liệu này ghi nhận lại toàn bộ quá trình thiết kế và triển khai 7 module báo cáo tài chính trên Fiori Custom Dashboard. Mỗi report là một tab riêng trong sidebar "Reports", hiển thị dữ liệu từ các CDS View chuyên dụng được expose qua OData service `ZSD_DRS_MAIN_O4`.

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

### 3.2 Routes đã thêm (7 entries)

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

```json
"AP01_VendorOpenItems":    { "detail": { "route": "AP01ObjectPage" } },
"AP02_VendorBalances":     { "detail": { "route": "AP02ObjectPage" } },
"AP03_APAgingReport":      { "detail": { "route": "AP03ObjectPage" } },
"AR01_CustomerOpenItems":  { "detail": { "route": "AR01ObjectPage" } },
"AR02_CustomerBalances":   { "detail": { "route": "AR02ObjectPage" } },
"AR03_ARAgingReport":      { "detail": { "route": "AR03ObjectPage" } },
"GL01_GLAccountBalances":  { "detail": { "route": "GL01ObjectPage" } }
```

### 3.4 Targets (7 entries — tất cả `editableHeaderContent: false`)

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

## 4. Giao diện Điều khiển (`Main.view.xml`)

### 4.1 Pattern chung cho mỗi report tab

Mỗi trong 7 `ScrollContainer` placeholder được thay bằng cấu trúc giống nhau:

```xml
<ScrollContainer id="report_xxx" horizontal="false" vertical="true" height="100%">
    <macros:FilterBar
        id="xxxFilterBar"
        metaPath="/EntitySetName/@com.sap.vocabularies.UI.v1.SelectionFields"
        liveMode="false"/>
    <macros:Table
        id="xxxTable"
        metaPath="/EntitySetName/@com.sap.vocabularies.UI.v1.LineItem"
        readOnly="true"
        enableExport="true"
        enableAutoColumnWidth="true"
        variantManagement="Control"
        p13nMode="Column,Sort,Filter"
        headerText="Tên report"
        filterBar="xxxFilterBar"
        growingThreshold="20">
    </macros:Table>
</ScrollContainer>
```

> **Tại sao không có `<macros:actions>`?** Không cần Create/Delete trên financial reports. `readOnly="true"` là đủ.

> **Tại sao `metaPath` trỏ thẳng vào SelectionFields/LineItem từ backend?** Khác với `DrsFile` phải thêm `SelectionFields` vào `annotation.xml` local, cả 7 entity report này đã có đầy đủ cả `UI.LineItem` lẫn `UI.SelectionFields` trong DDLX backend. `macros:FilterBar` và `macros:Table` đọc trực tiếp từ `$metadata` của service — không cần override local.

### 4.2 Bảng ánh xạ sidebar key → control IDs

| Sidebar key | FilterBar ID | Table ID | Entity Set |
|---|---|---|---|
| `report_ap01` | `ap01FilterBar` | `ap01Table` | `AP01_VendorOpenItems` |
| `report_ap02` | `ap02FilterBar` | `ap02Table` | `AP02_VendorBalances` |
| `report_ap03` | `ap03FilterBar` | `ap03Table` | `AP03_APAgingReport` |
| `report_ar01` | `ar01FilterBar` | `ar01Table` | `AR01_CustomerOpenItems` |
| `report_ar02` | `ar02FilterBar` | `ar02Table` | `AR02_CustomerBalances` |
| `report_ar03` | `ar03FilterBar` | `ar03Table` | `AR03_ARAgingReport` |
| `report_gl01` | `gl01FilterBar` | `gl01Table` | `GL01_GLAccountBalances` |

---

## 5. Annotation (`annotation.xml`)

**Không có thay đổi nào trong `annotation.xml`.**

Đây là điểm khác biệt quan trọng so với các module trước:

| Module | annotation.xml local | Lý do |
|---|---|---|
| `DrsJobConfig` | Cần định nghĩa đầy đủ | Backend không expose UI annotations ra frontend |
| `JobHistoryAnalytics` | Cần định nghĩa + Aggregation | Backend có annotations nhưng Aggregation annotations thiếu |
| `DrsFile` | Cần thêm `SelectionFields` | Backend thiếu `UI.SelectionFields` |
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

## 6. Controller (`Main.controller.js`)

**Không có thay đổi nào trong Controller.**

Tất cả 7 report là read-only với FilterBar + Table đơn giản:
- `macros:FilterBar` tự render filter fields từ `UI.SelectionFields`
- `macros:Table` tự kết nối với FilterBar qua `filterBar="..."`, tự filter khi nhấn "Go"
- FPM tự xử lý navigation sang Object Page khi click dòng
- Không có custom actions, không có chart, không có data aggregation

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

**Các file đã thay đổi:**

| File | Thay đổi |
|---|---|
| `manifest.json` | +7 routes, +7 targets, +7 navigation entries |
| `Main.view.xml` | Thay 7 placeholder `<Title>` bằng `macros:FilterBar` + `macros:Table` |
| `Main.controller.js` | **Không thay đổi** |
| `annotation.xml` | **Không thay đổi** |

**Luồng hoạt động (giống nhau cho cả 7 report):**

```
User click menu sidebar (vd: "Report AP-03")
    → onItemSelect() → byId("pageContainer").to(byId("report_ap03"))
    → macros:FilterBar render: CompanyCode / Supplier (từ UI.SelectionFields backend)
    → macros:Table load: GET /AP03_APAgingReport?$select=...&$top=20

User nhập filter rồi nhấn "Go"
    → FPM tự build query: GET /AP03_APAgingReport?$filter=CompanyCode eq '1000'&...
    → Table tự refresh — không cần code controller

User click vào dòng "Nhà cung cấp XYZ"
    → FPM navigation → AP03ObjectPage
    → URL: #/AP03_APAgingReport(CompanyCode=1000,Supplier=100000,LocalCurrency=VND)
    → Object Page render HeaderInfo + Facets từ backend DDLX
    → Panel "General" hiển thị thông tin tổng hợp
    → Panel "Items" hiển thị từng chứng từ kế toán chi tiết (_Items)
```

**So sánh độ phức tạp triển khai:**

| Module | Số file sửa | Cần annotation local? | Cần controller code? |
|---|---|---|---|
| Job Config | 4 | Có (đầy đủ) | Có (CRUD logic) |
| Job History | 4 | Có (Aggregation) | Có (Chart data) |
| DrsFile | 3 | Có (SelectionFields) | Không |
| **7 Reports** | **2** | **Không** | **Không** |

> **Lý do 7 report đơn giản nhất:** Đây là các entity thuần read-only với backend đã hoàn chỉnh annotations. FPM xử lý 100% — FilterBar, Table, Object Page, Navigation — mà không cần bất kỳ dòng code JavaScript hay annotation XML nào từ phía frontend.
