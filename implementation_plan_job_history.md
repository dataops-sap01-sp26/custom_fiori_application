# Tài liệu Triển khai: Job History Analytics Dashboard

Tài liệu này ghi nhận lại **toàn bộ quá trình thiết kế, triển khai và xử lý sự cố** của module **Job History & Logs** trên Fiori Custom Dashboard. Bao gồm: FilterBar, bảng danh sách (Table), biểu đồ thống kê (Chart), điều hướng Object Page và toàn bộ Annotations. Tài liệu giải thích rõ **tại sao** từng quyết định kỹ thuật được đưa ra, đặc biệt là những vấn đề phát sinh trong quá trình triển khai.

---

## 1. Kiến trúc Tổng quan

### Entity Backend: `JobHistoryAnalytics`

Entity này được expose từ CDS Cube `ZI_DRS_JOB_HISTORY_CUBE` qua service `ZSD_DRS_MAIN_O4`. Điểm đặc biệt so với `DrsJobConfig`:

| Đặc điểm | DrsJobConfig | JobHistoryAnalytics |
|---|---|---|
| Loại | RAP BO (CRUD) | Analytics Cube (Read-only) |
| Dùng Draft? | Có | Không |
| Mục đích | Quản lý cấu hình | Xem lịch sử & thống kê |
| Measure tổng hợp | Không | `JobCountTotal` (`@Aggregation.default: #SUM`) |

Do bản chất **read-only và analytics**, tab History cần thêm **biểu đồ trực quan** để người dùng theo dõi tổng quan lịch sử chạy job theo ngày và trạng thái — ngoài bảng danh sách chi tiết.

---

## 2. Routing & Navigation (`manifest.json`)

### 2.1 Thêm Route và Target cho Object Page

Giống như `DrsJobConfig`, entity `JobHistoryAnalytics` cũng cần một Object Page để xem chi tiết từng lần chạy job khi user click vào một dòng trên bảng.

**Route được thêm:**
```json
{
  "name": "JobHistoryObjectPage",
  "pattern": "JobHistoryAnalytics({JobHistUuid}):?query:",
  "target": "JobHistoryObjectPage"
}
```

**Target (dùng FPM Object Page template):**
```json
"JobHistoryObjectPage": {
  "type": "Component",
  "id": "JobHistoryObjectPage",
  "name": "sap.fe.templates.ObjectPage",
  "options": {
    "settings": {
      "contextPath": "/JobHistoryAnalytics",
      "editableHeaderContent": false
    }
  }
}
```

> **Tại sao `editableHeaderContent: false`?** Vì JobHistoryAnalytics là entity read-only (view log), không có tính năng Edit. Tắt chế độ này giúp header Object Page không hiển thị nút Edit/Save.

**Liên kết navigation từ Dashboard vào Object Page** (trong mục `DashboardMainPage`):
```json
"navigation": {
  "JobHistoryAnalytics": {
    "detail": {
      "route": "JobHistoryObjectPage"
    }
  }
}
```

*Kết quả:* Khi user click vào một dòng trên `macros:Table` của History, FPM tự động điều hướng sang Object Page mà không cần code controller.

### 2.2 Thêm `sap.viz` vào dependencies

```json
"libs": {
  "sap.m": {},
  "sap.ui.core": {},
  "sap.fe.core": {},
  "sap.viz": {}
}
```

> **Tại sao phải thêm?** Library `sap.viz` chứa toàn bộ các control `VizFrame`, `FlattenedDataset`, `FeedItem`. Nếu không khai báo trong `libs`, UI5 Bootstrap sẽ không preload library này — khi VizFrame được khởi tạo trong view, nó không có engine để chạy và throw lỗi **"Invalid Parameter."**. Chỉ cần thêm vào `libs` là UI5 tự lo việc load trước khi render view.

---

## 3. Giao diện Điều khiển (`Main.view.xml`)

### 3.1 Khai báo XML Namespaces cho VizFrame

Do sử dụng `sap.viz` controls, cần bổ sung 3 namespace vào thẻ root `<mvc:View>`:

```xml
<mvc:View
    xmlns:viz="sap.viz.ui5.controls"
    xmlns:viz.data="sap.viz.ui5.data"
    xmlns:viz.feeds="sap.viz.ui5.controls.common.feeds"
    ...>
```

> **Tại sao dùng đúng alias này?** Không phải vấn đề tên alias (bạn có thể đặt tên alias khác như `vds`, `feed`). Vấn đề quan trọng hơn là **kiến trúc VizFrame yêu cầu dùng `uid` thay vì `id` cho FeedItem** — chi tiết ở mục 4.

### 3.2 FilterBar cho History Tab

```xml
<macros:FilterBar
    id="jobHistoryFilterBar"
    metaPath="/JobHistoryAnalytics/@com.sap.vocabularies.UI.v1.SelectionFields"
    liveMode="false"
    search=".onJobHistoryFilterSearch"/>
```

- `metaPath` trỏ tới `UI.SelectionFields` annotation trong `annotation.xml` — FPM tự render đúng các field filter (`JobDate`, `CreatedBy`, `SubscrId`, `ReportId`, `JobId`, `JobStatus`).
- `liveMode="false"` → user phải nhấn **"Go"** để trigger tìm kiếm (không tự tìm khi gõ).
- `search=".onJobHistoryFilterSearch"` → **khi user nhấn "Go", controller được gọi để reload biểu đồ theo filter mới**. Đây là điểm khác so với `jobConfigFilterBar` (không cần reload chart).

