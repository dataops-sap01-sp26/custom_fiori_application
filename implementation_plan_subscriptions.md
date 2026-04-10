# Tài liệu Triển khai: Subscriptions Dashboard

Tài liệu này ghi nhận lại toàn bộ quá trình thiết kế và triển khai module **Subscriptions** trên Fiori Custom Dashboard — cho phép người dùng quản lý danh sách đăng ký báo cáo (Subscriptions), bao gồm tạo mới, chỉnh sửa, xoá, tạm dừng/tiếp tục, sao chép, và cấu hình tham số báo cáo (Report Parameters) theo từng loại report.

---

## 1. Kiến trúc Tổng quan

### Entity Backend: `DrsSubscr` (Subscription)

Entity này được expose từ CDS Projection `ZC_DRS_SUBSCR` (dựa trên Interface View `ZR_DRS_SUBSCR` và bảng vật lý `zdrs_subscr`) qua service `ZSD_DRS_MAIN_O4`.

**So sánh với các entity đã triển khai:**

| Đặc điểm | DrsJobConfig | JobHistoryAnalytics | DrsFile | **DrsSubscr** |
|---|---|---|---|---|
| Loại | RAP BO (CRUD) | Analytics Cube | RAP BO (Read-only) | **RAP BO (CRUD + Draft)** |
| Dùng Draft? | Có | Không | Không | **Có** |
| Composition child? | Không | Không | Không | **Có (`_ParamGL01`)** |
| Custom Actions? | schedule/cancel/refresh | Không | Không | **pause/resume/copy/createReportParams** |
| Mục đích | Cấu hình job | Xem lịch sử | Xem & tải file | **Quản lý đăng ký báo cáo** |

### Điểm đặc biệt của Subscription so với các entity khác

1. **Composition Child Entity (`_ParamGL01`)**: Mỗi Subscription có thể có **một bộ tham số báo cáo con** dạng [0..1]. Bộ tham số này được tạo qua action `createReportParams` và hiển thị dưới dạng form section trên Object Page.
2. **Dynamic Section Hiding**: Section "GL Report Parameters" chỉ hiển thị khi `ReportId = 'GL-01'`. Backend dùng virtual element `HideParamGL01` (tính bởi class `ZCL_DRS_SUBSCR_HIDE`) để điều khiển ẩn/hiện.
3. **Custom Actions trên Object Page**: 4 action buttons (Create Report Parameters, Pause, Resume, Copy) được khai báo trong DDLX `UI.identification` — Fiori Elements Object Page tự render chúng.
4. **Value Helps**: 3 field có value help annotation: `ReportId` → `ZIR_DRS_CATALOG`, `Bukrs` → `I_CompanyCodeStdVH`, `OutputFormat` → `ZI_VH_DRS_FORMAT`.

### Toàn bộ fields của entity `DrsSubscr`

| Field | Kiểu dữ liệu | Mô tả | Hiển thị UI |
|---|---|---|---|
| `SubscrUuid` | UUID (16 bytes) | **Key** — ID duy nhất (generated) | Ẩn |
| `SubscrId` | NUMC 6 | **Key** — Subscription ID (sequential) | ✓ Hiển thị |
| `SubscrName` | CHAR | Tên/mô tả subscription | ✓ Hiển thị |
| `ReportId` | CHAR | Report ID (GL-01, AR-01, ...) | ✓ Hiển thị + Value Help |
| `Bukrs` | CHAR 4 | Company Code | ✓ Hiển thị + Value Help |
| `OutputFormat` | CHAR | Định dạng xuất (CSV, XLSX, ...) | ✓ Hiển thị + Value Help |
| `EmailTo` | CHAR | Email nhận báo cáo | ✓ Hiển thị |
| `EmailCc` | CHAR | Email CC | ✓ Hiển thị |
| `Status` | CHAR 1 | A=Active, P=Paused, I=Inactive | ✓ Hiển thị (kèm badge màu) |
| `StatusText` | Computed | Text hiển thị trạng thái | Ẩn (dùng cho `@ObjectModel.text`) |
| `StatusCriticality` | Computed | 3=Green, 2=Yellow, 1=Red | Ẩn (dùng cho badge màu) |
| `HideParamGL01` | Virtual Boolean | Ẩn section GL01 khi ReportId ≠ 'GL-01' | Ẩn (dùng cho facet `hidden`) |
| `CreatedBy` | SYUNAME | Người tạo | ✓ Hiển thị |
| `CreatedAt` | TIMESTAMPL | Thời điểm tạo | ✓ Hiển thị |
| `LastChangedBy` | SYUNAME | Người sửa cuối | Ẩn |
| `LastChangedAt` | TIMESTAMPL | Thời điểm sửa cuối | Ẩn |
| `LocalLastChangedAt` | TIMESTAMPL | ETag field | Ẩn |

### Composition Child: `ParamGL01` (GL Report Parameters)

| Field | Kiểu dữ liệu | Mô tả |
|---|---|---|
| `SubscrUuid` | UUID | **Key** — FK trỏ về Subscription cha |
| `SubscrId` | NUMC 6 | **Key** — FK |
| `CompanyCode` | CHAR 4 | Mã công ty (Value Help: `I_CompanyCodeStdVH`) |
| `FiscalYear` | NUMC 4 | Năm tài chính |
| `FiscalPeriod` | NUMC 3 | Kỳ tài chính |
| `Currency` | CHAR 5 | Đơn vị tiền tệ (Value Help: `I_CurrencyStdVH`) |
| `GlAccount` | CHAR 10 | Tài khoản kế toán |
| `MaxRows` | INT4 | Số dòng tối đa |

### Associations (Navigation trong OData)

- `_Catalog` → `ZIR_DRS_CATALOG`: trỏ về Report Catalog (thông tin report)
- `_ParamGL01` → `ZC_DRS_PARAM_GL01`: composition child — tham số GL-01

---

## 2. Phân tích Backend: Actions & Draft Lifecycle

### 2.1 Draft Lifecycle

Subscription dùng **managed draft** — framework SAP RAP tự quản lý toàn bộ vòng đời draft:

