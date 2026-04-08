# Tài liệu Triển khai: My Exports (Report Files)

Tài liệu này ghi nhận lại toàn bộ quá trình thiết kế và triển khai module **My Exports (Report Files)** trên Fiori Custom Dashboard — cho phép người dùng xem danh sách và tải về các file báo cáo được hệ thống sinh ra sau mỗi lần chạy job.

---

## 1. Kiến trúc Tổng quan

### Entity Backend: `DrsFile`

Entity này được expose từ CDS Projection `ZC_DRS_FILE` (dựa trên Interface View `ZI_DRS_FILE` và bảng vật lý `ZDRS_FILE`) qua service `ZSD_DRS_MAIN_O4`.

**Điểm đặc biệt so với các entity khác:**

| Đặc điểm | DrsJobConfig | JobHistoryAnalytics | **DrsFile** |
|---|---|---|---|
| Loại | RAP BO (CRUD) | Analytics Cube | **RAP BO (Read-only)** |
| Dùng Draft? | Có | Không | **Không** |
| Mục đích | Cấu hình job | Xem lịch sử | **Xem & tải file báo cáo** |
| Tính năng đặc biệt | Create/Delete | Chart analytics | **File download streaming** |

### Toàn bộ fields của entity `DrsFile`

| Field | Kiểu dữ liệu | Mô tả | Hiển thị UI |
|---|---|---|---|
| `FileUuid` | UUID (16 bytes) | **Key** — ID duy nhất của file | Ẩn |
| `JobUuid` | UUID (16 bytes) | FK trỏ về Job cha | Ẩn |
| `FileName` | CHAR 128 | Tên file đầy đủ | ✓ Hiển thị |
| `FileContent` | RSTR (Large Object) | Nội dung file nhị phân | ✓ → Nút download |
| `MimeType` | CHAR 128 | Kiểu MIME (vd: `application/pdf`) | ✓ Hiển thị |
| `FileSize` | INT4 | Kích thước file (bytes, raw) | Ẩn |
| `FileSizeDisplay` | CHAR 20 | Kích thước đã format (vd: `1.2 MB`) | ✓ Hiển thị |
| `CreatedBy` | SYUNAME | Người tạo file | ✓ Hiển thị |
| `CreatedAt` | TIMESTAMPL | Thời điểm tạo file | ✓ Hiển thị |

### Associations (Navigation trong OData)

CDS Projection `ZC_DRS_FILE` khai báo hai association:
- `_JobConfig` → `ZCR_DRS_JOB_CONFIG`: trỏ về cấu hình job đã sinh ra file
- `_JobHistory` → `ZC_DRS_JOB_HISTORY`: trỏ về lần chạy job cụ thể

---

## 2. Cơ chế Download File: `@Semantics.largeObject`

Đây là điểm kỹ thuật quan trọng nhất của module này. Không giống các entity thông thường, `DrsFile` có field `FileContent` được annotate với `@Semantics.largeObject` trên Interface View `ZI_DRS_FILE`:

```abap
@Semantics.largeObject: {
    mimeType: 'MimeType',
    fileName: 'FileName',
    contentDispositionPreference: #ATTACHMENT
}
FileContent,
```

**Cơ chế hoạt động:**

```
Fiori Elements nhận biết @Semantics.largeObject
    → Tự tạo URL streaming: GET /DrsFile(FileUuid)/FileContent/$value
    → Render thành nút download trong Table và Object Page
    → Khi user click → Browser tải file về với đúng tên (FileName) và MIME type
    → contentDispositionPreference: #ATTACHMENT → Browser tự lưu, không mở inline
```

> **Tại sao không cần xử lý gì thêm ở Frontend?** SAP RAP kết hợp với OData V4 tự xử lý toàn bộ streaming endpoint. Fiori Elements nhận diện annotation `@Semantics.largeObject` từ `$metadata` và tự render control download phù hợp — developer không cần viết thêm code JavaScript hay custom URL.

> **Tại sao dùng `DataField` cho `FileContent` trong `UI.LineItem` thay vì `DataFieldWithUrl`?** Khi field có `@Semantics.largeObject`, Fiori Elements đã biết cách render nó thành download control. Dùng `DataField` thông thường là đủ — framework tự quyết định cách hiển thị dựa trên semantic annotation. Không cần khai báo URL thủ công như `DataFieldWithUrl`.

---

## 3. Phân tích Annotations: Backend vs Local

Trước khi implement, cần hiểu rõ backend (`zc_drs_file.ddlx.asddlxs`) đã có annotations nào, và chúng ta cần thêm gì vào `annotation.xml` local.

