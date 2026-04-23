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
| `MimeType` | CHAR 128 | Kiểu MIME (vd: `application/pdf`) | ✓ (Object Page / ẩn list theo metadata) |
| `FileSize` | INT4 | Kích thước file (bytes, raw) | Ẩn |
| `FileSizeDisplay` | CHAR 20 | Kích thước đã format (vd: `1.2 MB`) | ✓ Hiển thị |
| `CreatedBy` | SYUNAME | Người tạo file | ✓ Hiển thị |
| `CreatedAt` | TIMESTAMPL | Thời điểm tạo file | ✓ Hiển thị |
| `FileCreationDate` | DATS | Ngày job (suy ra từ `created_at` trên `ZI_DRS_FILE`) | ✓ List / filter / Admin facet |

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
| `UI.LineItem` | **Có** ✓ | **Có** ✓ | Local thêm cột **`FileCreationDate`** (bổ sung so với lineItem backend) |
| `UI.Facets` | **Có** ✓ | **Có** ✓ | Định nghĩa lại local cho nhất quán |
| `UI.FieldGroup` | **Có** ✓ | **Có** ✓ | Local **AdminData** thêm **`FileCreationDate`** |
| `UI.SelectionFields` | **Có** ✓ (`FileCreationDate` position 10, …) | **Có** ✓ | Local đặt **`FileCreationDate` đầu tiên** trong FilterBar |

> **Tại sao define lại những annotation backend đã có?** Hai lý do: (1) Local annotation **override** backend annotation — giúp kiểm soát chính xác những gì hiển thị trong dashboard mà không phụ thuộc vào thay đổi từ backend. (2) Nhất quán với cách tiếp cận của các module khác trong dự án (`DrsJobConfig`, `JobHistoryAnalytics`) — tất cả đều define đầy đủ annotation local.

> **Cập nhật CDS:** `ZI_DRS_FILE` bổ sung **`FileCreationDate`** (suy ra từ `created_at`) và association **`_JobHistory`**; `ZC_DRS_FILE` expose `FileCreationDate` và redirect `_JobHistory`. Metadata extension gắn **`FileCreationDate`** vào **selectionField**; Fiori local thêm **`FileCreationDate`** vào **LineItem** và **FieldGroup#AdminData** để list/Object Page đồng bộ.

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

Trong mục `DashboardMainPage`, bổ sung (vẫn hữu ích nếu sau này nhúng lại `DrsFile` trong FPM page):

```json
"DrsFile": {
  "detail": {
    "route": "DrsFileObjectPage"
  }
}
```

> **Tại sao cần khai báo Navigation này?** FPM cần biết: khi user click vào một dòng trên `macros:Table` của entity `DrsFile`, thì sẽ navigate sang route nào. Navigation được khai báo trong `DashboardMainPage.options.settings.navigation` để FPM tự xử lý drill-down.

### 4.4 Danh sách file — triển khai hiện tại (macros embedded)

Tab "My Exports" được nhúng trực tiếp trong `Main.view.xml` với `ScrollContainer id="exports"`, `macros:FilterBar` và `macros:Table` — giống pattern của tất cả các tab khác trong project.

Không có route `ExportsListPage` trong `manifest.json`. Điều hướng từ sidebar và quick action đều dùng `NavContainer.to(this.byId("exports"))`.

---

## 5. Giao diện (`Main.view.xml`) — trạng thái hiện tại

Tab "My Exports" có `ScrollContainer id="exports"` trong `NavContainer` chứa `macros:FilterBar` và `macros:Table` trực tiếp:

```xml
<ScrollContainer id="exports" horizontal="false" vertical="true" height="100%">
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <macros:FilterBar
            id="exportsFilterBar"
            metaPath="/DrsFile/@com.sap.vocabularies.UI.v1.SelectionFields"
            liveMode="false"/>
        <macros:Table
            id="exportsTable"
            metaPath="/DrsFile/@com.sap.vocabularies.UI.v1.PresentationVariant"
            readOnly="true"
            enableExport="true"
            enableAutoColumnWidth="true"
            variantManagement="Control"
            p13nMode="Column,Sort,Filter"
            headerText="My Exports (Files)"
            filterBar="exportsFilterBar"
            growingThreshold="20">
        </macros:Table>
    </VBox>
</ScrollContainer>
```

