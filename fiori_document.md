# Hướng dẫn Tổng quát: Nhúng Chức năng Mới vào Fiori Custom Dashboard

Tài liệu này trả lời câu hỏi thực tiễn: **"Khi muốn thêm một module/chức năng mới từ Backend (ví dụ: entity `JobAbc`) vào Dashboard, tôi phải đụng vào những file nào, mỗi file làm gì?"**

Được rút gọn từ kinh nghiệm triển khai thực tế hai module: **Job Configurations** và **Job History Analytics**.

**Kiến trúc hiện tại (hybrid):** Trang chính vẫn là `sap.fe.core.fpm` + `Main.view.xml` với sidebar và `NavContainer` cho **dashboard, catalog, subscriptions, job configs, job history**. **My Exports** và **7 financial reports** không còn nhúng `macros:FilterBar` / `macros:Table` trong `Main.view.xml`; mỗi mục là route + target `sap.fe.templates.ListReport` trong `manifest.json`, điều hướng bằng `router.navTo()` khi chọn sidebar hoặc quick action. Cách này giảm chi phí FPM XML preprocess lúc khởi động và tránh lỗi khi tạo `sap.fe.core.fpm` thủ công ngoài router.

---

## 1. Bản đồ Kiến trúc Dự án

```
customfioriapplication/
│
├── webapp/
│   ├── manifest.json                     ← "Bản khai sinh" của app
│   ├── annotations/
│   │   └── annotation.xml                ← "Kịch bản UI" cho từng entity
│   ├── ext/
│   │   ├── controller/
│   │   │   ├── BaseController.js         ← Shared utilities
│   │   │   ├── DashboardController.js    ← Dashboard KPIs & chart
│   │   │   ├── JobConfigController.js    ← Job Config CRUD
│   │   │   ├── SubscriptionController.js ← Subscription CRUD + dialog
│   │   │   ├── CatalogController.js      ← Report Catalog tiles
│   │   │   └── JobHistoryController.js   ← History chart
│   │   └── view/
│   │       ├── Main.view.xml             ← "Bản vẽ" giao diện HTML
│   │       └── Main.controller.js        ← "Não" orchestration (delegate to domain controllers)
│   ├── css/
│   │   └── style.css
│   └── i18n/
│       └── i18n.properties
│
├── implementation_plan_job_config.md     ← Tài liệu triển khai Job Config
├── implementation_plan_job_history.md    ← Tài liệu triển khai Job History
├── implementation_plan_reports.md        ← Tài liệu 7 Financial Reports
├── implementation_plan_file.md           ← Tài liệu My Exports (DrsFile)
├── implementation_plan_subscriptions.md  ← Tài liệu Subscriptions
└── implementation_plan_dashboard.md      ← Tài liệu Dashboard
```

---

## 2. Vai trò của từng File

### `manifest.json` — Bản khai sinh & Bộ định tuyến

**Mục đích:** File trung tâm khai báo mọi thứ về app: service kết nối, thư viện dùng, route điều hướng, dependencies.

**Khi thêm module mới, phải sửa file này để:**
- **Khai báo Route mới**: Mỗi trang Object Page (chi tiết) cần một route riêng. Nếu không có route, click vào dòng trên table sẽ báo lỗi không tìm thấy đường dẫn.
- **Khai báo Target**: Trỏ route vào template `sap.fe.templates.ObjectPage` kèm `contextPath` của entity.
- **List Report độc lập (My Exports + 7 reports):** Thêm route + target `sap.fe.templates.ListReport` với `contextPath` và `navigation` (detail → Object Page route tương ứng). Thư viện `sap.fe.templates` phải có trong `sap.ui5/dependencies/libs`.
- **Khai báo Navigation**: Liên kết entity với route Object Page để FPM biết khi click dòng nào thì navigate đâu (trong `DashboardMainPage` cho tab embed; trong từng ListReport target cho màn full-screen).
- **Khai báo Library mới**: Nếu dùng thêm thư viện UI5 chưa có (ví dụ: `sap.viz` cho chart, `sap.suite.ui.microchart` cho sparkline).

