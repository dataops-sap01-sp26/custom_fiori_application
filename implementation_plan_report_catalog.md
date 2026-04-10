# Implementation Plan: Report Catalog Migration to FPM

## 1. Overview

Migrate the Report Catalog functionality from freestyle `drs_admin` to FPM `custom_fiori_application`.

### Current State (drs_admin)
- **Pattern**: GenericTile grouped by ModuleId (GL, AR, AP)
- **JS Lines**: ~250 lines for tile rendering + grouping logic
- **Flow**: Catalog → ReportDetail → ReportPreview

### Target State (FPM)
- **Pattern**: Table with native grouping + FilterBar
- **JS Lines**: ~50 lines (action handlers only)
- **Flow**: Catalog → ReportCatalogObjectPage (optional) → Report Preview routes

---

## 2. Entity Architecture

### ReportCatalogType (OData V4)
```
Keys: ReportId (String 10), IsActiveEntity (Boolean)
```

| Property | Type | Description |
|----------|------|-------------|
| ReportId | String(10) | "GL-01", "AR-01", etc. |
| ModuleId | String(2) | GL, AR, AP, CO, FI |
| ReportName | String(50) | Display name |
| Description | String(255) | Short description |
| LongText | String | Detailed info (nullable) |
| CdsViewName | String(30) | Backend CDS view name |
| ReportClass | String(30) | Implementation class |
| IsActive | Boolean | Active/Inactive status |
| SortOrder | Int32 | Display order within module |
| StatusCriticality | Byte | 0=neutral, 1=error, 2=warning, 3=success |
| CreatedBy | String(12) | Creator username |
| CreatedAt | DateTimeOffset | Creation timestamp |
| LastChangedBy | String(12) | Last modifier |
| LastChangedAt | DateTimeOffset | Last change timestamp |

### Available Actions

| Action | Purpose | OperationControl |
|--------|---------|------------------|
| `activateReport` | Enable report for use | `__OperationControl/activateReport` |
| `deactivateReport` | Disable report | `__OperationControl/deactivateReport` |
| `copyReport` | Duplicate report config | `__OperationControl/copyReport` |
| `previewReport` | Show live data preview | `__OperationControl/previewReport` |
| `Edit` | Enter draft edit mode | `__OperationControl/Edit` |

---

## 3. Business Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    REPORT CATALOG LIST                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Filters: [Module ▼] [Report ID ___] [Active ○ All]        │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │       [ Preview ]  [ Create Subscription ]                 │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ Report ID │ Report Name       │ Module │ Active │ CDS     │  │
│  ├───────────┼───────────────────┼────────┼────────┼─────────┤  │
│  │ GL-01     │ G/L Account Bal.  │ GL     │ ●Yes   │ ZI_GL01 │  │
│  │ AR-01     │ Customer Open     │ AR     │ ●Yes   │ ZI_AR01 │  │
│  │ AR-02     │ Customer Balances │ AR     │ ●Yes   │ ZI_AR02 │  │
│  │ AR-03     │ AR Aging Report   │ AR     │ ●Yes   │ ZI_AR03 │  │
│  │ AP-01     │ Vendor Open Items │ AP     │ ●Yes   │ ZI_AP01 │  │
│  │ AP-02     │ Vendor Balances   │ AP     │ ●Yes   │ ZI_AP02 │  │
│  │ AP-03     │ AP Aging Report   │ AP     │ ●Yes   │ ZI_AP03 │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
    [Row Click]         [Preview]          [Create Subscr]
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ ReportCatalog   │  │ Report Preview  │  │ Create Subscr   │
│ ObjectPage      │  │ (GL01, AR01...) │  │ Dialog          │
│ (optional)      │  │ Entity Routes   │  │ with ReportId   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Key User Actions

1. **View Catalog**: See all reports in a table, filter by Module/Status
2. **Preview Report**: Navigate to report-specific entity (GL01, AR01, etc.) to see live data
3. **Create Subscription**: Open dialog with ReportId pre-filled → create subscription
4. **Row Navigation** (optional): Click row → ReportCatalog ObjectPage with details

---

## 4. Implementation Tasks

### 4.1 Annotations (annotation.xml)

Add `ReportCatalogType` annotations:

