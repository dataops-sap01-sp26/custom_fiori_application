---
name: Alternative lazy loading approaches
overview: Evaluate and compare 3 viable alternatives to the current sap.m.Table approach, all of which preserve full FPM macro capabilities (FilterBar, variant management, P13n, criticality colors).
todos:
  - id: optA
    content: "Thử Option A: stashed=\"true\" trên VBox + unstash() khi navigate — restore 22 macros vào Main.view.xml, wrap trong stashed VBox"
    status: pending
  - id: optB
    content: "Nếu A không đủ: tạo 8 ReportXxx.view.xml + ComponentContainer lazy-load trong ReportController"
    status: pending
  - id: optC
    content: "Tương lai: refactor navigation sang router-based + enableLazyLoading theo đúng FPM pattern"
    status: pending
isProject: false
---

# So sánh các giải pháp thay thế cho Lazy Loading

## Bối cảnh

Vấn đề cốt lõi là `Main.view.xml` chứa tất cả 22 `macros:FilterBar` + `macros:Table` inline. Khi app khởi động, FPM XML Preprocessor phải xử lý toàn bộ XML này ngay lập tức — bao gồm 2 bước tốn thời gian:

1. **XML Preprocessing** (~30-40s): Đọc OData `$metadata` → expand mỗi `<macros:Table/>` thành hàng trăm dòng XML thuần
2. **Control Instantiation** (~20-30s): Tạo ~1500+ UI5 control objects trong bộ nhớ

Giải pháp hiện tại (`sap.m.Table`) chỉ giải quyết cả 2 bước nhưng đánh đổi mất tính năng FPM.

---

## Các giải pháp khả thi

### Option A — `stashed="true"` trên VBox bên trong (Ít đổi nhất)

Không giống lần thử trước (stash trên ScrollContainer làm hỏng NavContainer), lần này stash VBox bên trong:

```xml
<!-- ScrollContainer vẫn là page thật trong NavContainer -->
<ScrollContainer id="report_ap01" horizontal="false" vertical="true" height="100%">
    <VBox id="report_ap01Content" stashed="true" class="sapUiResponsiveMargin drsPageContent">
        <macros:FilterBar id="ap01FilterBar" metaPath="/AP01_VendorOpenItems/..."/>
        <macros:Table id="ap01Table" metaPath="/AP01_VendorOpenItems/..."/>
    </VBox>
</ScrollContainer>
```

```javascript
// Trong onItemSelect: unstash khi navigate lần đầu
onItemSelect: function(oEvent) {
    var sKey = oItem.getKey();
    this.byId("pageContainer").to(this.byId(sKey));
    var oContent = this.byId(sKey + "Content");
    if (oContent && oContent.unstash) {
        oContent.unstash(); // instantiate controls on demand
    }
}
```

**Cơ chế hoạt động:**
- FPM Preprocessor vẫn chạy trên XML stashed ở startup → XML expansion vẫn xảy ra
- Control instantiation (tạo 1500 objects) bị defer đến lần navigate đầu tiên
- `ScrollContainer` là real page nên `NavContainer.to()` vẫn hoạt động

**Kết quả ước tính:**
- Startup: ~40-70s (giảm từ 120s)  
- Navigate lần đầu đến report: ~3-5s  
- Giữ 100% tính năng FPM

**Rủi ro:** Bước XML preprocessing vẫn chạy lúc startup, chỉ tiết kiệm được phần instantiation. Nếu bottleneck chính là preprocessing → ít cải thiện.

---

### Option B — ComponentContainer (Lazy-load FE component theo từng report)

Mỗi report là một XMLView riêng với macros, được wrap trong `sap.fe.core.fpm` ComponentContainer, chỉ tạo ra khi navigate lần đầu:

**8 view files mới** (một file nhỏ per report, ví dụ `ReportAP01.view.xml`):
```xml
<mvc:View xmlns:macros="sap.fe.macros" xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m"
    controllerName="cfa.customfioriapplication.ext.view.ReportPage">
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <macros:FilterBar metaPath="/AP01_VendorOpenItems/@UI.SelectionFields" liveMode="false"/>
        <macros:Table metaPath="/AP01_VendorOpenItems/@UI.LineItem" readOnly="true" .../>
    </VBox>
</mvc:View>
```

**`Main.view.xml`**: chỉ có ScrollContainers rỗng (như đã làm ở bước trước).

**`ReportController.js`**: thay vì tạo `sap.m.Table`, tạo ComponentContainer:
```javascript
var oContainer = new ComponentContainer({
    name: "sap.fe.core.fpm",
    settings: {
        viewName: "cfa.customfioriapplication.ext.view.ReportAP01",
        contextPath: "/AP01_VendorOpenItems",
        navigation: { AP01_VendorOpenItems: { detail: { route: "AP01ObjectPage" } } }
    },
    async: true,
    height: "100%"
});
oScrollContainer.addContent(oContainer);
```

**Kết quả ước tính:**
- Startup: ~10-15s (chỉ 6 macros cho 3 trang Tier-1)
- Navigate lần đầu đến report: ~3-8s (component init + metadata)
- Giữ 100% tính năng FPM (FilterBar, variant management, P13n, criticality)

**Rủi ro:** `sap.fe.core.fpm` component con có thể conflict với routing của parent component. Cần test kỹ.

---

### Option C — Routing-based architecture (Kiến trúc dài hạn đúng nhất)

Sử dụng `enableLazyLoading: true` đã có sẵn trong [`manifest.json`](webapp/manifest.json#L91) theo đúng thiết kế của SAP:

- Sidebar click → `this.getRouter().navTo(sPageKey)` (thay vì `NavContainer.to()`)
- Mỗi report page là một route target trong `manifest.json`:
  ```json
  "AP01ListPage": {
    "type": "Component",
    "name": "sap.fe.core.fpm",
    "options": { "settings": { "viewName": "...ReportAP01", "contextPath": "/AP01_VendorOpenItems" } }
  }
  ```
- `tnt:mainContents` dùng một component area được router điều khiển
- SAP tự động lazy-load mỗi target khi navigate đến

**Kết quả:** Giải pháp chuẩn SAP, startup nhanh nhất, giữ toàn bộ FPM. Tuy nhiên yêu cầu refactor lớn toàn bộ navigation architecture.

---

## So sánh tổng hợp

- **Option A** — Effort: thấp | Startup cải thiện: trung bình (tiết kiệm instantiation) | FPM features: 100% | Rủi ro: thấp-trung bình
- **Option B** — Effort: trung bình | Startup cải thiện: cao (~90% nhanh hơn) | FPM features: 100% | Rủi ro: trung bình (cần test routing conflict)
- **Option C** — Effort: cao | Startup cải thiện: tối đa | FPM features: 100% | Rủi ro: thấp (SAP-native)
- **Current (sap.m.Table)** — Effort: đã xong | Startup: tốt | FPM features: ~40% | Rủi ro: không có

## Khuyến nghị

Thử theo thứ tự:
1. **Option A trước** — Ít code nhất, zero trade-offs về features, có thể là đủ nếu bottleneck chính là instantiation
2. **Nếu A không đủ → Option B** — Giữ toàn bộ FPM, startup tương đương giải pháp hiện tại
3. **Option C** — Dành cho tương lai nếu cần mở rộng app thêm nhiều pages