| Annotation | Backend (`zc_drs_file.ddlx`) | Local (`annotation.xml`) | Ghi chú |
|---|---|---|---|
| `UI.HeaderInfo` | **Có** ✓ | **Có** ✓ | Định nghĩa lại local để có full control |
| `UI.LineItem` | **Có** ✓ | **Có** ✓ | Override để điều chỉnh columns theo nhu cầu dashboard |
| `UI.Facets` | **Có** ✓ | **Có** ✓ | Định nghĩa lại local cho nhất quán |
| `UI.FieldGroup` | **Có** ✓ | **Có** ✓ | Định nghĩa lại local |
| `UI.SelectionFields` | **Không có** ✗ | **Thêm mới** ✓ | **Backend bỏ sót** — bắt buộc phải thêm local để FilterBar hiển thị field |

> **Tại sao define lại những annotation backend đã có?** Hai lý do: (1) Local annotation **override** backend annotation — giúp kiểm soát chính xác những gì hiển thị trong dashboard mà không phụ thuộc vào thay đổi từ backend. (2) Nhất quán với cách tiếp cận của các module khác trong dự án (`DrsJobConfig`, `JobHistoryAnalytics`) — tất cả đều define đầy đủ annotation local.

> **Tại sao backend không có `UI.SelectionFields`?** Đây không phải lỗi backend — `UI.SelectionFields` thường chỉ cần thiết khi có SmartFilterBar/FPM FilterBar. Backend `ZC_DRS_FILE` được thiết kế để dùng chủ yếu qua Object Page navigation (từ JobConfig hoặc JobHistory), không phải qua FilterBar độc lập. Dashboard cần FilterBar nên phải thêm vào local.

---

## 4. Routing & Navigation (`manifest.json`)

### 4.1 Thêm Route cho Object Page

```json
{
  "name": "DrsFileObjectPage",
  "pattern": "DrsFile({FileUuid}):?query:",
  "target": "DrsFileObjectPage"
}
```

> **Tại sao key field là `FileUuid` trong URL pattern?** `FileUuid` là field được khai báo là `key` trong CDS View `ZC_DRS_FILE`. OData V4 dùng key fields để xây dựng entity path (`/DrsFile(guid'...')`). FPM cần biết tên field key để build đúng URL navigation.

### 4.2 Thêm Target cho Object Page

```json
"DrsFileObjectPage": {
  "type": "Component",
  "id": "DrsFileObjectPage",
  "name": "sap.fe.templates.ObjectPage",
  "options": {
    "settings": {
      "contextPath": "/DrsFile",
      "editableHeaderContent": false
    }
  }
}
```

> **Tại sao `editableHeaderContent: false`?** `DrsFile` là entity chỉ xem — hệ thống tự sinh file, người dùng không được sửa tên hay nội dung. Tắt chế độ này đảm bảo header Object Page không có nút Edit/Save, tránh người dùng nhầm lẫn.

### 4.3 Thêm Navigation linking

Trong mục `DashboardMainPage`, bổ sung:

```json
"DrsFile": {
  "detail": {
    "route": "DrsFileObjectPage"
  }
}
```

> **Tại sao cần khai báo Navigation này?** FPM cần biết: khi user click vào một dòng trên `macros:Table` binding vào entity `DrsFile`, thì sẽ navigate sang route nào. Nếu thiếu khai báo này, click vào dòng sẽ không có phản ứng hoặc báo lỗi routing.

---

## 5. Giao diện Điều khiển (`Main.view.xml`)

### 5.1 Trước khi thay đổi

```xml
<ScrollContainer id="exports" horizontal="false" vertical="true">
    <Title text="Generated Files / My Exports" class="sapUiMediumMargin"/>
</ScrollContainer>
```

Tab "My Exports" chỉ có một tiêu đề tĩnh — chưa có control nào thực sự.

### 5.2 Sau khi thay đổi

```xml
<ScrollContainer id="exports" horizontal="false" vertical="true" height="100%">
    <macros:FilterBar
        id="drsFileFilterBar"
        metaPath="/DrsFile/@com.sap.vocabularies.UI.v1.SelectionFields"
        liveMode="false"/>
    <macros:Table
        id="drsFileTable"
        metaPath="/DrsFile/@com.sap.vocabularies.UI.v1.LineItem"
        readOnly="true"
        enableExport="true"
        enableAutoColumnWidth="true"
        variantManagement="Control"
        p13nMode="Column,Sort,Filter"
        headerText="My Exports (Report Files)"
        filterBar="drsFileFilterBar"
        growingThreshold="20">
    </macros:Table>
</ScrollContainer>
```

