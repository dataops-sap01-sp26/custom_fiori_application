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

- `metaPath` trỏ tới `UI.SelectionFields` annotation trong `annotation.xml` — FPM tự render đúng các field filter (`ExecutionDate`, `CreatedBy`, `SubscrId`, `ReportId`, `JobId`, `JobStatus`).
- `liveMode="false"` → user phải nhấn **"Go"** để trigger tìm kiếm (không tự tìm khi gõ).
- `search=".onJobHistoryFilterSearch"` → **khi user nhấn "Go", controller được gọi để reload biểu đồ theo filter mới**. Đây là điểm khác so với `jobConfigFilterBar` (không cần reload chart).

### 3.3 Chart — Panel bọc VizFrame

```xml
<Panel id="jobHistoryChartPanel" headerText="Job Execution Statistics" class="drsSection">
    <viz:VizFrame
        id="jobTrendChart"
        vizType="stacked_column"
        height="350px"
        width="100%">
        <viz:dataset>
            <viz.data:FlattenedDataset data="{chartModel>/chartData}">
                <viz.data:dimensions>
                    <viz.data:DimensionDefinition name="Date"   value="{chartModel>ExecutionDate}"/>
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

## 5. Controller — Kiến trúc Phân tách Domain Controller

> **Lưu ý quan trọng:** Sau khi refactor (xem `implementation_plan_code_refactoring.md`), toàn bộ logic Job History đã được **chuyển ra khỏi `Main.controller.js`** vào file riêng `ext/controller/JobHistoryController.js`. `Main.controller.js` chỉ còn vai trò orchestration — delegate đến controller tương ứng.

### 5.1 Kiến trúc phân tách

```
Main.controller.js (orchestration)
    ├── onInit()
    │   ├── new JobHistoryController() → this._jobHistoryController
    │   └── this._jobHistoryController.init(this)  ← khởi tạo chartModel
    │
    ├── onItemSelect()
    │   └── if (sKey === "history") → this._jobHistoryController.loadChartData(this)
    │
    └── onJobHistoryFilterSearch()
        └── this._jobHistoryController.onFilterSearch(this)

JobHistoryController.js (domain logic)
    ├── init(oController)          ← khởi tạo chartModel rỗng
    ├── loadChartData(oController) ← load OData + configure + aggregate
    ├── configureChart(oController)← set VizProperties
    ├── _aggregateChartData(oController, aData) ← group by date+status
    └── onFilterSearch(oController)← reload chart khi nhấn "Go"
```

### 5.2 `JobHistoryController.js` — Code thực tế

```javascript
sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("cfa.customfioriapplication.ext.controller.JobHistoryController", {
        
        _aHistoryData: [],
        
        /**
         * Khởi tạo chartModel rỗng — gọi trong onInit của Main controller
         * Bắt buộc phải gọi trước khi view mount để FlattenedDataset không bị lỗi binding
         */
        init: function (oController) {
            oController.getView().setModel(new JSONModel({ chartData: [] }), "chartModel");
        },
        
        /**
         * Configure VizFrame chart properties — KHÔNG set trong XML (UI5 sẽ parse {} thành binding)
         */
        configureChart: function (oController) {
            var oVizFrame = oController.byId("jobTrendChart");
            if (!oVizFrame) { return; }
            
            oVizFrame.setVizProperties({
                plotArea: { dataLabel: { visible: false } },
                valueAxis: { title: { visible: true, text: "Execution Count" } },
                categoryAxis: { title: { visible: true, text: "Execution Date" } },
                title: { visible: false },
                legend: { visible: true, title: { visible: true, text: "Job Status" } }
            });
        },
        
        /**
         * Load chart data từ JobHistoryAnalytics entity
         * Gọi khi: (1) user mở tab History, (2) user nhấn "Go" trên FilterBar
         */
        loadChartData: function (oController) {
            var that = this;
            
            this.configureChart(oController);
            
            var oModel = oController.getView().getModel();
            var oBinding = oModel.bindList("/JobHistoryAnalytics", undefined, undefined, undefined, {
                $orderby: "ExecutionDate desc"
            });
            
            oBinding.requestContexts(0, 999).then(function (aContexts) {
                var aRawData = aContexts.map(function (oCtx) { return oCtx.getObject(); });
                that._aHistoryData = aRawData;  // Cache để tái sử dụng (filter client-side sau này)
                that._aggregateChartData(oController, aRawData);
            }).catch(function (oError) {
                console.error("JobHistory chart data load error:", oError);
            });
        },
        
        /**
         * Aggregate data: group by (ExecutionDate + JobStatus), sum JobCountTotal
         * Kết quả set vào chartModel → VizFrame tự cập nhật
         */
        _aggregateChartData: function (oController, aData) {
            var mAggregated = {};
            
            aData.forEach(function (oItem) {
                var sDate   = oItem.ExecutionDate   || "";
                var sStatus = oItem.JobStatus || "Unknown";
                var sKey    = sDate + "|" + sStatus;
                
                if (!mAggregated[sKey]) {
                    mAggregated[sKey] = { ExecutionDate: sDate, JobStatus: sStatus, JobCountTotal: 0 };
                }
                mAggregated[sKey].JobCountTotal += (oItem.JobCountTotal || 1);
            });
            
            var aChartData = Object.values(mAggregated).sort(function (a, b) {
                return a.ExecutionDate.localeCompare(b.ExecutionDate);
            });
            
            oController.getView().getModel("chartModel").setProperty("/chartData", aChartData);
        },
        
        /**
         * Handler cho FilterBar search — bridge giữa FilterBar và VizFrame
         * macros:Table tự filter, VizFrame cần reload thủ công
         */
        onFilterSearch: function (oController) {
            this.loadChartData(oController);
        }
    });
});
```

### 5.3 `Main.controller.js` — Phần liên quan đến Job History

```javascript
// Import
"../controller/JobHistoryController"