```
manifest.json ảnh hưởng: Routing, Navigation, Library loading
```

---

### `annotation.xml` — Kịch bản UI / Metadata mở rộng

**Mục đích:** File XML khai báo "metadata bổ sung" cho từng entity từ backend — nói với Fiori Elements biết: cột nào hiển thị trên table, field nào là filter, trang chi tiết gồm những panel gì, field nào hiển thị badge màu, field nào là hyperlink...

**Đây là file phải sửa NHIỀU NHẤT khi thêm module mới:**
- **`UI.LineItem`**: Danh sách cột hiển thị trên `macros:Table`. Không khai báo → table hiện rỗng.
- **`UI.SelectionFields`**: Danh sách field hiển thị trên `macros:FilterBar`. Không khai báo → filter bar trống.
- **`UI.HeaderInfo`**: Title/Subtitle trên header của Object Page.
- **`UI.Facets` + `UI.FieldGroup`**: Bố cục các nhóm thông tin trên Object Page (các panel section).
- **`UI.Chart`**: Định nghĩa biểu đồ (loại chart, dimension, measure) — dùng khi muốn `macros:Chart`.
- **`Aggregation.ApplySupported`**: Khai báo entity hỗ trợ OData `$apply` query — bắt buộc nếu dùng `macros:Chart`.
- **`Aggregation.CustomAggregate` + `Analytics.Measure`**: Đánh dấu field là analytics measure — bắt buộc nếu entity có field tổng hợp (COUNT, SUM...).

```
annotation.xml ảnh hưởng: Giao diện Table, FilterBar, Object Page, Chart
```

---

### `Main.view.xml` — Bản vẽ Giao diện

**Mục đích:** File XML định nghĩa cấu trúc giao diện Dashboard — sidebar menu, các tab nội dung **nhúng trong NavContainer**, vị trí đặt table/chart/filterbar.

**Khi thêm module mới, phải sửa để:**
- **Thêm menu item mới** vào `tnt:SideNavigation` với `key` (ví dụ `report_xyz`). Với tab **nhúng trong Main**, `key` phải trùng `id` của `ScrollContainer` trong `NavContainer`. Với **List Report full-screen**, `key` chỉ dùng trong controller để map sang `router.navTo("...ListPage")` — **không** cần `ScrollContainer` tương ứng trong `Main.view.xml`.
- **Thêm `ScrollContainer` mới** vào `NavContainer` chỉ khi nội dung nằm **bên trong** ToolPage (macros FilterBar + Table, chart, v.v.). Nếu chọn pattern ListReport như Exports/reports thì **không** thêm page vào đây.
- **Nhúng `macros:FilterBar`**: Trỏ `metaPath` vào `UI.SelectionFields` của entity. Bắt buộc nếu muốn filter.
- **Nhúng `macros:Table`**: Trỏ `metaPath` vào `UI.LineItem` của entity. Đây là control hiển thị danh sách + tự support drill-down Object Page.
- **Nhúng `viz:VizFrame`** (nếu cần chart): Khai báo dataset, dimensions, measures, feeds. **Không dùng `macros:Chart`** trong Dashboard đa-entity — xem lý do ở mục 4.
- **Thêm XML namespace mới** (nếu dùng control mới): Ví dụ `xmlns:viz`, `xmlns:viz.data`, `xmlns:viz.feeds` cho VizFrame chart.

```
Main.view.xml ảnh hưởng: Layout menu, vị trí các control UI
```

---

### `Main.controller.js` + Domain Controllers — Não xử lý Logic

**Mục đích:** `Main.controller.js` đóng vai trò **orchestration** — chỉ nhận event từ view và delegate ngay sang domain controller tương ứng. Toàn bộ business logic nằm trong các domain controller chuyên biệt.