**Giải thích từng thuộc tính:**

| Thuộc tính | Giá trị | Lý do |
|---|---|---|
| `height="100%"` | 100% | Đảm bảo ScrollContainer chiếm toàn bộ chiều cao khung nội dung, giống các tab khác |
| `liveMode="false"` (FilterBar) | false | User phải nhấn "Go" để search — tránh query liên tục khi đang gõ |
| `readOnly="true"` (Table) | true | Entity chỉ xem, không cho phép sửa |
| `enableExport="true"` | true | Cho phép xuất danh sách file ra Excel |
| `enableAutoColumnWidth="true"` | true | Tự động căn chiều rộng cột theo nội dung |
| `p13nMode="Column,Sort,Filter"` | — | Cho phép ẩn/hiện cột, sắp xếp, thêm filter qua personalization |
| `growingThreshold="20"` | 20 | Load 20 dòng ban đầu, load thêm khi scroll xuống |
| `filterBar="drsFileFilterBar"` | — | Kết nối Table với FilterBar — khi nhấn "Go", table tự filter theo điều kiện |

> **Tại sao không có `<macros:actions>`?** Khác với `DrsJobConfig` (có Create/Delete), `DrsFile` là entity chỉ xem (file do system sinh ra, không phải user tạo thủ công). `readOnly="true"` là đủ — FPM tự tắt toàn bộ các action CRUD, không cần thêm custom actions.

---

## 6. Khai báo Annotations (`annotation.xml`)

### 6.1 `UI.LineItem` — Cột hiển thị trên Table

```xml
<Annotation Term="UI.LineItem">
    <Collection>
        <Record Type="UI.DataField">
            <PropertyValue Property="Value" Path="FileName"/>
            <PropertyValue Property="Label" String="File Name"/>
        </Record>
        <Record Type="UI.DataField">
            <PropertyValue Property="Value" Path="FileContent"/>
            <PropertyValue Property="Label" String="Download"/>
        </Record>
        <Record Type="UI.DataField">
            <PropertyValue Property="Value" Path="FileSizeDisplay"/>
            <PropertyValue Property="Label" String="File Size"/>
        </Record>
        <Record Type="UI.DataField">
            <PropertyValue Property="Value" Path="MimeType"/>
            <PropertyValue Property="Label" String="Type"/>
        </Record>
        <Record Type="UI.DataField">
            <PropertyValue Property="Value" Path="CreatedBy"/>
            <PropertyValue Property="Label" String="Created By"/>
        </Record>
        <Record Type="UI.DataField">
            <PropertyValue Property="Value" Path="CreatedAt"/>
            <PropertyValue Property="Label" String="Created At"/>
        </Record>
    </Collection>
</Annotation>
```

> **Tại sao `FileContent` được dùng `DataField` thông thường mà vẫn render thành download button?** Vì `@Semantics.largeObject` trên field này trong CDS đã được đưa vào `$metadata` của OData service. Khi Fiori Elements đọc `$metadata`, nó nhận biết `FileContent` là large object binary và tự render thành download control — không cần khai báo URL hay link thủ công trong annotation.

> **Tại sao ẩn `FileUuid`, `JobUuid`, `FileSize`?** Ba field này không có giá trị hiển thị với end-user: UUID là technical key (nhìn vào không đọc được), `JobUuid` là FK nội bộ, `FileSize` là số bytes thô (dùng `FileSizeDisplay` đã format sẵn như "1.2 MB" thân thiện hơn).

### 6.2 `UI.SelectionFields` — Filter Bar

```xml
<Annotation Term="UI.SelectionFields">
    <Collection>
        <PropertyPath>FileName</PropertyPath>
        <PropertyPath>CreatedBy</PropertyPath>
        <PropertyPath>CreatedAt</PropertyPath>
    </Collection>
</Annotation>
```

> **Tại sao chọn 3 field này?** Đây là 3 tiêu chí user thực tế nhất cần để tìm file: (1) `FileName` — tìm theo tên file cụ thể; (2) `CreatedBy` — xem file của ai; (3) `CreatedAt` — lọc theo khoảng thời gian. `MimeType` và `FileSizeDisplay` ít khi được dùng để tìm kiếm.

> **Đây là annotation duy nhất không có trong backend.** Backend `zc_drs_file.ddlx` không định nghĩa `UI.SelectionFields` vì entity này thường được truy cập qua navigation từ JobConfig/JobHistory, không phải qua standalone FilterBar. Khi nhúng vào Dashboard, cần FilterBar độc lập, nên phải thêm vào local annotation.