```
[User tạo mới] → Create Draft (IsActiveEntity=false)
                → User điền form trên Object Page
                → [Save] → Activate (Draft → Active)
                → [Cancel] → Discard (Xoá draft)

[User sửa existing] → Edit (Active → Draft copy)
                     → User sửa trên Object Page
                     → [Save] → Activate (Draft → Active, old active deleted)
                     → [Cancel] → Discard (Draft copy deleted, active unchanged)
```

> **Trên Fiori Elements Object Page**: Framework **tự động** render nút Edit/Save/Cancel và xử lý toàn bộ draft lifecycle. Không cần code JavaScript — chỉ cần khai báo `contextPath` đúng entity có behavior definition `with draft`.

### 2.2 Custom Actions (Backend)

| Action | Mục đích | Logic Backend | Khi nào gọi |
|---|---|---|---|
| `createReportParams` | Tạo bộ tham số con cho subscription | Đọc `ReportId` → nếu `GL-01` → tạo `_ParamGL01` với defaults: `CompanyCode=Bukrs`, `FiscalYear=năm hiện tại`, `MaxRows=1000` | Sau khi tạo Subscription, nếu chưa có params |
| `pauseSubscription` | Tạm dừng subscription | `Status: 'A' → 'P'` (chỉ pause nếu đang Active) | Trên Object Page toolbar |
| `resumeSubscription` | Tiếp tục subscription | `Status: 'P' → 'A'` (chỉ resume nếu đang Paused) | Trên Object Page toolbar |
| `copySubscription` | Sao chép subscription + params | Tạo bản copy với `SubscrName = "Copy of ..."` + copy `_ParamGL01` nếu có | Trên Object Page toolbar |

> **Trên Fiori Elements Object Page**: Tất cả 4 actions đã được khai báo trong DDLX `UI.identification` với `type: #FOR_ACTION`. Object Page template tự render chúng thành nút bấm trên header toolbar — **không cần code JavaScript**.

### 2.3 Determination: setDefaultStatus

Khi tạo Subscription mới, backend tự set `Status = 'A'` (Active). Frontend không cần xử lý gì.

### 2.4 Early Numbering

Backend tự generate `SubscrUuid` (UUID) và `SubscrId` (sequential number). Cả hai field đều `readonly` trong behavior definition — user không nhập, frontend không cần lo.

---

## 3. Phân tích Annotations: Backend DDLX vs Local

Trước khi implement, cần hiểu rõ backend DDLX (`ZC_DRS_SUBSCR.ddlx.asddlxs` và `ZC_DRS_PARAM_GL01.ddlx.asddlxs`) **đã có đầy đủ annotations**.

### 3.1 So sánh: Dùng Backend DDLX annotations hay Override Local?

| Annotation | Backend DDLX | Local `annotation.xml` | Quyết định |
|---|---|---|---|
| `UI.HeaderInfo` | **Có** ✓ | Cần define local | **Override local** — nhất quán với các module khác |
| `UI.LineItem` | **Có** ✓ | Cần define local | **Override local** — thêm action buttons Create/Delete cho FPM |
| `UI.SelectionFields` | **Có** ✓ | Cần define local | **Override local** — nhất quán |
| `UI.Facets` | **Có** ✓ (kèm `hidden: #(HideParamGL01)`) | **KHÔNG override** | **Dùng Backend** — facet `hidden` chỉ hoạt động từ DDLX |
| `UI.FieldGroup` | **Có** ✓ | **KHÔNG override** | **Dùng Backend** — FieldGroups đã đầy đủ |
| `UI.Identification` (actions) | **Có** ✓ (4 actions) | **KHÔNG override** | **Dùng Backend** — Object Page tự render |
| `ParamGL01` annotations | **Có** ✓ (DDLX riêng) | **KHÔNG override** | **Dùng Backend** — composition child tự inherit |

> **Tại sao KHÔNG override UI.Facets ở local cho Subscription?**
> 
> Điểm khác biệt quan trọng so với `DrsJobConfig` và `JobHistoryAnalytics`: Subscription có facet dùng `hidden: #(HideParamGL01)` — cơ chế **dynamic hiding dựa trên virtual element**. Annotation này **chỉ hoạt động đúng khi được khai báo trong DDLX backend**, vì Fiori Elements cần đọc nó từ `$metadata` response chứ không phải từ local annotation file.
>
> Nếu override `UI.Facets` ở local mà không khai báo `hidden` attribute đúng cách, section GL Report Parameters sẽ **luôn hiển thị** cho mọi ReportId — gây lỗi UI.

> **Tại sao KHÔNG override UI.Identification ở local?**
>
> Backend DDLX đã khai báo 4 action buttons (`createReportParams`, `pauseSubscription`, `resumeSubscription`, `copySubscription`) trong `UI.identification`. Object Page template tự đọc từ `$metadata` và render — không cần khai báo lại ở local. Override local có thể gây duplicate buttons.

### 3.2 Annotations CẦN define ở Local

Chỉ cần define **3 annotations** cho List Page (Dashboard tab):

1. **`UI.LineItem`**: Columns cho `macros:Table` + action button Delete trên toolbar
2. **`UI.SelectionFields`**: Filter fields cho `macros:FilterBar`
3. **`UI.HeaderInfo`**: Tiêu đề Object Page (optional — backend đã có, nhưng define local cho nhất quán)

### 3.3 ParamGL01 — Không cần annotation local

Backend DDLX `ZC_DRS_PARAM_GL01.ddlx.asddlxs` đã có đầy đủ:
- `UI.HeaderInfo`: Title = CompanyCode, Description = FiscalYear
- `UI.Facets`: 1 panel "Parameter Details" dùng `IDENTIFICATION_REFERENCE`
- `UI.Identification`: 6 fields (CompanyCode, FiscalYear, FiscalPeriod, Currency, GlAccount, MaxRows)
- Value Helps: CompanyCode → `I_CompanyCodeStdVH`, Currency → `I_CurrencyStdVH`

Fiori Elements Object Page tự nhận diện composition child `_ParamGL01` và render section form từ backend annotations. **Không cần thêm gì ở frontend.**

---

## 4. Routing & Navigation (`manifest.json`)