**Domain Controllers hiện có:**
- `DashboardController.js` — Dashboard KPIs (trong đó **System Overview** có 7 tile: Reports, Subscriptions tổng/chạy, Scheduled / Failed / **Finished** / **Cancelled** jobs), chart, recent data, navigate (gồm `router.navTo` cho exports/reports)
- `JobConfigController.js` — Job Config CRUD (Create/Delete)
- `SubscriptionController.js` — Subscription CRUD + dialog chọn Report
- `CatalogController.js` — Report Catalog: load tiles, ActionSheet
- `JobHistoryController.js` — Job History chart: load, configure, aggregate

**Khi thêm module mới, phải sửa:**
- **`Main.controller.js`**: Chỉ thêm event handler delegating sang domain controller mới.
  ```javascript
  onCreateJobAbc: function () { this._jobAbcController.onCreate(this); }
  ```
- **Tạo `JobAbcController.js` mới** kế thừa `BaseController`: chứa toàn bộ logic CRUD, data load, chart.
- **`onItemSelect`** trong `Main.controller.js`: Thêm `if (sKey === "tenTab") { ... }` nếu tab cần trigger data load đặc biệt (ví dụ: chart data). Với key thuộc exports/reports, gọi `getAppComponent().getRouter().navTo(...)` thay vì `NavContainer.to()`.
- **Import domain controller mới** trong `Main.controller.js` và khởi tạo trong `onInit`.

```
Main.controller.js ảnh hưởng: Event delegation
Domain Controllers ảnh hưởng: Business logic, data loading, CRUD
```

---

## 3. Quy trình Nhúng Module Mới (Step-by-step)

### Trường hợp A: Module đơn giản — Chỉ có Table + FilterBar (read-only)
> Ví dụ tương tự: Subscriptions, Report Catalog

| Bước | File | Việc phải làm |
|------|------|---------------|
| 1 | `annotation.xml` | Thêm `UI.LineItem` (định nghĩa cột), `UI.SelectionFields` (filter fields) cho entity mới |
| 2 | `annotation.xml` | Thêm `UI.HeaderInfo`, `UI.Facets`, `UI.FieldGroup` cho Object Page (nếu cần drill-down) |
| 3 | `manifest.json` | Thêm Route + Target `ObjectPage` + Navigation cho entity |
| 4 | `Main.view.xml` | Thêm menu item trong sidebar + thêm `ScrollContainer` chứa `macros:FilterBar` và `macros:Table` |
| 5 | `Main.controller.js` | Không cần sửa gì thêm (FPM tự xử lý navigation và filtering) |

### Trường hợp A′: Read-only nhưng muốn List Report full-screen (startup nhanh)
> Ví dụ đã làm: **My Exports (`DrsFile`)**, **7 financial reports** — không nhúng macros trong `Main.view.xml`. Entity **`DrsFile`** trên backend có **`FileCreationDate`** (từ `ZI_DRS_FILE`) và **`_JobHistory`**; `annotation.xml` local bổ sung **`FileCreationDate`** vào LineItem, FilterBar và facet Admin — xem `implementation_plan_file.md`.

| Bước | File | Việc phải làm |
|------|------|---------------|
| 1–3 | Giống Trường hợp A | `annotation.xml` + Object Page route/target/navigation |
| 4 | `manifest.json` | Thêm route (pattern dạng `EntitySet:?query:`) + target `sap.fe.templates.ListReport` với `contextPath` và `navigation` (detail → Object Page) |
| 5 | `Main.view.xml` | Chỉ thêm **menu item** (sidebar key), **không** thêm `ScrollContainer`/macros cho entity đó |
| 6 | `Main.controller.js` + `DashboardController.js` | Map `key` sidebar → `router.navTo("XxxListPage")` trong `onItemSelect` / `navigateToPage` |

**UX:** Màn List Report là full-screen (không còn sidebar ToolPage); dùng nút Back / breadcrumb của Fiori để quay lại dashboard (`:?query:` về `DashboardMainPage`).

---

### Trường hợp B: Module có CRUD — Table + FilterBar + Create/Delete
> Ví dụ đã làm: **Job Configurations**