### 6.3 `UI.HeaderInfo` — Tiêu đề Object Page

```xml
<Annotation Term="UI.HeaderInfo">
    <Record Type="UI.HeaderInfoType">
        <PropertyValue Property="TypeName" String="Report File"/>
        <PropertyValue Property="TypeNamePlural" String="Report Files"/>
        <PropertyValue Property="Title">
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="FileName"/>
            </Record>
        </PropertyValue>
        <PropertyValue Property="Description">
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="MimeType"/>
            </Record>
        </PropertyValue>
    </Record>
</Annotation>
```

> **Tại sao `FileName` làm Title?** Đây là thông tin identify rõ ràng nhất của một file — người dùng nhận ra file qua tên. `MimeType` làm Description giúp người dùng biết ngay đây là file PDF, Excel hay định dạng khác trước khi tải về.

### 6.4 `UI.Facets` + `UI.FieldGroup` — Bố cục Object Page

Object Page được chia thành 2 panel:

**Panel 1 — File Details:**
- `FileName`: Tên file
- `FileContent`: Nút tải file (streaming download)
- `FileSizeDisplay`: Kích thước file đã format
- `MimeType`: Định dạng file

**Panel 2 — Administrative Data:**
- `CreatedBy`: Ai tạo file
- `CreatedAt`: Khi nào tạo file

> **Tại sao tách 2 panel?** Nhóm logic: thông tin về bản thân file (nội dung, kích thước, định dạng) để riêng — thông tin hành chính (ai tạo, khi nào) để riêng. Đây là chuẩn UX của Fiori Object Page, tương tự các entity khác trong dự án.

---

## 7. Controller (`Main.controller.js`)

**Không có thay đổi nào trong Controller.**

`DrsFile` là module đơn giản nhất trong Dashboard — hoàn toàn read-only, không có tính năng đặc biệt nào cần xử lý client-side:
- Không có CRUD → không cần action handlers
- Không có chart → không cần JSONModel hay data aggregation
- Download file → do OData V4 streaming + Fiori Elements tự xử lý

`macros:Table` tự kết nối với `macros:FilterBar` qua thuộc tính `filterBar="drsFileFilterBar"`. Khi user nhấn "Go", FPM tự build OData query với `$filter` và refresh table — không cần code controller.

---

## 8. Tổng Kết

| Thành phần | Công nghệ | Lý do |
|---|---|---|
| **FilterBar** | `macros:FilterBar` | FPM building block, tự render từ `UI.SelectionFields` |
| **Bảng danh sách** | `macros:Table` | FPM building block, hỗ trợ drill-down + file download |
| **Download file** | `@Semantics.largeObject` (OData V4 streaming) | Framework tự xử lý, không cần code frontend |
| **Object Page** | `sap.fe.templates.ObjectPage` | Template chuẩn, không cần code thêm |
| **Controller** | Không thay đổi | Module đủ đơn giản để FPM xử lý hoàn toàn |

**Luồng hoạt động hoàn chỉnh:**

```
User mở tab "My Exports (Files)"
    → macros:FilterBar hiện 3 filter: FileName / CreatedBy / CreatedAt
    → macros:Table tự load dữ liệu từ OData GET /DrsFile
    → Hiển thị danh sách file với cột Download (FileContent → nút tải)

User nhấn "Go" trên FilterBar (sau khi nhập điều kiện)
    → FPM tự build: GET /DrsFile?$filter=FileName eq '...' &$select=...
    → Table tự cập nhật — không cần code controller

User click nút Download trên cột FileContent
    → Browser gửi: GET /DrsFile(guid'...')/FileContent/$value
    → OData V4 stream trả về binary content
    → Browser tải file về với tên FileName và MIME type tương ứng

User click vào một dòng trên Table
    → FPM navigation → DrsFileObjectPage
    → Object Page hiển thị 2 panel: File Details + Administrative Data
    → Panel File Details vẫn có nút Download để tải file
```

**Các file đã thay đổi:**

| File | Thay đổi |
|---|---|
| `annotation.xml` | Thêm block `DrsFileType`: LineItem, SelectionFields, HeaderInfo, Facets, FieldGroups |
| `manifest.json` | Thêm Route `DrsFileObjectPage`, Target, Navigation linking |
| `Main.view.xml` | Thay `<Title>` placeholder bằng `macros:FilterBar` + `macros:Table` thực sự |
| `Main.controller.js` | **Không thay đổi** |