### 3.3 Chart — Panel bọc VizFrame

```xml
<Panel id="jobHistoryChartPanel" headerText="Job Execution Statistics" class="sapUiResponsiveMargin">
    <viz:VizFrame
        id="jobTrendChart"
        vizType="stacked_column"
        height="350px"
        width="100%">
        <viz:dataset>
            <viz.data:FlattenedDataset data="{chartModel>/chartData}">
                <viz.data:dimensions>
                    <viz.data:DimensionDefinition name="Date"   value="{chartModel>JobDate}"/>
                    <viz.data:DimensionDefinition name="Status" value="{chartModel>JobStatus}"/>
                </viz.data:dimensions>
                <viz.data:measures>
                    <viz.data:MeasureDefinition name="Count" value="{chartModel>JobCountTotal}"/>
                </viz.data:measures>
            </viz.data:FlattenedDataset>
        </viz:dataset>
        <viz:feeds>
            <viz.feeds:FeedItem uid="categoryAxis" type="Dimension" values="Date"/>
            <viz.feeds:FeedItem uid="valueAxis"    type="Measure"   values="Count"/>
            <viz.feeds:FeedItem uid="color"        type="Dimension" values="Status"/>
        </viz:feeds>
    </viz:VizFrame>
</Panel>
```

**Các điểm kỹ thuật quan trọng cần hiểu:**

#### ❶ Binding dữ liệu qua `chartModel` (JSONModel)
`data="{chartModel>/chartData}"` — Chart không bind thẳng vào OData model mà dùng một **JSONModel riêng tên `"chartModel"`**. Lý do được giải thích ở mục 4.

#### ❷ `uid` không phải `id` cho FeedItem
```xml
<!-- ✅ ĐÚNG -->
<viz.feeds:FeedItem uid="categoryAxis" type="Dimension" values="Date"/>

<!-- ❌ SAI — gây lỗi "Invalid Parameter." -->
<viz.feeds:FeedItem id="categoryAxis" type="Dimension" values="Date"/>
```

`uid` là thuộc tính định danh **feed axis** trong VizFrame (categoryAxis, valueAxis, color). Nếu dùng `id` (thuộc tính generic của UI5 Element), VizFrame không nhận ra và không kết nối được dữ liệu vào đúng trục biểu đồ → lỗi `[50005] valueAxis does not meet the minimum or maximum number of feeds definition`.

#### ❸ `vizProperties` và `uiConfig` KHÔNG được set trong XML
```xml
<!-- ❌ SAI — UI5 XML parser hiểu {} là binding expression, không phải JSON object -->
<viz:VizFrame vizProperties="{title:{visible:false}}" uiConfig="{applicationSet:'fiori'}">
```
Khi bạn viết `property="{...}"` trong XML view, UI5 **luôn parse `{}` thành model binding** — nó cố tìm path `title:{visible:false}` trong model → trả về `undefined` → VizFrame nhận `undefined` thay vì config object → **"Invalid Parameter."**

✅ Giải pháp: set bằng JavaScript trong controller:
```javascript
oVizFrame.setVizProperties({ title: { visible: false }, ... });
```

### 3.4 Table cho History Tab

```xml
<macros:Table
    id="jobHistoryTable"
    metaPath="/JobHistoryAnalytics/@com.sap.vocabularies.UI.v1.LineItem"
    readOnly="true"
    enableExport="true"
    enableAutoColumnWidth="true"
    variantManagement="Control"
    p13nMode="Column,Sort,Filter"
    headerText="Global Job History"
    filterBar="jobHistoryFilterBar"
    growingThreshold="20">
</macros:Table>
```

> **Tại sao `readOnly="true"` nhưng không cần `<macros:actions>`?** Khác với `DrsJobConfig` (có CRUD), `JobHistoryAnalytics` là entity read-only hoàn toàn — không tạo mới, không xóa. `readOnly="true"` đủ, không cần custom action buttons. FPM tự tắt hết các chức năng chỉnh sửa.

---

## 4. Quyết định Kiến trúc: Tại sao dùng VizFrame thay vì `macros:Chart`?

Đây là quyết định kỹ thuật quan trọng nhất của module này. Ban đầu kế hoạch sử dụng `macros:Chart` (FPM building block), nhưng sau nhiều lần thất bại phải chuyển sang `sap.viz.ui5.controls.VizFrame` thuần.

### 4.1 Vấn đề gốc rễ của `macros:Chart`

Trong FPM Custom Page (`sap.fe.core.fpm`), mỗi page được khai báo với một `contextPath` duy nhất — trong trường hợp này là `/DrsJobConfig` (vì page được setup ban đầu cho Job Configurations):

```json
"DashboardMainPage": {
  "options": {
    "settings": {
      "contextPath": "/DrsJobConfig"
    }
  }
}
```

Khi `macros:Chart` được dùng trong page này, dù `metaPath` của nó là absolute path (`/JobHistoryAnalytics/@...`), **building block vẫn kế thừa `contextPath` của page** để build internal aggregation query. Kết quả: Chart cố gắng query `$apply` trên entity `/DrsJobConfig` thay vì `/JobHistoryAnalytics` → toàn bộ measure và dimension setup bị sai context → **lỗi `[50005] valueAxis`** không thể fix bằng annotation.