```xml
<!-- Report Catalog Annotations -->
<Annotations Target="SAP__self.ReportCatalogType">
    
    <!-- Header Info -->
    <Annotation Term="UI.HeaderInfo">
        <Record Type="UI.HeaderInfoType">
            <PropertyValue Property="TypeName" String="Report"/>
            <PropertyValue Property="TypeNamePlural" String="Reports"/>
            <PropertyValue Property="Title">
                <Record Type="UI.DataField">
                    <PropertyValue Property="Value" Path="ReportName"/>
                </Record>
            </PropertyValue>
            <PropertyValue Property="Description">
                <Record Type="UI.DataField">
                    <PropertyValue Property="Value" Path="ReportId"/>
                </Record>
            </PropertyValue>
        </Record>
    </Annotation>
    
    <!-- Selection Fields for FilterBar -->
    <Annotation Term="UI.SelectionFields">
        <Collection>
            <PropertyPath>ModuleId</PropertyPath>
            <PropertyPath>ReportId</PropertyPath>
            <PropertyPath>IsActive</PropertyPath>
        </Collection>
    </Annotation>
    
    <!-- Line Item for Table -->
    <Annotation Term="UI.LineItem">
        <Collection>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="ReportId"/>
                <PropertyValue Property="Label" String="Report ID"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="ReportName"/>
                <PropertyValue Property="Label" String="Report Name"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="ModuleId"/>
                <PropertyValue Property="Label" String="Module"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="Description"/>
                <PropertyValue Property="Label" String="Description"/>
            </Record>
            <Record Type="UI.DataFieldWithCriticality">
                <PropertyValue Property="Value" Path="IsActive"/>
                <PropertyValue Property="Label" String="Active"/>
                <PropertyValue Property="Criticality" Path="StatusCriticality"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="CdsViewName"/>
                <PropertyValue Property="Label" String="CDS View"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="SortOrder"/>
                <PropertyValue Property="Label" String="Sort Order"/>
            </Record>
        </Collection>
    </Annotation>
    
    <!-- Facets for Object Page (if needed) -->
    <Annotation Term="UI.Facets">
        <Collection>
            <Record Type="UI.ReferenceFacet">
                <PropertyValue Property="ID" String="GeneralInfo"/>
                <PropertyValue Property="Label" String="General Information"/>
                <PropertyValue Property="Target" AnnotationPath="@UI.FieldGroup#General"/>
            </Record>
            <Record Type="UI.ReferenceFacet">
                <PropertyValue Property="ID" String="TechnicalInfo"/>
                <PropertyValue Property="Label" String="Technical Details"/>
                <PropertyValue Property="Target" AnnotationPath="@UI.FieldGroup#Technical"/>
            </Record>
        </Collection>
    </Annotation>
    
    <Annotation Term="UI.FieldGroup" Qualifier="General">
        <Record Type="UI.FieldGroupType">
            <PropertyValue Property="Data">
                <Collection>
                    <Record Type="UI.DataField">
                        <PropertyValue Property="Value" Path="ReportId"/>
                    </Record>
                    <Record Type="UI.DataField">
                        <PropertyValue Property="Value" Path="ReportName"/>
                    </Record>
                    <Record Type="UI.DataField">
                        <PropertyValue Property="Value" Path="ModuleId"/>
                    </Record>
                    <Record Type="UI.DataField">
                        <PropertyValue Property="Value" Path="Description"/>
                    </Record>
                    <Record Type="UI.DataField">
                        <PropertyValue Property="Value" Path="IsActive"/>
                    </Record>
                </Collection>
            </PropertyValue>
        </Record>
    </Annotation>
    
    <Annotation Term="UI.FieldGroup" Qualifier="Technical">
        <Record Type="UI.FieldGroupType">
            <PropertyValue Property="Data">
                <Collection>
                    <Record Type="UI.DataField">
                        <PropertyValue Property="Value" Path="CdsViewName"/>
                    </Record>
                    <Record Type="UI.DataField">
                        <PropertyValue Property="Value" Path="ReportClass"/>
                    </Record>
                    <Record Type="UI.DataField">
                        <PropertyValue Property="Value" Path="SortOrder"/>
                    </Record>
                    <Record Type="UI.DataField">
                        <PropertyValue Property="Value" Path="CreatedBy"/>
                    </Record>
                    <Record Type="UI.DataField">
                        <PropertyValue Property="Value" Path="CreatedAt"/>
                    </Record>
                    <Record Type="UI.DataField">
                        <PropertyValue Property="Value" Path="LastChangedBy"/>
                    </Record>
                    <Record Type="UI.DataField">
                        <PropertyValue Property="Value" Path="LastChangedAt"/>
                    </Record>
                </Collection>
            </PropertyValue>
        </Record>
    </Annotation>
    
</Annotations>
```