### 4.1 Thêm Route cho Subscription Object Page

```json
{
  "name": "DrsSubscrObjectPage",
  "pattern": "DrsSubscr({SubscrUuid},{SubscrId}):?query:",
  "target": "DrsSubscrObjectPage"
}
```

> **Tại sao pattern có 2 key segments `{SubscrUuid},{SubscrId}`?**
>
> Entity `ZC_DRS_SUBSCR` có composite key gồm cả `SubscrUuid` và `SubscrId`. OData V4 route pattern phải bao gồm tất cả key fields. Tuy nhiên, trong thực tế Fiori Elements FPM có thể tự generate URL đúng khi user click row — ta chỉ cần khai báo pattern phù hợp.
>
> **Lưu ý:** Nếu gặp lỗi routing, có thể đơn giản hoá thành `DrsSubscr({SubscrUuid}):?query:` vì `SubscrUuid` là UUID unique. Cần test thực tế trên hệ thống.

### 4.2 Thêm Target (Object Page Template)

```json
"DrsSubscrObjectPage": {
  "type": "Component",
  "id": "DrsSubscrObjectPage",
  "name": "sap.fe.templates.ObjectPage",
  "options": {
    "settings": {
      "contextPath": "/DrsSubscr",
      "editableHeaderContent": false
    }
  }
}
```

> **Tại sao `editableHeaderContent: false`?**
>
> Dù Subscription cho phép Edit, field chỉnh sửa nằm trong body (FieldGroups), không phải header. Header chỉ hiển thị title (`SubscrName`) và description (`SubscrId`) — không cần edit inline.

> **Tại sao KHÔNG cần khai báo `content.body.sections` hay `actions`?**
>
> Object Page template tự đọc annotations từ `$metadata`:
> - **Facets** → từ DDLX `UI.Facets` (GeneralInfo, DeliverySettings, ParamGL01Section, AdminData)
> - **Actions** → từ DDLX `UI.Identification` (createReportParams, pause, resume, copy)
> - **Draft lifecycle** → từ behavior definition `with draft` (Edit/Save/Cancel tự sinh)
> - **ParamGL01 section** → từ facet `targetElement: '_ParamGL01'` + DDLX child annotations
>
> Tất cả đều **zero-code** ở frontend.

### 4.3 Thêm Navigation từ Dashboard Page

Trong mục `DashboardMainPage.options.settings.navigation`, thêm:

```json
"DrsSubscr": {
  "detail": {
    "route": "DrsSubscrObjectPage"
  }
}
```

*Kết quả:* Khi user click vào một dòng trên `macros:Table` của tab Subscriptions, FPM tự động điều hướng sang Object Page.

---

## 5. Giao diện Điều khiển (`Main.view.xml`)

### 5.1 Thêm ScrollContainer cho Tab "Subscriptions"

Tab Subscriptions đã có sẵn trong sidebar menu (key=`"subscriptions"`) nhưng body hiện tại chỉ có placeholder `<Title>`. Cần thay thế bằng FilterBar + Table:

```xml
<ScrollContainer id="subscriptions" horizontal="false" vertical="true" height="100%">
    <macros:FilterBar
        id="subscrFilterBar"
        metaPath="/DrsSubscr/@com.sap.vocabularies.UI.v1.SelectionFields"
        liveMode="false"/>
    <macros:Table
        id="subscrTable"
        metaPath="/DrsSubscr/@com.sap.vocabularies.UI.v1.LineItem"
        readOnly="true"
        enableExport="true"
        enableAutoColumnWidth="true"
        variantManagement="Control"
        p13nMode="Column,Sort,Filter"
        headerText="Subscriptions"
        filterBar="subscrFilterBar"
        growingThreshold="20">
        <macros:actions>
            <macros:Action key="customCreate" text="Create" press=".onCreateSubscription" requiresSelection="false" />
            <macros:Action key="customDelete" text="Delete" press=".onDeleteSubscription" requiresSelection="true" />
        </macros:actions>
    </macros:Table>
</ScrollContainer>
```

**Giải thích các thuộc tính:**

- `metaPath="/DrsSubscr/@com.sap.vocabularies.UI.v1.SelectionFields"`: Trỏ FilterBar vào annotation SelectionFields — FPM tự render filter fields (SubscrId, ReportId, Status).
- `metaPath="/DrsSubscr/@com.sap.vocabularies.UI.v1.LineItem"`: Trỏ Table vào annotation LineItem — FPM tự render columns.
- `readOnly="true"`: Table ở chế độ chỉ đọc (edit thực hiện trên Object Page).
- `<macros:actions>`: Custom Create/Delete buttons — **bắt buộc vì FPM Custom Page không tự sinh CRUD buttons** (giống pattern DrsJobConfig).

> **Tại sao readOnly="true" dù Subscription cho phép Edit?**
>
> Table trên Dashboard chỉ dùng để **xem danh sách và navigate**. Edit thực hiện trên Object Page (nút Edit trên header). Đặt `readOnly="true"` ngăn inline editing trên table — tránh conflict với draft lifecycle mà Object Page quản lý.

---

## 6. Xử lý Logic Controller (`Main.controller.js`)

### 6.1 Create Subscription (VỚI Auto-Create Parameters)

**⚠️ QUAN TRỌNG:** Backend yêu cầu gọi action `createReportParams` ngay sau khi tạo draft subscription — action này đọc `ReportId` và tạo bản ghi param tương ứng (ví dụ: `_ParamGL01` với defaults `CompanyCode=Bukrs`, `FiscalYear=năm hiện tại`, `MaxRows=1000`). 

Nếu không gọi `createReportParams`, section "GL Report Parameters" sẽ hiển thị nhưng **không có data** — user phải nhấn nút "Create Report Parameters" thủ công → UX kém.

#### 6.1.1 Luồng Tạo Subscription Đúng (3 bước)

```
[User click Create] ──► [1. Create Draft] ──► [2. Call createReportParams] ──► [3. Navigate to Object Page]
                              ↓                         ↓                              ↓
                        POST /DrsSubscr          POST .../createReportParams       Object Page mở với
                        (draft created)          (param record tạo trong draft)    form đã có defaults
```

