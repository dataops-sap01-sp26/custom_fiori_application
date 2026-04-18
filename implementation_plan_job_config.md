# Tài liệu Triển khai: Job Configurations Dashboard

Tài liệu này ghi nhận lại toàn bộ quá trình thiết kế và mã hóa (implementation) để nhúng module **Job Configurations** vào Fiori Custom Dashboard, đảm bảo từ danh sách tĩnh chuyển thành giao diện read-only và cho phép drill-down vào trang chi tiết (Object Page) theo đúng chuẩn UI/UX từ backend.

---

## 1. Kiến trúc định tuyến (Routing & Navigation)

Do trang Dashboard sử dụng kiến trúc Custom FPM (`sap.fe.core.fpm`) thay vì List Report tiêu chuẩn, chúng ta phải khai báo cấu hình dẫn đường (navigation) tường minh trong Fiori.

### **Sửa đổi trong `manifest.json`**
Chúng ta đã thêm định nghĩa cho **Object Page** và kích hoạt Navigation từ Table:

```json
"routes": [
  {
    "name": "DashboardMainPage",
    "pattern": ":?query:",
    "target": "DashboardMainPage"
  },
  {
    "name": "DrsJobConfigObjectPage",
    "pattern": "DrsJobConfig({JobUuid}):?query:",
    "target": "DrsJobConfigObjectPage"
  }
]
```

**Target cho Object Page:**
Báo cho Fiori Elements biết Route này sẽ mở Template Object Page mặc định mà không cần code thêm view controller:
```json
"DrsJobConfigObjectPage": {
  "type": "Component",
  "id": "DrsJobConfigObjectPage",
  "name": "sap.fe.templates.ObjectPage",
  "options": {
    "settings": {
      "contextPath": "/DrsJobConfig",
      "editableHeaderContent": false
    }
  }
}
```

**Liên kết từ Custom Page sang Object Page:**
Trong mục `DashboardMainPage`, thiết lập cơ chế navigation của entity `DrsJobConfig`:
```json
"navigation": {
  "DrsJobConfig": {
    "detail": {
      "route": "DrsJobConfigObjectPage"
    }
  }
}
```
*Kết quả:* Khi click vào một dòng (row) trên macros:Table của `DashboardMainPage`, User sẽ được điều hướng tới Object Page một cách tự động.

---

## 2. Thiết kế Giao diện (User Interface)

### **Cập nhật `Main.view.xml`**

Nhúng Trình điều khiển danh sách (`macros:Table` và `macros:FilterBar`) vào Tab **Job Configurations**:

```xml
<ScrollContainer id="jobconfigs" horizontal="false" vertical="true" height="100%">
    <!-- VBox wrapper chuẩn hóa layout — tất cả các tab đều có cấu trúc này -->
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <macros:FilterBar
            id="jobConfigFilterBar"
            metaPath="/DrsJobConfig/@com.sap.vocabularies.UI.v1.SelectionFields"
            liveMode="false"/>
        <macros:Table
            id="jobConfigTable"
            metaPath="/DrsJobConfig/@com.sap.vocabularies.UI.v1.LineItem"
            readOnly="true"
            enableExport="true"
            enableAutoColumnWidth="true"
            variantManagement="Control"
            p13nMode="Column,Sort,Filter"
            headerText="Job Configurations"
            filterBar="jobConfigFilterBar"
            growingThreshold="20">
            <macros:actions>
                <macros:Action key="customCreate" text="Create" press=".onCreateJobConfig" requiresSelection="false" />
                <macros:Action key="customDelete" text="Delete" press=".onDeleteJobConfig" requiresSelection="true" />
            </macros:actions>
        </macros:Table>
    </VBox>
</ScrollContainer>
```

### 2.1 Xử lý sự cố cấu hình CRUD trên hệ thống FPM Custom Page
**Vấn đề:** Khác với Template ứng dụng chuẩn (`sap.fe.templates.ListReport`), màn hình `sap.fe.core.fpm` (Custom Page) được Fiori Framework coi là màn hình tự do (freestyle display). Mặc định hệ thống không kích hoạt global `EditFlow`, nên nó từ chối tự hiển thị tính năng Create/Delete dù Backend (OData Capabilities) có cho phép. Đồng thời, việc chèn Action tag vào trong view `<macros:Table>` khiến cho luồng event đôi khi bị tuột object parameter context.

**Cách triển khai (Workaround API) trong `Main.controller.js`:**
Thay vì dùng lại ListReport (sẽ phá vỡ thiết kế Dashboard Menu dọc), ta sẽ móc nối thủ công Fiori Core API và `Context` OData:

1. **Hành động Create (Tạo mới):** Khởi tạo một đối tượng Danh sách (List Binding) trỏ vào Entity `/DrsJobConfig` bằng ExtensionAPI. Khi đó gọi hàm `createDocument()` của dịch vụ `EditFlow`, framework sẽ tự lo việc điều hướng sang trang Detail Object Page để thao tác tạo.
   ```javascript
   var oExtensionAPI = this.getExtensionAPI();
   var oListBinding = oExtensionAPI.getModel().bindList("/DrsJobConfig");
   oExtensionAPI.getEditFlow().createDocument(oListBinding, { creationMode: "NewPage" });
   ```