| Bước | File | Việc phải làm |
|------|------|---------------|
| 1–4 | Giống Trường hợp A | Xem bảng trên |
| 5 | `Main.view.xml` | Thêm `<macros:actions>` trong `macros:Table` với Action Create và Delete |
| 6 | `Main.controller.js` | Thêm `onCreateJobAbc`: dùng `EditFlow.createDocument()` để navigate sang Object Page tạo mới |
| 7 | `Main.controller.js` | Thêm `onDeleteJobAbc`: phân loại Draft/Active records, gọi `Discard` hoặc `oContext.delete()` |
| 8 | `Main.controller.js` | Đảm bảo `_refreshTable()` được gọi sau mỗi thao tác CRUD để bảng tự refresh |

> **Lưu ý quan trọng:** Trên FPM Custom Page, SAP RAP entity có Draft cần xử lý khác nhau: Active record → `oContext.delete()`, Draft record → gọi bound action `Discard` (không được dùng HTTP DELETE trên draft).

---

### Trường hợp C: Module Analytics — Table + FilterBar + Chart
> Ví dụ đã làm: **Job History Analytics**

| Bước | File | Việc phải làm |
|------|------|---------------|
| 1–4 | Giống Trường hợp A | Xem bảng trên |
| 5 | `manifest.json` | Thêm `"sap.viz": {}` vào `sap.ui5/dependencies/libs` |
| 6 | `annotation.xml` | Thêm `UI.Chart` (type, dimensions, measures), `Aggregation.ApplySupported`, `Aggregation.CustomAggregate`, `Analytics.Measure` (cho measure field) |
| 7 | `Main.view.xml` | Thêm 3 namespace `viz`, `viz.data`, `viz.feeds` vào `<mvc:View>` |
| 8 | `Main.view.xml` | Thêm `<Panel>` bọc `<viz:VizFrame>` với `FlattenedDataset`, `DimensionDefinition`, `MeasureDefinition`, `FeedItem` (dùng `uid` không phải `id`) |
| 9 | `Main.view.xml` | Thêm `search=".onAbcFilterSearch"` vào `macros:FilterBar` |
| 10 | `Main.controller.js` | Import `JSONModel`, khởi tạo model rỗng trong `onInit` |
| 11 | `Main.controller.js` | Thêm `_configureChart()`, `_loadAbcChart()`, `_aggregateAbcData()` |
| 12 | `Main.controller.js` | Thêm `onAbcFilterSearch()` để reload chart khi nhấn "Go" |
| 13 | `Main.controller.js` | Sửa `onItemSelect`: thêm `if (sKey === "tenTab") _loadAbcChart()` |

---

## 4. Những Điểm "Bẫy" Quan trọng Cần Nhớ

### ❶ KHÔNG dùng `macros:Chart` trong Dashboard đa-entity

`macros:Chart` kế thừa `contextPath` của page (`/DrsJobConfig`) — dù bạn set `metaPath` về entity khác, nó vẫn query sai entity. **Luôn dùng `sap.viz.ui5.controls.VizFrame` + `JSONModel`** cho chart trong Custom Dashboard.

### ❷ `FeedItem` dùng `uid` không phải `id`

```xml
<!-- ✅ Đúng -->
<viz.feeds:FeedItem uid="categoryAxis" type="Dimension" values="TenDimension"/>

<!-- ❌ Sai — chart không hiển thị dù không báo lỗi rõ ràng -->
<viz.feeds:FeedItem id="categoryAxis" type="Dimension" values="TenDimension"/>
```

### ❸ `vizProperties` KHÔNG được set trong XML attribute

```xml
<!-- ❌ Sai — UI5 parser hiểu {} là model binding, không phải JSON -->
<viz:VizFrame vizProperties="{title:{visible:false}}">

<!-- ✅ Đúng — set bằng JavaScript trong controller -->
oVizFrame.setVizProperties({ title: { visible: false } });
```

### ❹ Luôn khởi tạo JSONModel rỗng trong `onInit` trước khi view mount