**Phân tích code backend `createReportParams`:**

```abap
" Snippet từ zbp_r_drs_subscr.clas.abap - METHOD createReportParams
CASE <subscr>-ReportId.
  WHEN 'GL-01'.
    " Check if already exists
    READ TABLE lt_existing_gl01 ...
    IF sy-subrc = 0.
      " Already exists - skip
    ELSE.
      " Create via composition (keys inherited from parent)
      " %is_draft MUST match parent to avoid ACTIVE/DRAFT mixture dump
      APPEND VALUE #(
        %tky = CORRESPONDING #( <subscr> )
        %target = VALUE #( (
          %cid        = |GL01_{ sy-tabix }|
          %is_draft   = <subscr>-%is_draft   " ← Quan trọng: match draft state
          CompanyCode = <subscr>-Bukrs       " ← Default từ subscription
          FiscalYear  = sy-datum(4)          " ← Năm hiện tại
          MaxRows     = 1000 ) )             " ← Default max rows
      ) TO lt_create_gl01.
    ENDIF.
  WHEN OTHERS.
    " Report type không có params → warning message
ENDCASE.
```

#### 6.1.2 Implementation: onCreateSubscription

```javascript
onCreateSubscription: function (oEvent) {
    var that = this;
    var oExtensionAPI = this.getExtensionAPI();
    var oEditFlow = oExtensionAPI.getEditFlow();
    var oModel = oExtensionAPI.getModel();
    var oListBinding = oModel.bindList("/DrsSubscr");

    // Step 1: Create draft (không tự navigate - ta control navigation)
    var oContext = oListBinding.create({}, true); // true = bSkipRefresh

    oContext.created().then(function () {
        // Step 2: Call createReportParams bound action on draft context
        // Backend sẽ đọc ReportId và tạo param record tương ứng
        var sActionPath = oContext.getPath() +
            "/com.sap.gateway.srvd.zsd_drs_main_o4.v0001.createReportParams";
        var oOperation = oModel.bindContext(sActionPath + "(...)");
        
        return oOperation.execute();
    }).then(function () {
        // Step 3: Navigate to Object Page với draft context
        // oEditFlow xử lý routing đến DrsSubscrObjectPage
        return oEditFlow.navigateToContext(oContext);
    }).catch(function (oError) {
        console.error("Create subscription failed:", oError);
        MessageBox.error("Failed to create subscription: " + (oError.message || "Unknown error"));
        // Cleanup: discard draft nếu có lỗi
        if (oContext) {
            oContext.delete();
        }
    });
},
```

**Giải thích từng bước:**

| Step | Code | Mục đích |
|------|------|----------|
| 1 | `oListBinding.create({}, true)` | Tạo draft subscription (POST /DrsSubscr). Backend sinh UUID + SubscrId, set Status='A' |
| 2 | `oOperation.execute()` | Gọi bound action `createReportParams`. Backend đọc ReportId (mặc định empty) → tạo param nếu cần sau khi user chọn ReportId |
| 3 | `oEditFlow.navigateToContext(oContext)` | Navigate sang Object Page với draft context |

> **Vấn đề: ReportId chưa có giá trị khi create**
>
> Khi vừa tạo draft, `ReportId` = empty. Action `createReportParams` sẽ hit case `WHEN OTHERS` → warning message nhưng **không tạo params**.
>
> **Giải pháp 1 (Đơn giản nhất):** Không gọi `createReportParams` ở bước create. Thay vào đó, **dựa vào nút "Create Report Parameters" trên Object Page**. User chọn ReportId → ấn nút → params được tạo.
>
> **Giải pháp 2 (UX tốt hơn):** Dùng Dialog hỏi ReportId trước khi create draft, rồi truyền `ReportId` vào draft và gọi `createReportParams` ngay sau.

#### 6.1.3 Giải pháp khuyến nghị: Pre-select ReportId via Dialog

Để tối ưu UX (user không cần click thêm nút), tạo Dialog hỏi `ReportId` trước khi create:

```javascript
onCreateSubscription: function (oEvent) {
    var that = this;
    
    // Show dialog to select ReportId first
    if (!this._oReportSelectDialog) {
        this._oReportSelectDialog = new sap.m.Dialog({
            title: "Select Report Type",
            content: [
                new sap.m.VBox({
                    items: [
                        new sap.m.Label({ text: "Report ID", required: true }),
                        new sap.m.Select({
                            id: "reportIdSelect",
                            width: "100%",
                            items: [
                                new sap.ui.core.Item({ key: "GL-01", text: "GL-01 - GL Account Balances" }),
                                new sap.ui.core.Item({ key: "AR-01", text: "AR-01 - Customer Open Items" }),
                                new sap.ui.core.Item({ key: "AR-02", text: "AR-02 - Customer Balances" }),
                                new sap.ui.core.Item({ key: "AR-03", text: "AR-03 - AR Aging Report" }),
                                new sap.ui.core.Item({ key: "AP-01", text: "AP-01 - Vendor Open Items" }),
                                new sap.ui.core.Item({ key: "AP-02", text: "AP-02 - Vendor Balances" }),
                                new sap.ui.core.Item({ key: "AP-03", text: "AP-03 - AP Aging Report" })
                            ]
                        })
                    ]
                }).addStyleClass("sapUiSmallMargin")
            ],
            beginButton: new sap.m.Button({
                text: "Create",
                type: "Emphasized",
                press: function () {
                    var sReportId = sap.ui.getCore().byId("reportIdSelect").getSelectedKey();
                    if (!sReportId) {
                        MessageToast.show("Please select a Report ID");
                        return;
                    }
                    that._oReportSelectDialog.close();
                    that._createSubscriptionWithReportId(sReportId);
                }
            }),
            endButton: new sap.m.Button({
                text: "Cancel",
                press: function () {
                    that._oReportSelectDialog.close();
                }
            })
        });
        this.getView().addDependent(this._oReportSelectDialog);
    }
    
    // Reset selection and open
    sap.ui.getCore().byId("reportIdSelect").setSelectedKey("");
    this._oReportSelectDialog.open();
},

_createSubscriptionWithReportId: function (sReportId) {
    var that = this;
    var oExtensionAPI = this.getExtensionAPI();
    var oEditFlow = oExtensionAPI.getEditFlow();
    var oModel = oExtensionAPI.getModel();
    var oListBinding = oModel.bindList("/DrsSubscr");

    // Step 1: Create draft WITH ReportId pre-filled
    var oContext = oListBinding.create({
        ReportId: sReportId
    }, true);

    oContext.created().then(function () {
        // Step 2: Call createReportParams - backend đọc ReportId và tạo params
        var sActionPath = oContext.getPath() +
            "/com.sap.gateway.srvd.zsd_drs_main_o4.v0001.createReportParams";
        var oOperation = oModel.bindContext(sActionPath + "(...)");
        
        return oOperation.execute();
    }).then(function () {
        // Step 3: Navigate to Object Page
        return oEditFlow.navigateToContext(oContext);
    }).catch(function (oError) {
        console.error("Create subscription failed:", oError);
        MessageBox.error("Failed to create subscription");
        if (oContext) {
            oContext.delete();
        }
    });
},
```