// onInit
this._jobHistoryController = new JobHistoryController();
this._jobHistoryController.init(this);  // ← khởi tạo chartModel

// onItemSelect — khi user click tab History
if (sKey === "history") {
    this._jobHistoryController.loadChartData(this);
}

// Event handler bridge — được khai báo trong macros:FilterBar search=".onJobHistoryFilterSearch"
onJobHistoryFilterSearch: function () {
    this._jobHistoryController.onFilterSearch(this);
}
```

### 5.4 Những điểm kỹ thuật quan trọng (giữ nguyên từ plan gốc)

> **chartModel phải khởi tạo trong `init()` trước khi view mount.** Khi view được render, `FlattenedDataset data="{chartModel>/chartData}"` tìm model ngay lập tức. Nếu model chưa tồn tại → binding lỗi → VizFrame throw exception.

> **`configureChart()` cần gọi từ JavaScript, KHÔNG set trong XML.** UI5 parser hiểu `{...}` trong XML attribute là model binding — truyền JSON object trực tiếp sẽ bị parse sai.

> **`_aggregateChartData` cần tham số `oController`.** Khác với Main.controller.js (có `this.getView()` trực tiếp), domain controller cần nhận `oController` reference để truy cập view.

> **Lưu ý giới hạn:** `loadChartData()` hiện tải toàn bộ data mà không theo filter của FilterBar. Chart chưa phản ánh đúng filter conditions — đây là tính năng sẽ phát triển thêm sau.

---

## 6. Khai báo Annotations (`annotation.xml`)

### 6.1 Cấu trúc Table và FilterBar

**`UI.LineItem`** — Các cột hiển thị trên `macros:Table`:

| Cột | Field | Ghi chú |
|---|---|---|
| Execution Date | `ExecutionDate` | Ngày chạy job |
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
<PropertyPath>ExecutionDate</PropertyPath>
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
                <PropertyPath>ExecutionDate</PropertyPath>   <!-- Trục X -->
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
    → Main.onItemSelect() → _jobHistoryController.loadChartData(this)
    → JobHistoryController.configureChart() → set VizProperties
    → OData GET /JobHistoryAnalytics (999 records)
    → JobHistoryController._aggregateChartData() → group by (ExecutionDate + JobStatus) → count
    → JSONModel "chartModel" → VizFrame render stacked_column chart

User nhấn "Go" trên FilterBar
    → macros:Table tự filter theo conditions (FPM internal)
    → Main.onJobHistoryFilterSearch() → _jobHistoryController.onFilterSearch(this) → loadChartData() → chart reload

User click dòng trên Table
    → FPM navigation → JobHistoryObjectPage (4 panels chi tiết)
```