> **Tóm gọn:** `macros:Chart` là building block được thiết kế để dùng trong một page có `contextPath` **khớp với entity của chart**. Dashboard này dùng chung một page cho nhiều entity khác nhau — đây là giới hạn kiến trúc, không phải lỗi code.

### 4.2 Tại sao `sap.viz.ui5.controls.VizFrame` là lựa chọn đúng

`VizFrame` là control cấp thấp hơn, **không phụ thuộc vào FPM page context**. Nó render chart trực tiếp từ dữ liệu được bind qua `JSONModel` — hoàn toàn độc lập với OData context của page.

**So sánh hai phương án:**

| | `macros:Chart` | `VizFrame` + `JSONModel` |
|---|---|---|
| Phụ thuộc page contextPath | Có ❌ | Không ✓ |
| Hoạt động trong multi-entity page | Không ❌ | Có ✓ |
| Tự gọi OData `$apply` | Có | Không (tự xử lý trong controller) |
| Cần `ApplySupported` annotation | Có | Không |
| Độ phức tạp | Cao (annotation-driven) | Trung bình (code-driven) |

### 4.3 Các lỗi annotation đã gặp khi thử `macros:Chart`

Trong quá trình thử nghiệm `macros:Chart`, nhiều lỗi annotation phát sinh và được fix. Dù cuối cùng chuyển sang VizFrame, các annotation này vẫn được giữ lại trong `annotation.xml` vì chúng có ích cho Object Page và metadata chung:

| Lỗi | Nguyên nhân | Fix đã áp dụng |
|---|---|---|
| `ApplySupported is not added to the annotations` | Service metadata không khai báo entity hỗ trợ `$apply` query | Thêm `Aggregation.ApplySupported` trên `Container/JobHistoryAnalytics` |
| `[50005] valueAxis does not meet feeds definition` | `JobCountTotal` không được nhận diện là analytics measure | Thêm `Aggregation.CustomAggregate` ở EntityType level + `Analytics.Measure: true` |
| Measure `JobCount` sai | `JobCount` là raw field từ DB, không có `@Aggregation.default` | Đổi sang `JobCountTotal` (field có `@Aggregation.default: #SUM` trên CDS Cube) |

---

## 5. Controller (`Main.controller.js`)

### 5.0 So sánh trước / sau khi implement Job History (Diff Analysis)

Phần này trình bày **từng thay đổi cụ thể** đã được thực hiện trên file `Main.controller.js` so với phiên bản gốc (chỉ có Job Configurations), kèm lý do rõ ràng cho mỗi thay đổi.

---

#### ① THÊM — Import `sap/ui/model/json/JSONModel`

**Trước:**
```javascript
sap.ui.define([
    'sap/fe/core/PageController',
    'sap/m/MessageBox',
    'sap/m/MessageToast'
], function (PageController, MessageBox, MessageToast) {
```

**Sau:**
```javascript
sap.ui.define([
    'sap/fe/core/PageController',
    'sap/m/MessageBox',
    'sap/m/MessageToast',
    'sap/ui/model/json/JSONModel'          // ← THÊM
], function (PageController, MessageBox, MessageToast, JSONModel) {  // ← THÊM tham số
```

> **Tại sao thêm?** `VizFrame` không bind trực tiếp vào OData model. Nó cần một **JSONModel riêng** (đặt tên `"chartModel"`) để chứa dữ liệu đã được xử lý phía client. Để tạo JSONModel bằng `new JSONModel(...)`, cần import class này vào controller. Đây là dependency bắt buộc cho toàn bộ tính năng chart.

---

#### ② SỬA — Thêm khởi tạo `chartModel` vào `onInit`

**Trước:**
```javascript
onInit: function () {
    PageController.prototype.onInit.apply(this, arguments);

    var that = this;
    try {
        var oRouter = this.getAppComponent().getRouter();
        oRouter.getRoute("DashboardMainPage").attachPatternMatched(function () {
            setTimeout(function () { that._refreshJobConfigTable(); }, 500);
        });
    } catch (e) { }
},
```

**Sau:**
```javascript
onInit: function () {
    PageController.prototype.onInit.apply(this, arguments);

    // ← THÊM: Khởi tạo chartModel rỗng để VizFrame binding không bị lỗi khi view mount
    this.getView().setModel(new JSONModel({ chartData: [] }), "chartModel");

    var that = this;
    try {
        var oRouter = this.getAppComponent().getRouter();
        oRouter.getRoute("DashboardMainPage").attachPatternMatched(function () {
            setTimeout(function () { that._refreshJobConfigTable(); }, 500);
        });
    } catch (e) { }
},
```

> **Tại sao thêm ngay trong `onInit` và không phải ở nơi khác?** `onInit` là hook vòng đời đầu tiên chạy khi controller được tạo — **trước khi view được render**. XML view đã có khai báo `data="{chartModel>/chartData}"`, nên ngay khi view mount xong, `FlattenedDataset` tìm kiếm model tên `"chartModel"` ngay lập tức. Nếu model chưa tồn tại tại thời điểm đó → binding lỗi → VizFrame throw exception. Khởi tạo model với `{ chartData: [] }` (mảng rỗng) đảm bảo VizFrame render thành công với trạng thái "no data" — không hiển thị lỗi, chỉ hiện chart trống — cho đến khi data thực sự được load.