### 4.2 Main.view.xml Update

Replace placeholder with FilterBar + Table:

```xml
<!-- ── REPORT CATALOG TAB ── -->
<ScrollContainer id="catalog" horizontal="false" vertical="true" height="100%">
    <macros:FilterBar
        id="catalogFilterBar"
        metaPath="/ReportCatalog/@com.sap.vocabularies.UI.v1.SelectionFields"
        liveMode="false"/>
    <macros:Table
        id="catalogTable"
        metaPath="/ReportCatalog/@com.sap.vocabularies.UI.v1.LineItem"
        readOnly="true"
        enableExport="true"
        enableAutoColumnWidth="true"
        variantManagement="Control"
        p13nMode="Column,Sort,Filter,Group"
        headerText="Report Catalog"
        filterBar="catalogFilterBar"
        growingThreshold="20">
        <macros:actions>
            <macros:Action key="preview" text="Preview Report" 
                press=".onPreviewReport" requiresSelection="true" />
            <macros:Action key="createSubscr" text="Create Subscription" 
                press=".onCreateSubscriptionFromCatalog" requiresSelection="true" />
        </macros:actions>
    </macros:Table>
</ScrollContainer>
```

### 4.3 Routing Configuration (manifest.json)

Add route for ReportCatalog ObjectPage (optional, for detail view):

```json
{
  "routes": [
    {
      "name": "ReportCatalogObjectPage",
      "pattern": "ReportCatalog({key}):?query:",
      "target": "ReportCatalogObjectPage"
    }
  ],
  "targets": {
    "ReportCatalogObjectPage": {
      "type": "Component",
      "id": "ReportCatalogObjectPage",
      "name": "sap.fe.templates.ObjectPage",
      "options": {
        "settings": {
          "contextPath": "/ReportCatalog"
        }
      }
    }
  }
}
```

Add navigation config to DashboardMainPage target:

```json
"navigation": {
    "ReportCatalog": {
        "detail": {
            "route": "ReportCatalogObjectPage"
        }
    }
}
```

### 4.4 Controller Methods (Main.controller.js)

```javascript
// ═══════════════════════════════════════════════════════════════
// REPORT CATALOG ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Preview selected report - navigates to report-specific entity route
 */
onPreviewReport: function (oEvent) {
    var oTable = this.byId("catalogTable");
    var aContexts = oTable.getSelectedContexts();
    
    if (!aContexts || aContexts.length === 0) {
        MessageToast.show("Please select a report to preview");
        return;
    }
    
    var sReportId = aContexts[0].getProperty("ReportId");
    var bIsActive = aContexts[0].getProperty("IsActive");
    
    if (!bIsActive) {
        MessageToast.show("Cannot preview inactive report");
        return;
    }
    
    var oRouter = this.getAppComponent().getRouter();
    
    // Map ReportId to preview route
    var mPreviewRoutes = {
        "GL-01": { route: "report_gl01", key: "report_gl01" },
        "AR-01": { route: "report_ar01", key: "report_ar01" },
        "AR-02": { route: "report_ar02", key: "report_ar02" },
        "AR-03": { route: "report_ar03", key: "report_ar03" },
        "AP-01": { route: "report_ap01", key: "report_ap01" },
        "AP-02": { route: "report_ap02", key: "report_ap02" },
        "AP-03": { route: "report_ap03", key: "report_ap03" }
    };
    
    var oRouteConfig = mPreviewRoutes[sReportId];
    
    if (oRouteConfig) {
        // Navigate to sidebar page (uses existing menu structure)
        var oNavContainer = this.byId("pageContainer");
        oNavContainer.to(this.byId(oRouteConfig.key));
        MessageToast.show("Showing " + sReportId + " preview");
    } else {
        MessageToast.show("Preview not available for " + sReportId);
    }
},

/**
 * Create subscription with selected report pre-filled
 * Reuses existing subscription creation logic
 */
onCreateSubscriptionFromCatalog: function (oEvent) {
    var oTable = this.byId("catalogTable");
    var aContexts = oTable.getSelectedContexts();
    
    if (!aContexts || aContexts.length === 0) {
        MessageToast.show("Please select a report");
        return;
    }
    
    var sReportId = aContexts[0].getProperty("ReportId");
    var bIsActive = aContexts[0].getProperty("IsActive");
    
    if (!bIsActive) {
        MessageToast.show("Cannot create subscription for inactive report");
        return;
    }
    
    // Reuse the existing subscription creation with pre-filled ReportId
    this._createSubscriptionWithReportId(sReportId);
},

/**
 * Navigate to Report Catalog Object Page (optional)
 */
onNavigateToCatalogDetail: function (oContext) {
    var oRouter = this.getAppComponent().getRouter();
    var sReportId = oContext.getProperty("ReportId");
    var bIsActiveEntity = oContext.getProperty("IsActiveEntity");
    
    var sKey = "ReportId='" + sReportId + "',IsActiveEntity=" + bIsActiveEntity;
    
    oRouter.navTo("ReportCatalogObjectPage", {
        key: sKey
    });
}
```