### 5.1 UX

User chọn "My Exports" trên sidebar → `NavContainer.to(byId("exports"))` → hiển thị FilterBar + Table trong cùng ToolPage. Click vào dòng → FPM navigate sang `DrsFileObjectPage`. Download `FileContent` qua `@Semantics.largeObject` không đổi.

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
        <PropertyPath>FileCreationDate</PropertyPath>
        <PropertyPath>FileName</PropertyPath>
        <PropertyPath>CreatedBy</PropertyPath>
        <PropertyPath>CreatedAt</PropertyPath>
    </Collection>
</Annotation>
```

> **Filter fields:** (1) `FileCreationDate` — lọc theo **ngày job** (backend: cast từ `created_at` trên `ZI_DRS_FILE`); (2) `FileName`; (3) `CreatedBy`; (4) `CreatedAt` — khoảng thời gian tạo file. `MimeType` / `FileSizeDisplay` không đưa vào FilterBar.

> **Local vs backend:** Metadata extension backend đã khai báo **`selectionField`** cho `FileCreationDate` (và các field khác). File `annotation.xml` local **override** để đồng bộ List Report với **LineItem** và **FieldGroup#AdminData** (có `FileCreationDate`).

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
- `FileCreationDate`: Ngày job (gắn với lịch báo cáo)
- `CreatedBy`: Ai tạo file
- `CreatedAt`: Khi nào tạo file

> **Tại sao tách 2 panel?** Nhóm logic: thông tin về bản thân file (nội dung, kích thước, định dạng) để riêng — thông tin hành chính (ai tạo, khi nào) để riêng. Đây là chuẩn UX của Fiori Object Page, tương tự các entity khác trong dự án.

---

## 7. Controller (`Main.controller.js`, `DashboardController.js`)

**Không có thay đổi đặc biệt** cho module My Exports — `macros:Table` và `macros:FilterBar` tự bắt đầu OData binding. Điều hướng qua `NavContainer.to(this.byId("exports"))` (xử lý tự động trong `Main.controller.js` qua `onItemSelect`).

Không cần handler riêng cho filter/table. Download và Object Page do OData V4 + Fiori Elements xử lý.

---

## 8. Tổng Kết

| Thành phần | Công nghệ | Lý do |
|---|---|---|
| **Danh sách file** | `macros:Table` (nhúng trong `ScrollContainer id="exports"`) | Nhất quán với tất cả các tab khác trong project |
| **Filter** | `macros:FilterBar` (nhúng cùng `ScrollContainer`) | OData binding tự động từ `UI.SelectionFields` |
| **Download file** | `@Semantics.largeObject` (OData V4 streaming) | Framework tự xử lý |
| **Object Page** | `sap.fe.templates.ObjectPage` | Không đổi |
| **Điều hướng** | `NavContainer.to(byId("exports"))` qua `onItemSelect` | Giống mọi tab khác |

**Luồng hoạt động hoàn chỉnh:**

```
User chọn "My Exports (Files)" trên sidebar (hoặc quick action)
    → NavContainer.to(byId("exports"))
    → macros:FilterBar + macros:Table hiển thị ngay trong ToolPage
    → FilterBar: FileCreationDate / FileName / CreatedBy / CreatedAt
    → Table GET /DrsFile — cột FileContent → download (Semantics.largeObject)

User nhấn "Go" trên FilterBar
    → macros:FilterBar tự build OData $filter — không cần code controller

User click một dòng
    → FPM navigate sang DrsFileObjectPage (qua navigation config trong manifest.json)
```

**Các file đã thay đổi:**

| File | Thay đổi |
|---|---|
| `annotation.xml` | Block `DrsFileType`: LineItem (**+ FileCreationDate**), SelectionFields (**FileCreationDate** đầu tiên), HeaderInfo, Facets, FieldGroups (**AdminData + FileCreationDate**) |
| `manifest.json` | Route + target `DrsFileObjectPage` + Navigation trong `DashboardMainPage` |
| `Main.view.xml` | `ScrollContainer id="exports"` + `macros:FilterBar` + `macros:Table` |