**Kết quả:**
1. User click "Create" → Dialog "Select Report Type" mở
2. User chọn "GL-01" → click "Create"
3. Frontend: create draft với `ReportId: "GL-01"`
4. Frontend: gọi `createReportParams`
5. Backend: thấy `ReportId = "GL-01"` → tạo `_ParamGL01` với defaults
6. Frontend: navigate sang Object Page
7. **User thấy section "GL Report Parameters" đã có data sẵn** → chỉ cần điền các field khác và Save

> **So sánh với drs_admin (freestyle):** Logic tương tự nhưng drs_admin dùng Fragment XML và có bug cascading batch failure. FPM approach sử dụng Dialog inline đơn giản hơn và không có bug binding.

#### 6.1.4 Cải tiến: Load ReportId từ Backend (thay vì hardcode)

Thay vì hardcode danh sách Report Types trong Dialog, có thể load từ entity `DrsCatalog` (`ZIR_DRS_CATALOG`):

```javascript
_loadReportTypes: function () {
    var that = this;
    var oModel = this.getView().getModel();
    var oBinding = oModel.bindList("/DrsCatalog");
    
    return oBinding.requestContexts(0, 100).then(function (aContexts) {
        that._aReportTypes = aContexts.map(function (oCtx) {
            var oData = oCtx.getObject();
            return {
                key: oData.ReportId,
                text: oData.ReportId + " - " + oData.ReportName
            };
        });
    });
},
```

Sau đó dùng `that._aReportTypes` để tạo `sap.ui.core.Item` cho Select. Điều này đảm bảo khi backend thêm report types mới, frontend **tự động cập nhật** mà không cần deploy lại.

### 6.2 Delete Subscription (Smart Delete — Draft vs Active)

Logic giống hệt pattern đã triển khai cho `DrsJobConfig` (xem `implementation_plan_job_config.md` mục 2.1):

```javascript
onDeleteSubscription: function (oEvent) {
    var that = this;
    var oTable = this.byId("subscrTable");
    var aContexts = oTable.getSelectedContexts ? oTable.getSelectedContexts() : [];

    if ((!aContexts || aContexts.length === 0) && this.byId("subscrTable::Table")) {
        aContexts = this.byId("subscrTable::Table").getSelectedContexts() || [];
    }

    if (aContexts && aContexts.length > 0) {
        var aDraftContexts = [];
        var aActiveContexts = [];

        aContexts.forEach(function (oContext) {
            if (oContext.getProperty("IsActiveEntity") === false) {
                aDraftContexts.push(oContext);
            } else {
                aActiveContexts.push(oContext);
            }
        });

        var iTotal = aContexts.length;
        var sMsg = "";
        if (aDraftContexts.length > 0 && aActiveContexts.length > 0) {
            sMsg = aDraftContexts.length + " draft(s) will be discarded.\n" +
                   aActiveContexts.length + " active record(s) will be deleted.\n\nContinue?";
        } else if (aDraftContexts.length > 0) {
            sMsg = "Discard " + aDraftContexts.length + " draft subscription(s)?";
        } else {
            sMsg = "Delete " + aActiveContexts.length + " active subscription(s)?";
        }

        MessageBox.confirm(sMsg, {
            title: "Confirm Deletion",
            onClose: function (sAction) {
                if (sAction === MessageBox.Action.OK) {
                    var oModel = that.getView().getModel();
                    var aAllPromises = [];

                    // Active records → HTTP DELETE
                    aActiveContexts.forEach(function (oContext) {
                        aAllPromises.push(oContext.delete());
                    });

                    // Draft records → Discard action
                    aDraftContexts.forEach(function (oContext) {
                        var sDiscardPath = oContext.getPath() +
                            "/com.sap.gateway.srvd.zsd_drs_main_o4.v0001.Discard";
                        var oOp = oModel.bindContext(sDiscardPath + "(...)");
                        aAllPromises.push(oOp.execute());
                    });

                    Promise.all(aAllPromises).then(function () {
                        MessageToast.show("Deleted " + iTotal + " subscription(s) successfully.");
                        that._refreshSubscriptionTable();
                    }).catch(function (oError) {
                        MessageBox.error("Error occurred while deleting subscriptions.");
                        that._refreshSubscriptionTable();
                    });
                }
            }
        });
    } else {
        MessageToast.show("Please select at least one subscription to delete.");
    }
},
```

> **Tại sao cần phân biệt Draft vs Active khi xoá?** Xem chi tiết giải thích tại `implementation_plan_job_config.md` mục 2.1. Tóm tắt: SAP RAP từ chối HTTP DELETE trên draft — phải dùng bound action `Discard` thay thế.

### 6.3 Table Auto-Refresh

Thêm vào `onInit()` — lắng nghe route quay về Dashboard để refresh table:

```javascript
// Trong onInit(), thêm sau phần refresh JobConfig:
oRouter.getRoute("DashboardMainPage").attachPatternMatched(function () {
    setTimeout(function () {
        that._refreshSubscriptionTable();
    }, 500);
});
```

Và hàm refresh:

```javascript
_refreshSubscriptionTable: function () {
    try {
        this.getView().getModel().refresh();
    } catch (ex) {
        // ignore
    }
},
```

> **Lưu ý:** Hàm `_refreshJobConfigTable()` hiện tại đã gọi `oModel.refresh()` — refresh TOÀN BỘ model, bao gồm cả Subscription table. Do đó, có thể **không cần hàm riêng** mà reuse luôn. Tuy nhiên, tách riêng giúp code rõ ràng hơn và dễ debug nếu cần refresh selective sau này.

### 6.4 Cập nhật `onItemSelect` (nếu cần)

Nếu tab "Subscriptions" cần logic đặc biệt khi chuyển tab (ví dụ: trigger refresh), thêm vào `onItemSelect`:

```javascript
onItemSelect: function (oEvent) {
    var oItem = oEvent.getParameter("item");
    var sKey = oItem.getKey();
    if (!sKey) { return; }

    this.byId("pageContainer").to(this.byId(sKey));

    if (sKey === "history") {
        this._loadHistoryChart();
    }
    // Subscription không cần logic đặc biệt khi chuyển tab
    // macros:Table tự load data qua FilterBar binding
},
```

> Subscription tab **không cần xử lý đặc biệt** trong `onItemSelect` vì không có chart hay custom data loading — `macros:Table` + `macros:FilterBar` tự quản lý data binding.

---

## 7. Khai báo Annotations (`annotation.xml`)

### 7.1 LineItem — Columns cho Table trên Dashboard

```xml
<Annotations Target="com.sap.gateway.srvd.zsd_drs_main_o4.v0001.DrsSubscrType">
    <!-- ═══ LINE ITEM: Columns cho Subscription Table ═══ -->
    <Annotation Term="UI.LineItem">
        <Collection>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="SubscrId"/>
                <PropertyValue Property="Label" String="Subscription ID"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="SubscrName"/>
                <PropertyValue Property="Label" String="Description"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="ReportId"/>
                <PropertyValue Property="Label" String="Report ID"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="Bukrs"/>
                <PropertyValue Property="Label" String="Company Code"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="OutputFormat"/>
                <PropertyValue Property="Label" String="Format"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="EmailTo"/>
                <PropertyValue Property="Label" String="Email To"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="Status"/>
                <PropertyValue Property="Label" String="Status"/>
                <PropertyValue Property="Criticality" Path="StatusCriticality"/>
                <PropertyValue Property="CriticalityRepresentation" EnumMember="UI.CriticalityRepresentationType/WithIcon"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="CreatedBy"/>
                <PropertyValue Property="Label" String="Created By"/>
            </Record>
        </Collection>
    </Annotation>

    <!-- ═══ SELECTION FIELDS: Filter Bar ═══ -->
    <Annotation Term="UI.SelectionFields">
        <Collection>
            <PropertyPath>SubscrId</PropertyPath>
            <PropertyPath>ReportId</PropertyPath>
            <PropertyPath>Status</PropertyPath>
        </Collection>
    </Annotation>

    <!-- ═══ HEADER INFO: Object Page Title ═══ -->
    <Annotation Term="UI.HeaderInfo">
        <Record Type="UI.HeaderInfoType">
            <PropertyValue Property="TypeName" String="Subscription"/>
            <PropertyValue Property="TypeNamePlural" String="Subscriptions"/>
            <PropertyValue Property="Title">
                <Record Type="UI.DataField">
                    <PropertyValue Property="Value" Path="SubscrName"/>
                </Record>
            </PropertyValue>
            <PropertyValue Property="Description">
                <Record Type="UI.DataField">
                    <PropertyValue Property="Value" Path="SubscrId"/>
                </Record>
            </PropertyValue>
        </Record>
    </Annotation>
</Annotations>
```

### 7.2 Annotations KHÔNG cần define ở local

Các annotations sau đã có trong backend DDLX và **KHÔNG NÊN** override ở local:

| Annotation | Lý do không override |
|---|---|
| `UI.Facets` | Chứa `hidden: #(HideParamGL01)` — chỉ hoạt động từ DDLX |
| `UI.FieldGroup` (4 groups) | Đã đầy đủ, override có thể gây conflict |
| `UI.Identification` (actions) | 4 actions đã khai báo, Object Page tự render |
| `ParamGL01` toàn bộ | DDLX child annotations tự inherit qua composition |

> **Rủi ro override UI.Facets ở local:** Nếu define `UI.Facets` ở `annotation.xml`, local annotation sẽ **THAY THẾ** (không merge) backend DDLX annotation. Khi đó bạn phải tự khai báo `hidden` attribute cho ParamGL01Section bằng OData V4 EDMX syntax — phức tạp hơn nhiều so với DDLX syntax `hidden: #(HideParamGL01)`.

---

## 8. Xử lý Đặc biệt: Composition Child `_ParamGL01` trên Object Page

### 8.1 Cách hoạt động (Zero-Code)

Khi user navigate vào Object Page của một Subscription:

1. **Object Page template** đọc `UI.Facets` từ `$metadata`
2. Thấy facet `ParamGL01Section` với `targetElement: '_ParamGL01'` và `hidden: #(HideParamGL01)`
3. Gọi virtual element `HideParamGL01` → backend class `ZCL_DRS_SUBSCR_HIDE` tính toán:
   - `ReportId = 'GL-01'` → `HideParamGL01 = false` → **Hiển thị section**
   - `ReportId ≠ 'GL-01'` → `HideParamGL01 = true` → **Ẩn section**
4. Nếu hiển thị, Object Page tự navigate theo composition association `_ParamGL01` và render form fields từ DDLX `ZC_DRS_PARAM_GL01`
5. User có thể **edit inline** các param fields khi ở Edit mode (draft)

> **So sánh với drs_admin (freestyle):**
> Trong app cũ, cần 7 XML sections (cho 7 report types) + `_bindParamSection()` + `_unbindAllParamSections()` + `_checkReportParams()` + `_getParamAssociation()` — tổng cộng ~300 dòng JS + ~400 dòng XML. Gây ra cascading batch failure bug nghiêm trọng.
>
> Trong FPM: **0 dòng code**. Backend DDLX + virtual element lo hết.

