# Hướng dẫn Tổng quát: Nhúng Chức năng Mới vào Fiori Custom Dashboard

Tài liệu này trả lời câu hỏi thực tiễn: **"Khi muốn thêm một module/chức năng mới từ Backend (ví dụ: entity `JobAbc`) vào Dashboard, tôi phải đụng vào những file nào, mỗi file làm gì?"**

Được rút gọn từ kinh nghiệm triển khai thực tế hai module: **Job Configurations** và **Job History Analytics**.

---

## 1. Bản đồ Kiến trúc Dự án

```
customfioriapplication/
│
├── webapp/
│   ├── manifest.json                  ← "Bản khai sinh" của app
│   ├── annotations/
│   │   └── annotation.xml             ← "Kịch bản UI" cho từng entity
│   └── ext/
│       └── view/
│           ├── Main.view.xml          ← "Bản vẽ" giao diện HTML
│           └── Main.controller.js     ← "Não" xử lý logic JS
│
├── implementation_plan_job_config.md  ← Tài liệu triển khai Job Config
└── implementation_plan_job_history.md ← Tài liệu triển khai Job History
```

---

## 2. Vai trò của từng File

### `manifest.json` — Bản khai sinh & Bộ định tuyến

**Mục đích:** File trung tâm khai báo mọi thứ về app: service kết nối, thư viện dùng, route điều hướng, dependencies.

**Khi thêm module mới, phải sửa file này để:**
- **Khai báo Route mới**: Mỗi trang Object Page (chi tiết) cần một route riêng. Nếu không có route, click vào dòng trên table sẽ báo lỗi không tìm thấy đường dẫn.
- **Khai báo Target**: Trỏ route vào template `sap.fe.templates.ObjectPage` kèm `contextPath` của entity.
- **Khai báo Navigation**: Liên kết entity với route Object Page để FPM biết khi click dòng nào thì navigate đâu.
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

**Mục đích:** File XML định nghĩa cấu trúc giao diện Dashboard — sidebar menu, các tab nội dung, vị trí đặt table/chart/filterbar.

**Khi thêm module mới, phải sửa để:**
- **Thêm menu item mới** vào `tnt:SideNavigation` với `key` trùng với `id` của ScrollContainer.
- **Thêm `ScrollContainer` mới** vào `NavContainer` chứa nội dung của tab (FilterBar + Table hoặc FilterBar + Chart + Table).
- **Nhúng `macros:FilterBar`**: Trỏ `metaPath` vào `UI.SelectionFields` của entity. Bắt buộc nếu muốn filter.
- **Nhúng `macros:Table`**: Trỏ `metaPath` vào `UI.LineItem` của entity. Đây là control hiển thị danh sách + tự support drill-down Object Page.
- **Nhúng `viz:VizFrame`** (nếu cần chart): Khai báo dataset, dimensions, measures, feeds. **Không dùng `macros:Chart`** trong Dashboard đa-entity — xem lý do ở mục 4.
- **Thêm XML namespace mới** (nếu dùng control mới): Ví dụ `xmlns:viz`, `xmlns:viz.data`, `xmlns:viz.feeds` cho VizFrame chart.

```
Main.view.xml ảnh hưởng: Layout menu, vị trí các control UI
```

---

### `Main.controller.js` — Não xử lý Logic

**Mục đích:** File JavaScript xử lý toàn bộ tương tác người dùng: click nút, navigate trang, load dữ liệu, CRUD operations, xử lý sự kiện.

**Khi thêm module mới, phải sửa để:**
- **Cập nhật `onItemSelect`**: Thêm `if (sKey === "tenTab") { ... }` để xử lý logic riêng khi chuyển tab (ví dụ: trigger load chart data).
- **Thêm event handlers mới**: Ví dụ `onJobAbcFilterSearch`, `onCreateJobAbc`, `onDeleteJobAbc`...
- **Thêm hàm load data cho chart** (nếu dùng VizFrame): `_loadAbcChart()`, `_aggregateAbcData()`, `_configureAbcChart()`.
- **Thêm import module mới** trong `sap.ui.define`: Ví dụ `JSONModel` nếu dùng chart, `Filter/FilterOperator` nếu cần filter client-side.
- **Khởi tạo model** cho chart trong `onInit` (nếu dùng VizFrame).

```
Main.controller.js ảnh hưởng: Logic xử lý sự kiện, data loading, CRUD
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

### ❼ `Aggregation.CustomAggregate` phải khai báo ở **EntityType level**, không phải property level

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
[ ] Main.view.xml   — ScrollContainer + FilterBar + Table
[ ] Main.view.xml   — XML namespace mới (nếu cần)
[ ] Main.view.xml   — VizFrame + FlattenedDataset (nếu có chart)
[ ] Main.controller.js — Import mới (JSONModel, Filter...)
[ ] Main.controller.js — onInit: khởi tạo model (nếu có chart)
[ ] Main.controller.js — onItemSelect: thêm case cho tab mới
[ ] Main.controller.js — Event handlers mới (CRUD, search, chart load)
[ ] Main.controller.js — Hàm chart: _configure, _load, _aggregate (nếu có chart)
```

---

## 6. Tài liệu Tham khảo Chi tiết

| Module | Tài liệu đầy đủ |
|--------|----------------|
| Job Configurations (CRUD + Object Page) | `implementation_plan_job_config.md` |
| Job History (Analytics + Chart + Read-only) | `implementation_plan_job_history.md` |