Nếu không, `FlattenedDataset` tìm binding `{chartModel>/chartData}` khi view render → model không tồn tại → lỗi ngay lúc view mount, dù chưa load data.

### ❺ SAP RAP Draft: Xóa Draft khác với xóa Active record

- Active (`IsActiveEntity = true`) → `oContext.delete()` — HTTP DELETE bình thường
- Draft (`IsActiveEntity = false`) → gọi bound action `Discard` — **tuyệt đối không** gọi HTTP DELETE trên draft (backend sẽ từ chối với lỗi "Delete on draft root instance not allowed")

### ❻ Bảng `macros:Table` không tự refresh sau CRUD trên Custom FPM Page

Khác với ListReport template chuẩn, Custom FPM Page không có auto-refresh. Phải gọi tường minh `this.getView().getModel().refresh()` sau mỗi thao tác Create/Delete. Và dùng `router.getRoute("...").attachPatternMatched()` để refresh khi user quay lại từ Object Page.

### ❼ Không khởi tạo `sap.fe.core.fpm` bằng `Component.create()` ngoài router

Component FPM kỳ vọng cấu hình route (`options`) từ manifest/router. Tạo thủ công trong `ComponentContainer` dễ gây lỗi kiểu `Cannot read properties of undefined (reading 'options')`. **Cách đúng:** dùng target `sap.fe.templates.ListReport` (hoặc giữ macros trong `Main.view.xml` nếu chấp nhận chi phí preprocess lúc mở app).

### ❽ `Aggregation.CustomAggregate` phải khai báo ở **EntityType level**, không phải property level

```xml
<!-- ✅ Đúng — khai báo trên EntityType, qualifier = tên field -->
<Annotations Target="...JobHistoryAnalyticsType">
    <Annotation Term="Aggregation.CustomAggregate" Qualifier="JobCountTotal" String="Edm.Int32"/>
</Annotations>

<!-- ❌ Sai — khai báo trên property, FPM không nhận diện được -->
<Annotations Target="...JobHistoryAnalyticsType/JobCountTotal">
    <Annotation Term="Aggregation.CustomAggregate" .../>
</Annotations>
```

---

## 5. Checklist Nhanh Khi Thêm Module Mới

```
[ ] annotation.xml  — UI.LineItem (cột table)
[ ] annotation.xml  — UI.SelectionFields (filter fields)
[ ] annotation.xml  — UI.HeaderInfo + UI.Facets (Object Page)
[ ] manifest.json   — Route + Target ObjectPage
[ ] manifest.json   — Navigation linking
[ ] manifest.json   — Library mới (nếu cần, vd: sap.viz)
[ ] Main.view.xml   — Menu item trong SideNavigation
[ ] Main.view.xml   — ScrollContainer + macros (chỉ nếu tab nhúng trong NavContainer); hoặc bỏ qua nếu dùng ListReport (A′)
[ ] manifest.json   — ListReport route + target + navigation (nếu theo pattern A′)
[ ] Main.controller.js / DashboardController.js — Map sidebar key → router (nếu theo pattern A′)
[ ] Main.view.xml   — XML namespace mới (nếu cần)
[ ] Main.view.xml   — VizFrame + FlattenedDataset (nếu có chart)
[ ] Tạo XxxController.js mới kế thừa BaseController — chứa toàn bộ logic
[ ] Main.controller.js — Import + khởi tạo domain controller mới trong onInit
[ ] Main.controller.js — onItemSelect: thêm case cho tab mới (nếu cần trigger data load)
[ ] Main.controller.js — Event handler delegates → domain controller method
```

---

## 6. Tài liệu Tham khảo Chi tiết

| Module | Tài liệu đầy đủ |
|--------|----------------|
| Job Configurations (CRUD + Object Page) | `implementation_plan_job_config.md` |
| Job History (Analytics + Chart + Read-only) | `implementation_plan_job_history.md` |
| My Exports (`DrsFile`, List Report + Object Page) | `implementation_plan_file.md` |
| 7 Financial Reports (List Report + Object Page) | `implementation_plan_reports.md` |