2. **Hành động Delete (Xóa thông minh — Smart Delete):** Trên hệ thống SAP RAP có Draft, mỗi record trên bảng có thể ở 1 trong 2 trạng thái:
   - **Active** (`IsActiveEntity = true`): Dữ liệu đã Save chính thức → xoá bằng `oContext.delete()` (HTTP DELETE).
   - **Draft** (`IsActiveEntity = false`): Bản nháp đang sửa dở hoặc mới tạo chưa Save → **KHÔNG ĐƯỢC** dùng HTTP DELETE vì SAP RAP sẽ từ chối với lỗi *"Delete on draft root instance not allowed. Use discard"*. Phải gọi **bound action `Discard`** thay thế.

   **Cách tìm đúng tên action:** Mở file `metadata.xml` của OData Service, tìm annotation `DiscardAction`. Trong hệ thống này:
   ```
   DiscardAction = "com.sap.gateway.srvd.zsd_drs_main_o4.v0001.Discard"
   ```

   **Logic xử lý trong Controller:**
   ```javascript
   // Bước 1: Phân loại record đang chọn thành 2 nhóm
   aContexts.forEach(function (oContext) {
       var bIsActive = oContext.getProperty("IsActiveEntity");
       if (bIsActive === false) {
           aDraftContexts.push(oContext);   // → Sẽ gọi Discard
       } else {
           aActiveContexts.push(oContext);  // → Sẽ gọi HTTP DELETE
       }
   });

   // Bước 2: Xoá Active records bình thường
   aActiveContexts.forEach(function (oContext) {
       aAllPromises.push(oContext.delete());
   });

   // Bước 3: Discard Draft records bằng bound action
   aDraftContexts.forEach(function (oContext) {
       var sAction = oContext.getPath() + "/com.sap.gateway.srvd.zsd_drs_main_o4.v0001.Discard";
       var oOp = oModel.bindContext(sAction + "(...)");
       aAllPromises.push(oOp.execute());
   });

   // Bước 4: Đợi tất cả hoàn tất
   Promise.all(aAllPromises).then(...);
   ```

   > **Popup confirm thông minh:** Trước khi xoá, hệ thống hiển thị thông báo chi tiết: *"2 draft(s) will be discarded. 1 active record(s) will be deleted."* — giúp user biết rõ hành động sắp xảy ra.

### 2.2 Tự động Refresh bảng sau khi Create / Delete (Table Auto-Refresh)

**Vấn đề:** Trên kiến trúc Custom FPM Page (`sap.fe.core.fpm`), sau khi người dùng thực hiện **Create** (tạo mới trên Object Page rồi quay về Dashboard) hoặc **Delete** (xoá dòng), bảng `macros:Table` **không tự động cập nhật UI** — dữ liệu mới/đã xoá không phản ánh lên giao diện. Người dùng phải F5 reload trang rồi ấn nút "Go" trên FilterBar mới thấy kết quả.

**Nguyên nhân gốc:**
- Khác với `sap.fe.templates.ListReport` (template chuẩn), Custom FPM Page **không có cơ chế tự động lắng nghe** sự thay đổi dữ liệu từ OData Model để refresh bảng.
- Khi user navigate sang Object Page (tạo/sửa) rồi quay lại, FPM Component được **cache lại** trong bộ nhớ — `onAfterRendering()` không chạy lại, nên không có cơ hội trigger refresh.
- Sau khi gọi `oContext.delete()`, OData V4 Model xoá context khỏi cache nội bộ, nhưng `macros:Table` binding không tự biết để re-render lại danh sách.

**Giải pháp triển khai:**

#### A. Refresh sau Delete — Gọi `_refreshJobConfigTable()` trong callback

Sau khi `Promise.all()` hoàn tất (dù thành công hay lỗi), ta gọi hàm `_refreshJobConfigTable()` để ép bảng tải lại dữ liệu:

```javascript
Promise.all(aDeletePromises).then(function () {
    MessageToast.show("Deleted " + iSelectedCount + " record(s) successfully.");
    that._refreshJobConfigTable();  // ← Refresh ngay sau khi xoá
}).catch(function () {
    MessageBox.error("Error occurred while deleting one or more records.");
    that._refreshJobConfigTable();  // ← Vẫn refresh để đồng bộ trạng thái
});
```

#### B. Refresh sau Create — Lắng nghe sự kiện Routing `patternMatched`

Thay vì dùng `onAfterRendering()` (không hoạt động do FPM cache view), ta đăng ký sự kiện `patternMatched` trên route `"DashboardMainPage"` ngay trong `onInit()`. Mỗi khi URL quay lại trang Dashboard (sau khi Save xong ở Object Page), hệ thống tự động trigger refresh:

```javascript
onInit: function () {
    PageController.prototype.onInit.apply(this, arguments);
    var that = this;
    try {
        var oRouter = this.getAppComponent().getRouter();
        oRouter.getRoute("DashboardMainPage").attachPatternMatched(function () {
            setTimeout(function () {
                that._refreshJobConfigTable();
            }, 500);  // Delay nhỏ đợi FPM mount xong
        });
    } catch (e) {
        // Router chưa ready — table sẽ load lần đầu qua FilterBar
    }
},
```

> **Tại sao dùng `setTimeout(500)`?** Khi FPM Component được restore từ cache, một số control bên trong (MDC Table, FilterBar) chưa kịp mount xong binding. Delay 500ms đảm bảo binding đã sẵn sàng nhận lệnh `refresh()`.

#### C. Hàm `_refreshJobConfigTable()` — Refresh toàn bộ OData Model

Hàm tiện ích này gọi `refresh()` trên toàn bộ OData V4 Model, ép tất cả binding đang hiển thị tải lại dữ liệu mới nhất từ Backend:

```javascript
_refreshJobConfigTable: function () {
    try {
        this.getView().getModel().refresh();
    } catch (ex) {
        // Không làm gì — user sẽ phải F5
    }
}
```

> **Tại sao dùng `oModel.refresh()` thay vì refresh riêng từng bảng?** Vì trên Custom FPM Page, `macros:Table` wrapper không đảm bảo expose API `getRowBinding()` ở mọi version UI5. Gọi `oModel.refresh()` đơn giản, luôn hoạt động, và đủ nhanh cho dashboard chỉ có vài entity.

---

## 3. Khai báo Annotations (`annotation.xml`)

Để cả danh sách List Report và Object Page hiển thị đồng nhất với Backend Fiori gốc, chúng ta đã convert và dán siêu dữ liệu DDLX từ Backend vào `annotation.xml`.

### Khoản 3.1 - Các cột và Bộ Lọc (Table & FilterBar)
*   **`@UI.LineItem`**: Thiết lập 8 cột hiển thị `JobId`, `JobText`, `RunType`, `SubscrId`, `JobName`, `JobStatus` (kèm Criticality sinh badge màu), `JobStatusText`, `CreatedAt`. Kèm theo 3 Action Buttons là **Schedule**, **Cancel** và **Refresh Status**.
*   **`@UI.SelectionFields`**: Mở 5 filter parameters tại SmartFilterBar bao gồm `ScheduledStartDate`, `CreatedBy`, `SubscrId`, `JobId`, `JobStatus`.

### Khoản 3.2 - Trang Chi Tiết (Object Page UX)
Để Fiori Render được giao diện chi tiết đẹp khi User click vào record, chúng ta bổ sung các annotations:

*   **`@UI.HeaderInfo`**: Cấu hình Title và Description của Head trang chi tiết (Sử dụng `JobId` làm Title phụ và `JobText` làm Title chính).
*   **`@UI.Facets` & `@UI.FieldGroup`**: Bố cục các trường thông tin thành nhiều Panel con một cách chuyên nghiệp. 
    Các Panel (Facets) được tạo theo hệ sinh thái Backend gồm:
    1.  **General Settings**: (Description, Kiểu chạy, Subscription ID).
    2.  **Schedule Settings**: Thời gian bắt đầu vòng đời, Múi giờ.
    3.  **Periodic Settings**: Các tham số chu kỳ lịch trình lặp.
    4.  **Weekday/Monthly Settings**: Giới hạn ngày hoặc tháng chuyên sâu.
    5.  **Job Status**: Trạng thái lỗi kỹ thuật chi tiết của Background Job.
    6.  **Administrative Data**: Kiểm toán ai tạo, tạo khi nào.

---

## 4. Tổng Kết

Thông qua sự kết hợp của 5 elements:
1. **Routing Config** — Chuyển đổi trang giữa Dashboard ↔ Object Page
2. **Custom XML View** — Gắn `macros:Table`, `macros:FilterBar` và `macros:Action` (Create/Delete) vào layout FPM (bọc trong `VBox.drsPageContent`)
3. **Fiori Annotations** — Meta data map giao diện UI/UX cho cả List và Object Page
4. **Table Auto-Refresh** — Routing event (`patternMatched`) + OData binding refresh đảm bảo dữ liệu luôn đồng bộ sau mỗi thao tác CRUD
5. **Domain Controller Pattern** — Logic CRUD nằm trong `JobConfigController.js` riêng; `Main.controller.js` chỉ delegate. Action namespace `com.sap.gateway.srvd.zsd_drs_main_o4.v0001` được inline trực tiếp (không còn dùng `constants.js`).

Chúng ta hoàn tất module **Job Configurations** đảm bảo ba trải nghiệm: List view nhanh chóng với xuất khẩu/lọc/phân trang; Detail view (Object Page) chuyên nghiệp; và CRUD operations (Create/Delete) hoạt động mượt mà với phản hồi UI tức thời — tất cả trên nền tảng Custom FPM Dashboard thay vì ListReport truyền thống.

