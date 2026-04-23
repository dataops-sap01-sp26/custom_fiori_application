# Hướng dẫn Tổng quát: Nhúng Chức năng Mới vào Fiori Custom Dashboard

Tài liệu này trả lời câu hỏi thực tiễn: **"Khi muốn thêm một module/chức năng mới từ Backend (ví dụ: entity `JobAbc`) vào Dashboard, tôi phải đụng vào những file nào, mỗi file làm gì?"**

Được rút gọn từ kinh nghiệm triển khai thực tế hai module: **Job Configurations** và **Job History Analytics**.

**Kiến trúc hiện tại (unified macros):** Trang chính là `sap.fe.core.fpm` + `Main.view.xml` với sidebar và `NavContainer`. **Tất cả tab** — dashboard, catalog, subscriptions, job configs, job history, **My Exports** và **7 financial reports** — đều có `ScrollContainer` tương ứng nhúng `macros:FilterBar` / `macros:Table` trực tiếp trong `Main.view.xml`. Điều hướng giữa các tab luôn qua `NavContainer.to(oPage)`. Chỉ có **Object Page** (chi tiết record) mới dùng route riêng trong `manifest.json` (`sap.fe.templates.ObjectPage`). Không sử dụng `sap.fe.templates.ListReport` route hay `router.navTo()` để chuyển tab.

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
│   │   │   ├── JobHistoryController.js   ← History chart
│   │   │   └── UserController.js         ← User session & profile
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
- **Khai báo Navigation**: Liên kết entity với route Object Page trong mục `DashboardMainPage.options.settings.navigation` — FPM biết khi click dòng nào trên `macros:Table` thì navigate sang Object Page nào.
- **Khai báo Library mới**: Nếu dùng thêm thư viện UI5 chưa có (ví dụ: `sap.viz` cho chart, `sap.suite.ui.microchart` cho sparkline).

> **Lưu ý:** Không cần và không dùng route `sap.fe.templates.ListReport` cho bất kỳ tab nào — tất cả list đều nhúng macros trực tiếp trong `Main.view.xml`.

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
- **Thêm menu item mới** vào `tnt:SideNavigation` với `key` (ví dụ `report_xyz`). `key` phải trùng `id` của `ScrollContainer` tương ứng trong `NavContainer`.
- **Thêm `ScrollContainer` mới** vào `NavContainer` cho mọi tab mới — kể cả tab read-only hay report. Tất cả nội dung đều nhúng trực tiếp trong NavContainer.
- **Nhúng `macros:FilterBar`**: Trỏ `metaPath` vào `UI.SelectionFields` của entity. Bắt buộc nếu muốn filter.
- **Nhúng `macros:Table`**: Trỏ `metaPath` vào `UI.LineItem` hoặc `UI.PresentationVariant` của entity. Đây là control hiển thị danh sách + tự support drill-down Object Page.
- **Nhúng `viz:VizFrame`** (nếu cần chart): Khai báo dataset, dimensions, measures, feeds. **Không dùng `macros:Chart`** trong Dashboard đa-entity — xem lý do ở mục 4.
- **Thêm XML namespace mới** (nếu dùng control mới): Ví dụ `xmlns:viz`, `xmlns:viz.data`, `xmlns:viz.feeds` cho VizFrame chart.

```
Main.view.xml ảnh hưởng: Layout menu, vị trí các control UI
```

---

### `Main.controller.js` + Domain Controllers — Não xử lý Logic

**Mục đích:** `Main.controller.js` đóng vai trò **orchestration** — chỉ nhận event từ view và delegate ngay sang domain controller tương ứng. Toàn bộ business logic nằm trong các domain controller chuyên biệt.

**Domain Controllers hiện có:**
- `DashboardController.js` — Dashboard KPIs (7 tile: Reports, Subscriptions tổng/active, Scheduled / Failed / Finished / Cancelled jobs), chart, recent data, điều hướng tab qua `NavContainer.to()`
- `JobConfigController.js` — Job Config CRUD (Create/Delete)
- `SubscriptionController.js` — Subscription CRUD + dialog chọn Report
- `CatalogController.js` — Report Catalog: load tiles theo nhóm, ActionSheet
- `JobHistoryController.js` — Job History chart: load, configure, aggregate
- `UserController.js` — User session: load thông tin user hiện tại từ `UserSession` entity

**Khi thêm module mới, phải sửa:**
- **`Main.controller.js`**: Chỉ thêm event handler delegating sang domain controller mới.
  ```javascript
  onCreateJobAbc: function () { this._jobAbcController.onCreate(this); }
  ```
- **Tạo `JobAbcController.js` mới** kế thừa `BaseController`: chứa toàn bộ logic CRUD, data load, chart.
- **`onItemSelect`** trong `Main.controller.js`: Thêm `if (sKey === "tenTab") { ... }` nếu tab cần trigger data load đặc biệt (ví dụ: chart data, catalog tiles). Điều hướng luôn dùng `this.byId("pageContainer").to(this.byId(sKey))`.
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

### Trường hợp A (áp dụng cho mọi tab — kể cả exports và reports)
> **Tất cả tab** trong project đều nhúng macros trực tiếp trong `Main.view.xml`. Entity **`DrsFile`** trên backend có **`FileCreationDate`** (từ `ZI_DRS_FILE`) và **`_JobHistory`**; `annotation.xml` local bổ sung **`FileCreationDate`** vào LineItem, FilterBar và facet Admin — xem `implementation_plan_file.md`. 7 financial reports (AP01–GL01) tương tự: mỗi report có `ScrollContainer` + `macros:FilterBar` + `macros:Table` riêng.

> **Không tồn tại pattern "List Report full-screen"** trong codebase hiện tại — không có `sap.fe.templates.ListReport` route nào trong `manifest.json`, không dùng `router.navTo()` để chuyển tab.

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

Component FPM kỳ vọng cấu hình route (`options`) từ manifest/router. Tạo thủ công trong `ComponentContainer` dễ gây lỗi kiểu `Cannot read properties of undefined (reading 'options')`. **Cách đúng trong project này:** giữ macros trong `Main.view.xml` + `NavContainer.to()` cho tất cả tab. Chỉ Object Page mới dùng route riêng (`sap.fe.templates.ObjectPage`).

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
[ ] Main.view.xml   — Menu item trong SideNavigation (key = id của ScrollContainer)
[ ] Main.view.xml   — ScrollContainer + macros:FilterBar + macros:Table (cho mọi tab mới)
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
| My Exports (`DrsFile`, macros embedded + Object Page) | `implementation_plan_file.md` |
| 7 Financial Reports (macros embedded + Object Page) | `implementation_plan_reports.md` |
| Subscriptions (CRUD + Dialog + Object Page) | `implementation_plan_subscriptions.md` |
| User Info Service | `implementation_plan_user_info_service.md` |