---

#### ③ SỬA — Refactor `onItemSelect`: thêm trigger load chart

**Trước:**
```javascript
onItemSelect: function (oEvent) {
    var oItem = oEvent.getParameter("item");
    var sKey = oItem.getKey();

    if (!sKey) { return; }

    var oNavContainer = this.byId("pageContainer");
    oNavContainer.to(this.byId(sKey));
},
```

**Sau:**
```javascript
onItemSelect: function (oEvent) {
    var oItem = oEvent.getParameter("item");
    var sKey  = oItem.getKey();

    if (!sKey) { return; }

    this.byId("pageContainer").to(this.byId(sKey));

    // ← THÊM: Khi chuyển sang tab History, tự load chart data
    if (sKey === "history") {
        this._loadHistoryChart();
    }
},
```

> **Tại sao cần thêm `if (sKey === "history")`?** VizFrame không có cơ chế autoload — nó chỉ render lại khi JSONModel thay đổi. Khi user lần đầu click vào menu "Job History & Logs", view đã có sẵn (được khởi tạo từ trước) nhưng `chartModel.chartData` vẫn là mảng rỗng từ `onInit`. Nếu không trigger `_loadHistoryChart()` tại đây, chart sẽ **trống mãi mãi** cho đến khi user nhấn "Go" trên FilterBar. Việc load ngay khi chuyển tab mang lại trải nghiệm tốt hơn: chart hiện data ngay khi tab mở ra.

> **Tại sao bỏ biến `oNavContainer`?** Refactor nhỏ để code gọn hơn. `this.byId("pageContainer").to(...)` thay vì tạo biến trung gian không cần thiết. Chức năng hoàn toàn giống nhau.

---

#### ④ THÊM — Hàm `_configureChart()` (hoàn toàn mới)

```javascript
// ← THÊM HOÀN TOÀN MỚI
_configureChart: function () {
    var oVizFrame = this.byId("jobTrendChart");
    if (!oVizFrame) { return; }
    oVizFrame.setVizProperties({
        plotArea:     { dataLabel: { visible: false } },
        valueAxis:    { title: { visible: true, text: "Execution Count" } },
        categoryAxis: { title: { visible: true, text: "Job Date" } },
        title:        { visible: false },
        legend:       { visible: true, title: { visible: true, text: "Job Status" } }
    });
},
```

> **Tại sao phải có hàm này (thay vì set trực tiếp trong XML)?** Như đã phân tích ở mục 3.3 ❸, không thể truyền object JSON vào attribute XML vì UI5 sẽ parse `{...}` thành model binding. Hàm này tách bạch **một nhiệm vụ duy nhất**: cấu hình giao diện của chart (labels, legend, title). Không liên quan đến load data. Gọi một lần khi đầu tiên load chart.

> **Tại sao check `if (!oVizFrame) { return; }`?** Phòng trường hợp hàm được gọi khi view chưa mount xong (edge case race condition). Guard này đảm bảo không throw lỗi nếu `byId` trả về `null`.

---

#### ⑤ THÊM — Hàm `_loadHistoryChart()` (hoàn toàn mới)

```javascript
// ← THÊM HOÀN TOÀN MỚI
_loadHistoryChart: function () {
    var that = this;
    this._configureChart();

    var oModel = this.getView().getModel();
    var oBinding = oModel.bindList("/JobHistoryAnalytics", undefined, undefined, undefined, {
        $orderby: "JobDate desc"
    });

    oBinding.requestContexts(0, 999).then(function (aContexts) {
        var aRawData = aContexts.map(function (oCtx) { return oCtx.getObject(); });
        that._aHistoryData = aRawData;       // Cache để tái sử dụng
        that._aggregateChartData(aRawData);
    }).catch(function (oError) {
        console.error("JobHistory chart data load error:", oError);
    });
},
```