### 8.2 Action "Create Report Parameters" — Vai trò sau khi có Auto-Create

Với flow mới (pre-select ReportId → auto-call `createReportParams`), nút "Create Report Parameters" trên Object Page trở thành **fallback button**:

**Khi nào nút này vẫn cần thiết?**
1. User tạo subscription theo cách khác (API, copy, import) mà không qua Dashboard
2. Lỗi xảy ra khi auto-create (network issue, backend validation)
3. User thay đổi `ReportId` sau khi đã tạo subscription → cần tạo params mới cho report type mới

**Hành vi của nút:**
1. User nhấn nút → Object Page gọi bound action `createReportParams`
2. Backend kiểm tra:
   - Nếu params đã tồn tại → **Info message** "GL-01 parameters already exist for this subscription"
   - Nếu chưa có → **Tạo mới** với defaults
   - Nếu `ReportId` không hỗ trợ → **Warning message** "Report type X does not have configurable parameters"
3. Object Page tự refresh → section params xuất hiện (nếu mới tạo)

**Không cần hide nút** — giữ nguyên như fallback để handle edge cases.

> **Backend code snippet xử lý "already exists":**
> ```abap
> READ TABLE lt_existing_gl01 WITH KEY SubscrUuid = <subscr>-SubscrUuid TRANSPORTING NO FIELDS.
> IF sy-subrc = 0.
>   " Already exists - report info message
>   APPEND VALUE #(
>     %msg = new_message_with_text(
>       severity = if_abap_behv_message=>severity-information
>       text     = 'GL-01 parameters already exist for this subscription'
>     )
>   ) TO reported-subscription.
> ELSE.
>   " Create via composition...
> ENDIF.
> ```

### 8.3 Hiện chỉ hỗ trợ GL-01

Backend hiện tại chỉ kích hoạt composition `_ParamGL01`. Các loại khác (AR-01, AR-02, AR-03, AP-01, AP-02, AP-03) đang **commented out** trong CDS và BDEF:

```abap
// composition [0..1] of ZI_DRS_PARAM_AR01 as _ParamAR01  -- TODO: Enable later
```

Khi backend team kích hoạt thêm report types:
1. Thêm composition + association trong CDS/BDEF
2. Thêm DDLX annotations cho entity mới
3. Thêm virtual element `HideParamAR01`, `HideParamAP01`, etc.
4. Thêm facets trong DDLX `ZC_DRS_SUBSCR`
5. **Frontend: KHÔNG CẦN SỬA GÌ** — Object Page tự detect facets mới từ `$metadata`

> **Đây chính là sức mạnh của Fiori Elements**: Backend thêm entity mới → frontend tự hiển thị mà không cần deploy lại.

---

## 9. Tổng kết: Files cần sửa

### Checklist triển khai

| # | File | Hành động | Nội dung |
|---|---|---|---|
| 1 | `manifest.json` | **Sửa** | Thêm route `DrsSubscrObjectPage`, target, navigation |
| 2 | `Main.view.xml` | **Sửa** | Thay placeholder `subscriptions` bằng FilterBar + Table |
| 3 | `annotation.xml` | **Sửa** | Thêm `DrsSubscrType` annotations (LineItem, SelectionFields, HeaderInfo) |
| 4 | `Main.controller.js` | **Sửa** | Thêm `onCreateSubscription`, `onDeleteSubscription`, `_refreshSubscriptionTable` |

### So sánh code lượng: drs_admin vs FPM

| Component | drs_admin (Freestyle) | FPM (Custom Dashboard) |
|---|---|---|
| **Views** | `SubscriptionList.view.xml` (~200 lines) + `SubscriptionDetail.view.xml` (~600 lines) + `CreateSubscriptionDialog.fragment.xml` + 5 value help fragments | ~25 lines XML (FilterBar + Table trong Main.view.xml) |
| **Controllers** | `SubscriptionList.controller.js` (614 lines) + `SubscriptionDetail.controller.js` (416 lines) | ~150 lines JS (Create w/ Dialog + Delete + Refresh) |
| **Annotations** | Không dùng (tất cả manual) | ~60 lines XML (LineItem + SelectionFields + HeaderInfo) |
| **Total** | ~1,830+ lines across 8+ files | **~235 lines across 4 files** |
| **Bugs encountered** | Cascading batch failure, broken discard, missing UUID, inconsistent value helps | **Zero** (framework-managed) |
| **Create Flow** | Complex: Dialog → create draft → call action → manual navigation → binding issues | Simple: Dialog → create w/ ReportId → call action → auto-navigate |

### Luồng End-to-End

```
Dashboard Tab "Subscriptions"
    ├── FilterBar (SubscrId, ReportId, Status)
    ├── Table (8 columns + Create/Delete buttons)
    │   │
    │   ├── [Create] → Dialog "Select Report Type"
    │   │       ├── User chọn ReportId (e.g., "GL-01")
    │   │       ├── [Create] → _createSubscriptionWithReportId()
    │   │       │       ├── Step 1: Create draft với ReportId pre-filled
    │   │       │       ├── Step 2: Call createReportParams action
    │   │       │       │       └── Backend tạo _ParamGL01 với defaults
    │   │       │       └── Step 3: Navigate to Object Page (Draft)
    │   │       │               ├── General Information (SubscrName, ReportId=GL-01, Bukrs)
    │   │       │               ├── Output & Delivery (OutputFormat, EmailTo, EmailCc)
    │   │       │               ├── GL Report Parameters ← ĐÃ CÓ DATA (từ createReportParams)
    │   │       │               │   └── [Create Report Parameters] → fallback button (nếu cần)
    │   │       │               ├── Administrative Data (CreatedBy, CreatedAt)
    │   │       │               ├── [Pause] / [Resume] / [Copy] → bound actions
    │   │       │               └── [Save] → Activate draft → back to list
    │   │       └── [Cancel] → close dialog
    │   │
    │   ├── [Delete] → Smart Delete (Draft=Discard, Active=DELETE)
    │   └── [Click row] → navigate to Object Page (Active → auto Edit)
    │
    └── Auto-Refresh on route back (patternMatched)
```