---

## 5. File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `webapp/annotations/annotation.xml` | **ADD** | ~80 lines for ReportCatalogType annotations |
| `webapp/ext/view/Main.view.xml` | **REPLACE** | Replace catalog placeholder with FilterBar + Table |
| `webapp/ext/view/Main.controller.js` | **ADD** | ~60 lines for preview/create subscription handlers |
| `webapp/manifest.json` | **ADD** | Route + target for ReportCatalogObjectPage (optional) |

---

## 6. Implementation Order

1. **Annotations First** - Add ReportCatalogType annotations to annotation.xml
2. **View Update** - Replace catalog ScrollContainer content
3. **Controller Methods** - Add onPreviewReport, onCreateSubscriptionFromCatalog
4. **Routing (Optional)** - Add ObjectPage route if row-click detail view needed
5. **Test** - Verify FilterBar, Table, Preview navigation, Create Subscription

---

## 7. Preview Navigation Strategy

Since report preview routes already exist for GL01, AR01, etc., we have two options:

### Option A: Use Sidebar Navigation (Simpler)
- Preview action switches to the corresponding sidebar page (report_gl01, etc.)
- User sees the report table with all filters
- **Pros**: No new routes needed
- **Cons**: Loses catalog context

### Option B: Navigate to Entity Object Page (Better UX)
- Navigate to `/GL01_GLAccountBalances` entity list with filters
- Uses existing routes like `GL01ObjectPage`
- **Pros**: Standard FPM navigation
- **Cons**: Need to handle filter parameters

**Recommendation**: Start with Option A for MVP, enhance to Option B later.

---

## 8. Comparison: Before vs After

| Aspect | drs_admin (Freestyle) | custom_fiori_application (FPM) |
|--------|----------------------|-------------------------------|
| **List View** | GenericTile (grouped) | macros:Table (grouped) |
| **Grouping** | Manual JS (MODULE_GROUPS) | Native table grouping by ModuleId |
| **Search** | Client-side filter | Server-side OData $filter |
| **Rendering** | Dynamic tile creation | Annotation-driven |
| **Actions** | Custom button handlers | macros:Action |
| **JS Lines** | ~250 | ~60 |
| **Maintenance** | Complex | Simple |

---

## 9. Edge Cases

| Scenario | Handling |
|----------|----------|
| No reports in catalog | Show empty table with "No data" message |
| Inactive report selected | Show toast, disable Preview action |
| Report without preview | Show toast "Preview not available" |
| Create subscription for non-GL report | Show warning about limited param support |

---

## 10. Testing Checklist

- [ ] FilterBar renders with ModuleId, ReportId, IsActive filters
- [ ] Table shows all reports with correct columns
- [ ] IsActive column shows criticality badge (green for active)
- [ ] Grouping by ModuleId works when enabled
- [ ] Preview action navigates to correct report page
- [ ] Create Subscription opens dialog with ReportId pre-filled
- [ ] Inactive reports cannot be previewed or subscribed
- [ ] Export to Excel works
- [ ] Variant management saves column/filter preferences

---

## Appendix: Module Mapping

| ModuleId | Full Name | Icon | Reports |
|----------|-----------|------|---------|
| GL | FI-GL — General Ledger | sap-icon://loan | GL-01 |
| AR | FI-AR — Accounts Receivable | sap-icon://customer | AR-01, AR-02, AR-03 |
| AP | FI-AP — Accounts Payable | sap-icon://supplier | AP-01, AP-02, AP-03 |
| CO | CO — Controlling | sap-icon://pie-chart | (future) |
| FI | FI — Finance | sap-icon://money-bills | (future) |