> **Tại sao tách hàm load riêng thay vì viết inline trong `onItemSelect`?** Vì hàm này được gọi từ **hai nơi khác nhau**: `onItemSelect` (khi chuyển tab) và `onJobHistoryFilterSearch` (khi nhấn "Go"). Nếu viết inline sẽ phải duplicate code. Tách thành hàm riêng tuân thủ nguyên tắc DRY (Don't Repeat Yourself).

---

#### ⑥ THÊM — Hàm `_aggregateChartData()` (hoàn toàn mới)

```javascript
// ← THÊM HOÀN TOÀN MỚI
_aggregateChartData: function (aData) {
    var mAggregated = {};

    aData.forEach(function (oItem) {
        var sDate   = oItem.JobDate   || "";
        var sStatus = oItem.JobStatus || "Unknown";
        var sKey    = sDate + "|" + sStatus;

        if (!mAggregated[sKey]) {
            mAggregated[sKey] = { JobDate: sDate, JobStatus: sStatus, JobCountTotal: 0 };
        }
        mAggregated[sKey].JobCountTotal += (oItem.JobCountTotal || 1);
    });

    var aChartData = Object.values(mAggregated).sort(function (a, b) {
        return a.JobDate.localeCompare(b.JobDate);
    });

    this.getView().getModel("chartModel").setProperty("/chartData", aChartData);
},
```

> **Tại sao tách hàm aggregate riêng?** Hàm này nhận vào `aData` (mảng raw) và trả về data đã aggregate vào chartModel — thuần túy là business logic xử lý dữ liệu, không liên quan đến UI hay OData call. Tách riêng giúp dễ test và dễ tái sử dụng: tương lai khi implement filter chart theo ngày, chỉ cần lọc `_aHistoryData` rồi gọi lại `_aggregateChartData(filteredData)` mà không cần gọi thêm API.

---

#### ⑦ THÊM — Event handler `onJobHistoryFilterSearch()` (hoàn toàn mới)

```javascript
// ← THÊM HOÀN TOÀN MỚI
onJobHistoryFilterSearch: function () {
    this._loadHistoryChart();
},
```

> **Tại sao cần event handler này?** `macros:Table` tự kết nối với `macros:FilterBar` thông qua `filterBar="jobHistoryFilterBar"` — khi user nhấn "Go", bảng **tự filter** mà không cần code. Nhưng VizFrame **không có kết nối tự động** với FilterBar. Hàm này đóng vai trò **bridge**: khi FilterBar phát sự kiện `search` (người dùng nhấn "Go"), handler này được gọi và trigger reload chart để chart cũng cập nhật theo. Đây là lý do `search=".onJobHistoryFilterSearch"` được khai báo trên `macros:FilterBar` trong view.

> **Lưu ý về giới hạn hiện tại:** `_loadHistoryChart()` hiện tải toàn bộ data mà không truyền filter conditions của FilterBar sang OData query. Điều này có nghĩa chart chưa thực sự phản ánh đúng filter — đây là tính năng sẽ phát triển thêm sau.

---

#### Tổng hợp tất cả thay đổi

| # | Loại | Vị trí | Nội dung | Mục đích |
|---|---|---|---|---|
| 1 | **THÊM** | `sap.ui.define` imports | `sap/ui/model/json/JSONModel` | Cần để tạo model cho VizFrame |
| 2 | **SỬA** | `onInit` | Khởi tạo `chartModel` rỗng | VizFrame cần model tồn tại trước khi view mount |
| 3 | **SỬA** | `onItemSelect` | Thêm `if (sKey === "history") _loadHistoryChart()` | Auto-load chart khi mở tab History |
| 4 | **THÊM** | — | Hàm `_configureChart()` | Set VizProperties đúng cách (không dùng XML) |
| 5 | **THÊM** | — | Hàm `_loadHistoryChart()` | Fetch OData + trigger aggregation |
| 6 | **THÊM** | — | Hàm `_aggregateChartData()` | Group data theo ngày + status cho chart |
| 7 | **THÊM** | — | Event `onJobHistoryFilterSearch()` | Sync chart khi FilterBar trigger search |

Các hàm của Job Configurations (`_refreshJobConfigTable`, `onCreateJobConfig`, `onDeleteJobConfig`, `onMenuButtonPress`) **không bị sửa đổi** — Job History được implement hoàn toàn độc lập, không ảnh hưởng code cũ.

---

### 5.1 Khởi tạo `chartModel` trong `onInit`

```javascript
onInit: function () {
    PageController.prototype.onInit.apply(this, arguments);
    // Khởi tạo chartModel rỗng để VizFrame binding không bị lỗi khi view mount
    this.getView().setModel(new JSONModel({ chartData: [] }), "chartModel");
    ...
}
```

> **Tại sao phải khởi tạo sớm với mảng rỗng?** Khi view được mount, `FlattenedDataset` ngay lập tức tìm kiếm binding `{chartModel>/chartData}`. Nếu model chưa tồn tại → binding lỗi → VizFrame throw exception. Khởi tạo model với `chartData: []` (mảng rỗng) đảm bảo VizFrame render thành công với trạng thái "no data" trước khi data thực sự được load.

### 5.2 Hàm `_configureChart()` — Set VizProperties đúng cách

```javascript
_configureChart: function () {
    var oVizFrame = this.byId("jobTrendChart");
    if (!oVizFrame) { return; }
    oVizFrame.setVizProperties({
        plotArea:     { dataLabel: { visible: false } },
        valueAxis:    { title: { visible: true, text: "Execution Count" } },
        categoryAxis: { title: { visible: true, text: "Job Date" } },
        title:        { visible: false },
        legend:       { visible: true, title: { visible: true, text: "Job Status" } }
    });
},
```

> **Tại sao tách thành hàm riêng thay vì set trong `_loadHistoryChart`?** Để tách biệt rõ ràng hai việc: **cấu hình giao diện** (set một lần) và **tải dữ liệu** (có thể gọi lại nhiều lần). `_loadHistoryChart` gọi `_configureChart()` ở đầu; ngay cả khi data chưa có, chart đã có đúng labels và legend.

### 5.3 Hàm `_loadHistoryChart()` — Tải và Cache dữ liệu

```javascript
_loadHistoryChart: function () {
    var that = this;
    this._configureChart();

    var oModel = this.getView().getModel();
    var oBinding = oModel.bindList("/JobHistoryAnalytics", undefined, undefined, undefined, {
        $orderby: "JobDate desc"
    });

    oBinding.requestContexts(0, 999).then(function (aContexts) {
        var aRawData = aContexts.map(function (oCtx) { return oCtx.getObject(); });
        that._aHistoryData = aRawData;  // Cache để tái sử dụng
        that._aggregateChartData(aRawData);
    }).catch(function (oError) {
        console.error("JobHistory chart data load error:", oError);
    });
},
```

> **Tại sao dùng `oModel.bindList()` + `requestContexts()` thay vì `$.ajax` hay `fetch()`?** Đây là cách chuẩn của UI5 OData V4 để đọc dữ liệu. Binding được quản lý bởi OData model (có cache, retry, error handling). `requestContexts(0, 999)` đọc tối đa 999 records — đủ cho aggregation client-side mà không overload.

> **Tại sao lưu vào `_aHistoryData`?** Cache dữ liệu gốc để tương lai có thể implement filter client-side (lọc biểu đồ theo tiêu chí) mà không cần gọi thêm API. Filter chỉ cần tính toán lại từ `_aHistoryData` → gọi `_aggregateChartData()` → cập nhật chart.

### 5.4 Hàm `_aggregateChartData()` — Gộp dữ liệu phía client

```javascript
_aggregateChartData: function (aData) {
    var mAggregated = {};

    aData.forEach(function (oItem) {
        var sDate   = oItem.JobDate   || "";
        var sStatus = oItem.JobStatus || "Unknown";
        var sKey    = sDate + "|" + sStatus;

        if (!mAggregated[sKey]) {
            mAggregated[sKey] = { JobDate: sDate, JobStatus: sStatus, JobCountTotal: 0 };
        }
        mAggregated[sKey].JobCountTotal += (oItem.JobCountTotal || 1);
    });

    var aChartData = Object.values(mAggregated).sort(function (a, b) {
        return a.JobDate.localeCompare(b.JobDate);
    });

    this.getView().getModel("chartModel").setProperty("/chartData", aChartData);
},
```

**Logic aggregation:**
- Duyệt từng record của `_aHistoryData`
- Tạo key composite `"2026-04-07|Finished"` từ `JobDate + JobStatus`
- Gộp: đếm số lần xuất hiện mỗi (ngày + trạng thái) vào `JobCountTotal`
- Sort theo ngày tăng dần → chart hiển thị từ trái sang phải theo thứ tự thời gian
- Set vào `chartModel>/chartData` → VizFrame tự cập nhật

> **Tại sao gộp phía client thay vì dùng OData `$apply`?** Vì `macros:Chart` không hoạt động (đã giải thích ở mục 4). Với VizFrame + JSONModel, ta tự làm aggregation. Với lượng data vừa phải (< 1000 records), client-side aggregation **đủ nhanh** và **không cần backend hỗ trợ `$apply`**.

> **Tại sao dùng `oItem.JobCountTotal || 1`?** `JobCountTotal` trong CDS được định nghĩa là `cast(1 as abap.int4)` — mỗi row = 1 lần chạy. Giá trị luôn là 1, nhưng dùng `|| 1` để bảo vệ trường hợp null/undefined. Khi gộp nhiều row cùng (ngày + status), ta cộng dồn → kết quả là số lần chạy job.

### 5.5 Sự kiện `onJobHistoryFilterSearch` và `onItemSelect`

```javascript
// Khi user nhấn "Go" trên FilterBar
onJobHistoryFilterSearch: function () {
    this._loadHistoryChart();
},

// Khi user click menu Job History & Logs
onItemSelect: function (oEvent) {
    var sKey = oEvent.getParameter("item").getKey();
    if (!sKey) { return; }
    this.byId("pageContainer").to(this.byId(sKey));

    if (sKey === "history") {
        this._loadHistoryChart();
    }
},
```

> **Tại sao chart cần reload khi nhấn "Go"?** Vì `macros:Table` kết nối trực tiếp với `macros:FilterBar` qua thuộc tính `filterBar="jobHistoryFilterBar"` nên tự filter theo filter bar. Nhưng VizFrame **không kết nối với FilterBar** — nó dùng JSONModel riêng. Do đó, mỗi khi user nhấn "Go", controller phải **tự gọi lại** `_loadHistoryChart()` để reload và re-aggregate data tương ứng với filter đang áp dụng.

> **Lưu ý hiện tại:** `_loadHistoryChart()` hiện tải toàn bộ data không theo filter của FilterBar. Việc đồng bộ filter FilterBar → chart là tính năng sẽ phát triển thêm sau.

> **Tại sao load chart khi chuyển tab?** Chart không autoload khi view mount (data là rỗng). Khi user lần đầu click vào menu "Job History & Logs", `onItemSelect` bắt sự kiện `sKey === "history"` và trigger load — đảm bảo chart có data ngay khi tab mở ra.

---

## 6. Khai báo Annotations (`annotation.xml`)

### 6.1 Cấu trúc Table và FilterBar

**`UI.LineItem`** — Các cột hiển thị trên `macros:Table`:

| Cột | Field | Ghi chú |
|---|---|---|
| Job Date | `JobDate` | Ngày chạy job |
| Report ID | `ReportId` | Mã báo cáo |
| Job Description | `JobText` | Mô tả job |
| Job Name | `JobName` | Tên kỹ thuật của job SAP |
| Start Time | `StartTimestamp` | Thời điểm bắt đầu |
| End Time | `EndTimestamp` | Thời điểm kết thúc |
| Duration (ms) | `DurationMs` | Thời gian thực thi |
| Status | `JobStatus` | Kèm `Criticality` → badge màu tự động |
| File Name | `FileName` | `DataFieldWithUrl` → hyperlink tải file |
| Message | `Message` | Thông báo lỗi/thành công |
| Execution Count | `JobCountTotal` | Measure cho chart |

> **Tại sao `JobCountTotal` phải có trong `UI.LineItem`?** Khi `macros:Chart` còn được thử nghiệm, FPM yêu cầu field phải có trong LineItem để đưa vào `$select` query. Dù đã chuyển sang VizFrame, field này vẫn giữ trong LineItem vì nó cũng hữu ích để xem trên bảng.

> **Tại sao dùng `DataFieldWithUrl` cho FileName?** Fiori FPM khi gặp `DataFieldWithUrl` sẽ tự render một **hyperlink** (`<a href="...">`) thay vì plain text. Click vào sẽ mở URL trong tab mới, cho phép tải file báo cáo trực tiếp.

**`UI.SelectionFields`** — Các trường filter trên `macros:FilterBar`:

```xml
<PropertyPath>JobDate</PropertyPath>
<PropertyPath>CreatedBy</PropertyPath>
<PropertyPath>SubscrId</PropertyPath>
<PropertyPath>ReportId</PropertyPath>
<PropertyPath>JobId</PropertyPath>
<PropertyPath>JobStatus</PropertyPath>
```

### 6.2 Chart Annotations (`UI.Chart`)

```xml
<Annotation Term="UI.Chart">
    <Record Type="UI.ChartDefinitionType">
        <PropertyValue Property="ChartType" EnumMember="UI.ChartType/ColumnStacked"/>
        <PropertyValue Property="Title" String="Job Executions by Date &amp; Status"/>
        <PropertyValue Property="Dimensions">
            <Collection>
                <PropertyPath>JobDate</PropertyPath>   <!-- Trục X -->
                <PropertyPath>JobStatus</PropertyPath> <!-- Nhóm màu (stacking) -->
            </Collection>
        </PropertyValue>
        <PropertyValue Property="Measures">
            <Collection>
                <PropertyPath>JobCountTotal</PropertyPath>
            </Collection>
        </PropertyValue>
        ...
    </Record>
</Annotation>
```

> **Tại sao `ChartType/ColumnStacked` thay vì `Column` đơn giản?** Stacked column cho phép thấy **cả hai chiều** trong một bar: tổng số job theo ngày (chiều cao) VÀ phân bổ theo trạng thái (màu sắc của từng phần). Ví dụ: ngày 07/04 có 5 lần chạy — 4 Finished (xanh), 1 Failed (đỏ).

> **Tại sao `JobCountTotal` thay vì `JobCount`?** `JobCount` là field thô từ bảng DB (`BTCJOBCNT`), không có `@Aggregation.default` annotation → không aggregate được. `JobCountTotal` được định nghĩa trong CDS Fact view là `cast(1 as abap.int4)` (mỗi row = 1) với `@Aggregation.default: #SUM` trên CDS Cube → đây là measure đúng chuẩn analytics.

### 6.3 Aggregation Annotations — Fix lỗi Measure Recognition

Đây là nhóm annotations được thêm để giải quyết vấn đề khi thử nghiệm `macros:Chart`. Dù không còn dùng `macros:Chart`, các annotations này được giữ lại vì chúng khai báo đúng semantic của entity cho các OData client khác.

**1. Thêm vocabulary references:**
```xml
<edmx:Reference Uri="https://oasis-tcs.github.io/odata-vocabularies/vocabularies/Org.OData.Aggregation.V1.xml">
    <edmx:Include Namespace="Org.OData.Aggregation.V1" Alias="Aggregation"/>
</edmx:Reference>
<edmx:Reference Uri="https://sap.github.io/odata-vocabularies/vocabularies/Analytics.xml">
    <edmx:Include Namespace="com.sap.vocabularies.Analytics.v1" Alias="Analytics"/>
</edmx:Reference>
```

**2. `Aggregation.CustomAggregate` tại EntityType level:**
```xml
<Annotations Target="...JobHistoryAnalyticsType">
    <Annotation Term="Aggregation.CustomAggregate" Qualifier="JobCountTotal" String="Edm.Int32"/>
    ...
```

> **Tại sao phải khai báo ở EntityType level?** Metadata gốc từ backend đặt annotation này tại **property level** (`JobHistoryAnalyticsType/JobCountTotal`) nhưng theo chuẩn OData Aggregation V1, `CustomAggregate` phải được khai báo tại **EntityType hoặc EntitySet level** — qualifier chính là tên field, value là kiểu dữ liệu. FPM framework tìm kiếm annotation ở đây để nhận diện measure.

**3. `Analytics.Measure` tại property level:**
```xml
<Annotations Target="...JobHistoryAnalyticsType/JobCountTotal">
    <Annotation Term="Analytics.Measure" Bool="true"/>
</Annotations>
```

> **Tại sao cần cả hai annotation?** Hai annotation phục vụ hai mục đích khác nhau: `CustomAggregate` khai báo với OData engine rằng field này là một aggregate measure server-side. `Analytics.Measure` là annotation của SAP dành riêng cho FPM/Fiori Elements để nhận diện field là measure trong chart/table.

**4. `Aggregation.ApplySupported` tại EntitySet level:**
```xml
<Annotations Target="...Container/JobHistoryAnalytics">
    <Annotation Term="Aggregation.ApplySupported">
        <Record Type="Aggregation.ApplySupportedType">
            <PropertyValue Property="Transformations">
                <Collection>
                    <String>aggregate</String>
                    <String>groupby</String>
                    <String>filter</String>
                    ...
                </Collection>
            </PropertyValue>
            <PropertyValue Property="GroupableProperties">...</PropertyValue>
            <PropertyValue Property="AggregatableProperties">
                <Collection>
                    <Record Type="Aggregation.AggregatablePropertyType">
                        <PropertyValue Property="Property" PropertyPath="JobCountTotal"/>
                    </Record>
                </Collection>
            </PropertyValue>
        </Record>
    </Annotation>
</Annotations>
```

> **Tại sao cần annotation này?** `macros:Chart` kiểm tra `ApplySupported` annotation trên EntitySet trước khi render chart — nếu thiếu sẽ throw lỗi `"ApplySupported is not added to the annotations"`. Annotation này khai báo với OData client rằng service hỗ trợ `$apply` query (aggregation), đồng thời liệt kê rõ các transformations và properties có thể group/aggregate.

### 6.4 Trang Chi tiết Object Page — Facets & FieldGroups

Để Fiori render Object Page đẹp khi user click vào một dòng trong bảng, bổ sung:

- **`UI.HeaderInfo`**: Title = `JobText` (mô tả job), Description = `Message` (kết quả thực thi).
- **`UI.Facets`** gồm 4 Panel:
  1. **General Information**: `ReportId`, `SubscrId`, `JobId`, `RunType`, `JobName`, `JobText`, `JobCount`.
  2. **Execution Details**: `OutputFormat`, `DurationMs`, `StartTimestamp`, `EndTimestamp`, `JobStatus` (có badge màu), `Message`, `RetryCount`.
  3. **Report File**: `FileName` (hyperlink tải file), `FileSizeDisplay`, `FileCreatedBy`, `FileCreatedAt`.
  4. **Administrative Data**: `CreatedBy`, `CreatedAt`, `LastChangedBy`, `LastChangedAt`.

---

## 7. Các Vấn đề Gặp phải & Bài học Rút ra

### Tóm tắt hành trình giải quyết lỗi Chart

| Giai đoạn | Lỗi | Nguyên nhân | Giải pháp |
|---|---|---|---|
| 1 | `ApplySupported is not added` | Thiếu annotation trên EntitySet | Thêm `Aggregation.ApplySupported` |
| 2 | `[50005] valueAxis feeds` | Measure `JobCount` không phải aggregate measure | Đổi sang `JobCountTotal`, thêm `Aggregation.CustomAggregate` |
| 3 | `[50005] vẫn còn` (macros:Chart) | **contextPath của page là `/DrsJobConfig`** không phải `/JobHistoryAnalytics` | Bỏ `macros:Chart`, chuyển sang `VizFrame` |
| 4 | `Invalid Parameter.` (VizFrame) | `vizProperties` và `uiConfig` dùng `{}` trong XML bị parse thành binding | Xóa khỏi XML, set bằng `setVizProperties()` trong controller |
| 5 | `Invalid Parameter.` (vẫn còn) | `sap.viz` library chưa được khai báo trong `manifest.json` | Thêm `"sap.viz": {}` vào `libs` |
| 6 | Chart hiển thị nhưng không có bar | `FeedItem id="valueAxis"` sai, phải là `uid="valueAxis"` | Đổi tất cả `id` → `uid` trên FeedItem |

> **Bài học quan trọng nhất:** `macros:Chart` là building block FPM được thiết kế cho **Single-Entity Page**. Khi dùng trong Custom Dashboard Page có nhiều entity, nó không hoạt động do bị ràng buộc bởi `contextPath` của page. Trong tình huống đó, `sap.viz.ui5.controls.VizFrame` với JSONModel là lựa chọn phù hợp và linh hoạt hơn.

---

## 8. Tổng Kết

Module **Job History & Logs** được triển khai thành công với kiến trúc lai giữa FPM Building Blocks và VizFrame thuần:

| Thành phần | Công nghệ | Lý do |
|---|---|---|
| **FilterBar** | `macros:FilterBar` | FPM building block, tự render từ `UI.SelectionFields` annotation |
| **Bảng danh sách** | `macros:Table` | FPM building block, hỗ trợ drill-down Object Page tự động |
| **Biểu đồ** | `sap.viz.ui5.controls.VizFrame` + `JSONModel` | macros:Chart không thể dùng trong multi-entity Custom Page |
| **Object Page** | `sap.fe.templates.ObjectPage` | Template chuẩn Fiori, không cần code thêm |
| **Data cho chart** | OData V4 `bindList()` + client-side aggregation | Không phụ thuộc `$apply` server-side |

**Luồng hoạt động hoàn chỉnh:**
```
User mở tab "Job History"
    → onItemSelect() → _loadHistoryChart()
    → OData GET /JobHistoryAnalytics (999 records)
    → _aggregateChartData() → group by (JobDate + JobStatus) → count
    → JSONModel "chartModel" → VizFrame render stacked_column chart

User nhấn "Go" trên FilterBar
    → macros:Table tự filter theo conditions (FPM internal)
    → onJobHistoryFilterSearch() → _loadHistoryChart() → chart reload

User click dòng trên Table
    → FPM navigation → JobHistoryObjectPage (4 panels chi tiết)
```