**Sequence Diagram chi tiết cho Create Flow:**

```
User           Dashboard        Backend                 Object Page
 │                 │                │                        │
 │── [Create] ────►│                │                        │
 │                 │                │                        │
 │◄── Dialog ──────│                │                        │
 │   "Select       │                │                        │
 │    Report"      │                │                        │
 │                 │                │                        │
 │── [GL-01] ─────►│                │                        │
 │                 │                │                        │
 │                 │── POST /DrsSubscr ────────────────────►│
 │                 │   { ReportId: "GL-01" }                 │
 │                 │                │                        │
 │                 │◄── 201 Created { SubscrUuid, SubscrId } │
 │                 │                │                        │
 │                 │── POST .../createReportParams ────────►│
 │                 │                │                        │
 │                 │                │── Create _ParamGL01    │
 │                 │                │   { CompanyCode,       │
 │                 │                │     FiscalYear,        │
 │                 │                │     MaxRows: 1000 }    │
 │                 │                │                        │
 │                 │◄── 200 OK { success message } ─────────│
 │                 │                │                        │
 │                 │── navigateToContext() ────────────────►│
 │                 │                │                        │
 │◄──────────────────────────────────────────────── Object Page renders
 │                                                  với params đã có
```

---

## 10. Các vấn đề tiềm ẩn & giải pháp

### 10.1 Composite Key Routing

**Vấn đề:** `DrsSubscr` có composite key (`SubscrUuid` + `SubscrId`). FPM cần generate URL pattern đúng khi user click row.

**Giải pháp:** Khai báo pattern `DrsSubscr({SubscrUuid},{SubscrId}):?query:` trong route. Nếu FPM không generate đúng URL, thử đơn giản hoá thành `DrsSubscr({SubscrUuid}):?query:` vì UUID đủ unique.

### 10.2 Draft Indicator trên Table

**Vấn đề:** Khi có draft đang mở (user tạo dở chưa save), table có thể hiển thị cả active lẫn draft records.

**Giải pháp:** `macros:Table` trên FPM tự xử lý draft indicator (biểu tượng bút chì) khi entity có draft behavior. Không cần code thêm.

### 10.3 Value Help Rendering

**Vấn đề:** 3 fields có `@Consumption.valueHelpDefinition` trong CDS Projection. Liệu Object Page có tự render value help dialog?

**Giải pháp:** **Có.** Fiori Elements Object Page tự đọc `@Consumption.valueHelpDefinition` từ `$metadata` và render value help icon + dialog. Không cần define thêm ở frontend. Đây là lợi thế lớn so với freestyle (drs_admin phải tạo 5 fragment files + custom loaders).

### 10.4 Status Criticality Badge

**Vấn đề:** Cột Status cần hiển thị badge màu (Green=Active, Yellow=Paused, Red=Inactive).

**Giải pháp:** Đã handle trong annotation `UI.LineItem`:
```xml
<PropertyValue Property="Criticality" Path="StatusCriticality"/>
<PropertyValue Property="CriticalityRepresentation" EnumMember="UI.CriticalityRepresentationType/WithIcon"/>
```
Backend CDS view tính `StatusCriticality` (3/2/1/0). Framework tự render badge.

### 10.5 Tương lai: Thêm Report Types

Khi backend kích hoạt AR-01, AP-01, etc.:
- Backend sửa CDS/BDEF/DDLX
- Frontend: **Không cần sửa gì** (nếu dùng dynamic `_loadReportTypes()`)
- Object Page tự detect facets mới từ `$metadata` refresh
- Action `createReportParams` backend tự xử lý logic cho report type mới

### 10.6 Xử lý Report Types chưa có Params (AR-01, AP-01, etc.)

**Hiện trạng backend:**
```abap
CASE <subscr>-ReportId.
  WHEN 'GL-01'.
    " Tạo _ParamGL01
  WHEN OTHERS.
    " Warning: "Report type X does not have configurable parameters"
ENDCASE.
```

Các report types AR-01, AR-02, AR-03, AP-01, AP-02, AP-03 hiện **chưa được implement** trong backend — chọn các type này sẽ nhận warning message nhưng KHÔNG tạo params.

**Xử lý ở frontend:**
1. User vẫn có thể tạo subscription với AR-01, etc.
2. `createReportParams` trả về warning (không phải error) → flow vẫn tiếp tục
3. Object Page không hiển thị section params (vì không có facet định nghĩa trong DDLX)
4. Khi backend enable thêm report types, frontend **tự động** hỗ trợ

> **Lưu ý:** Nếu muốn **chặn** user chọn report types chưa hỗ trợ, thêm filter trong Dialog:
> ```javascript
> var aSupportedReports = ["GL-01"]; // Update khi backend thêm
> items: that._aReportTypes
>     .filter(function (r) { return aSupportedReports.includes(r.key); })
>     .map(function (r) { return new sap.ui.core.Item({ key: r.key, text: r.text }); })
> ```

### 10.7 Lỗi createReportParams sau khi Draft đã tạo

**Kịch bản:** Draft subscription tạo thành công, nhưng `createReportParams` fail (network, backend error).

**Xử lý hiện tại trong code:**
```javascript
oContext.created().then(function () {
    // ...createReportParams...
}).catch(function (oError) {
    // ERROR: params không được tạo
    console.error("Create subscription failed:", oError);
    MessageBox.error("Failed to create subscription");
    if (oContext) {
        oContext.delete(); // ← Rollback: xoá draft
    }
});
```

**Ưu điểm:** Rollback draft nếu có lỗi → user không thấy subscription "hỏng".

**Nhược điểm:** User phải thử lại từ đầu.

**Alternative:** Vẫn navigate sang Object Page, user có thể nhấn nút "Create Report Parameters" thủ công:
```javascript
}).catch(function (oError) {
    console.error("createReportParams failed, but draft exists:", oError);
    MessageBox.warning(
        "Subscription created but parameters could not be initialized. " +
        "Please click 'Create Report Parameters' button on the detail page.",
        {
            onClose: function () {
                // Navigate anyway
                oEditFlow.navigateToContext(oContext);
            }
        }
    );
});
```
