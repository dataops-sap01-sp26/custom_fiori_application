# Implementation Plan: Sidebar Navigation & Back Button Fix

## 1. Problem Summary

When users click **"My Exports (Files)"** or any **Report (AP01–GL01)** in the sidebar menu, the navigation uses `router.navTo()` which **exits the ToolPage entirely**, rendering a standalone `sap.fe.templates.ListReport` page. This causes:

1. **Sidebar disappears** — the new page is a separate component outside `<tnt:ToolPage>`
2. **No back button** — ObjectPage targets don't have parent-child route hierarchy
3. **Inconsistent UX** — Dashboard, Subscriptions, Job Configs, History keep the sidebar; Exports and Reports do not

### Current Navigation Architecture

```
┌─ ToolPage (Main.view.xml) ──────────────────────────────┐
│  Sidebar  │  NavContainer                                │
│  ------   │  ┌─ dashboard ─┐                             │
│  Home     │  │ KPI tiles   │                             │
│  Catalog  │  ├─ catalog ───┤  ← NavContainer.to()       │
│  Subscr   │  ├─ subscr ────┤  ← keeps sidebar ✓         │
│  JobCfg   │  ├─ jobconfigs ┤                             │
│  History  │  ├─ history ───┤                             │
│  ------   │  └─────────────┘                             │
│  Exports  │  ──── router.navTo() ──→ ExportsListPage     │← EXITS ToolPage ✗
│  AP01..   │  ──── router.navTo() ──→ AP01ListPage..      │← EXITS ToolPage ✗
└──────────────────────────────────────────────────────────┘
```

### Target Architecture (After Fix)

```
┌─ ToolPage (Main.view.xml) ──────────────────────────────┐
│  Sidebar  │  NavContainer                                │
│  ------   │  ┌─ dashboard ──┐                            │
│  Home     │  ├─ catalog ────┤                            │
│  Catalog  │  ├─ subscr ─────┤                            │
│  Subscr   │  ├─ jobconfigs ─┤  ← NavContainer.to()      │
│  JobCfg   │  ├─ history ────┤  ← keeps sidebar ✓        │
│  History  │  ├─ exports ────┤  ← NEW: macros:Table       │
│  ------   │  ├─ report_ap01 ┤  ← NEW: macros:Table       │
│  Exports  │  ├─ ... ────────┤                            │
│  AP01..   │  ├─ report_gl01 ┤                            │
│  GL01     │  └──────────────┘                            │
└──────────────────────────────────────────────────────────┘
                    │ row click
                    ▼
          router.navTo() → ObjectPage (standalone, with shell back button)
```

---

## 2. Scope of Changes

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `webapp/ext/view/Main.view.xml` | **MODIFY** | Add 8 new `<ScrollContainer>` pages inside NavContainer for exports + 7 reports |
| 2 | `webapp/ext/view/Main.controller.js` | **MODIFY** | Remove exports/reports from `mReportRoutes`, let `pageContainer.to()` handle them |
| 3 | `webapp/ext/controller/DashboardController.js` | **MODIFY** | Same change in `navigateToPage()` |
| 4 | `webapp/manifest.json` | **MODIFY** | Remove standalone ListReport routes/targets for exports + reports; keep ObjectPage routes |
| 5 | `webapp/annotations/annotation.xml` | **MODIFY** | Add `UI.LineItem` + `UI.SelectionFields` for report entities (AP01–GL01) if not already in metadata |

**No new files needed.** Existing patterns (`macros:FilterBar` + `macros:Table`) are reused.

---

## 3. Implementation Steps

### Step 1: Add Exports Page to NavContainer in Main.view.xml

Insert a new `<ScrollContainer>` for exports **before** the settings placeholder, using the same pattern as subscriptions/jobconfigs.

**Location:** After the `</ScrollContainer>` for `id="history"` and before the comment `<!-- exports / report_ap01..gl01 →`

```xml
<!-- ── MY EXPORTS (FILES) TAB ── -->
<ScrollContainer id="exports" horizontal="false" vertical="true" height="100%">
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <macros:FilterBar
            id="exportsFilterBar"
            metaPath="/DrsFile/@com.sap.vocabularies.UI.v1.SelectionFields"
            liveMode="false"/>
        <macros:Table
            id="exportsTable"
            metaPath="/DrsFile/@com.sap.vocabularies.UI.v1.LineItem"
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

> **Note:** No `<macros:actions>` needed — exports are read-only (no Create/Delete). Row click navigation to `DrsFileObjectPage` is handled by manifest's `DashboardMainPage.navigation.DrsFile.detail.route`.

---

### Step 2: Add 7 Report Pages to NavContainer in Main.view.xml

Add one `<ScrollContainer>` per report. Reports are read-only data views (no Create/Delete actions).

```xml
<!-- ── REPORT AP-01: Vendor Open Items ── -->
<ScrollContainer id="report_ap01" horizontal="false" vertical="true" height="100%">
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <macros:Table
            id="reportAP01Table"
            metaPath="/AP01_VendorOpenItems/@com.sap.vocabularies.UI.v1.LineItem"
            readOnly="true"
            enableExport="true"
            enableAutoColumnWidth="true"
            variantManagement="Control"
            p13nMode="Column,Sort,Filter"
            headerText="AP-01: Vendor Open Items"
            growingThreshold="20">
        </macros:Table>
    </VBox>
</ScrollContainer>

<!-- ── REPORT AP-02: Vendor Balances ── -->
<ScrollContainer id="report_ap02" horizontal="false" vertical="true" height="100%">
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <macros:Table
            id="reportAP02Table"
            metaPath="/AP02_VendorBalances/@com.sap.vocabularies.UI.v1.LineItem"
            readOnly="true"
            enableExport="true"
            enableAutoColumnWidth="true"
            variantManagement="Control"
            p13nMode="Column,Sort,Filter"
            headerText="AP-02: Vendor Balances"
            growingThreshold="20">
        </macros:Table>
    </VBox>
</ScrollContainer>

<!-- ── REPORT AP-03: AP Aging Report ── -->
<ScrollContainer id="report_ap03" horizontal="false" vertical="true" height="100%">
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <macros:Table
            id="reportAP03Table"
            metaPath="/AP03_APAgingReport/@com.sap.vocabularies.UI.v1.LineItem"
            readOnly="true"
            enableExport="true"
            enableAutoColumnWidth="true"
            variantManagement="Control"
            p13nMode="Column,Sort,Filter"
            headerText="AP-03: AP Aging Report"
            growingThreshold="20">
        </macros:Table>
    </VBox>
</ScrollContainer>

<!-- ── REPORT AR-01: Customer Open Items ── -->
<ScrollContainer id="report_ar01" horizontal="false" vertical="true" height="100%">
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <macros:Table
            id="reportAR01Table"
            metaPath="/AR01_CustomerOpenItems/@com.sap.vocabularies.UI.v1.LineItem"
            readOnly="true"
            enableExport="true"
            enableAutoColumnWidth="true"
            variantManagement="Control"
            p13nMode="Column,Sort,Filter"
            headerText="AR-01: Customer Open Items"
            growingThreshold="20">
        </macros:Table>
    </VBox>
</ScrollContainer>

<!-- ── REPORT AR-02: Customer Balances ── -->
<ScrollContainer id="report_ar02" horizontal="false" vertical="true" height="100%">
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <macros:Table
            id="reportAR02Table"
            metaPath="/AR02_CustomerBalances/@com.sap.vocabularies.UI.v1.LineItem"
            readOnly="true"
            enableExport="true"
            enableAutoColumnWidth="true"
            variantManagement="Control"
            p13nMode="Column,Sort,Filter"
            headerText="AR-02: Customer Balances"
            growingThreshold="20">
        </macros:Table>
    </VBox>
</ScrollContainer>

<!-- ── REPORT AR-03: AR Aging Report ── -->
<ScrollContainer id="report_ar03" horizontal="false" vertical="true" height="100%">
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <macros:Table
            id="reportAR03Table"
            metaPath="/AR03_ARAgingReport/@com.sap.vocabularies.UI.v1.LineItem"
            readOnly="true"
            enableExport="true"
            enableAutoColumnWidth="true"
            variantManagement="Control"
            p13nMode="Column,Sort,Filter"
            headerText="AR-03: AR Aging Report"
            growingThreshold="20">
        </macros:Table>
    </VBox>
</ScrollContainer>

<!-- ── REPORT GL-01: GL Account Balances ── -->
<ScrollContainer id="report_gl01" horizontal="false" vertical="true" height="100%">
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <macros:Table
            id="reportGL01Table"
            metaPath="/GL01_GLAccountBalances/@com.sap.vocabularies.UI.v1.LineItem"
            readOnly="true"
            enableExport="true"
            enableAutoColumnWidth="true"
            variantManagement="Control"
            p13nMode="Column,Sort,Filter"
            headerText="GL-01: GL Account Balances"
            growingThreshold="20">
        </macros:Table>
    </VBox>
</ScrollContainer>
```

**Remove the old comment:**
```diff
-                    <!-- exports / report_ap01..gl01 → navigated via router.navTo() → sap.fe.templates.ListReport targets -->
```

---

### Step 3: Update Main.controller.js — Remove router.navTo() for exports/reports

**File:** `webapp/ext/view/Main.controller.js`

In `onItemSelect()`, remove the `mReportRoutes` block entirely. All pages will now use `NavContainer.to()`.

**Before:**
```javascript
onItemSelect: function (oEvent) {
    var oItem = oEvent.getParameter("item");
    var sKey = oItem.getKey();
    if (!sKey) { return; }

    var mReportRoutes = {
        "exports":     "ExportsListPage",
        "report_ap01": "AP01ListPage",
        // ... 7 more routes
    };

    if (mReportRoutes[sKey]) {
        this.getAppComponent().getRouter().navTo(mReportRoutes[sKey]);
        return;
    }

    this.byId("pageContainer").to(this.byId(sKey));
    // ...
},
```

**After:**
```javascript
onItemSelect: function (oEvent) {
    var oItem = oEvent.getParameter("item");
    var sKey = oItem.getKey();
    if (!sKey) { return; }

    // All pages are now inside NavContainer — no router.navTo() needed
    this.byId("pageContainer").to(this.byId(sKey));

    // Load data based on target page
    if (sKey === "dashboard") {
        this._dashboardController.loadDashboardData(this);
    } else if (sKey === "history") {
        this._jobHistoryController.loadChartData(this);
    } else if (sKey === "catalog") {
        this._catalogController.initCatalog(this);
    }
},
```

---

### Step 4: Update DashboardController.js — Same change in navigateToPage()

**File:** `webapp/ext/controller/DashboardController.js`

**Before (line ~264):**
```javascript
navigateToPage: function (oController, sKey) {
    var mReportRoutes = {
        "exports":     "ExportsListPage",
        "report_ap01": "AP01ListPage",
        // ...
    };

    if (mReportRoutes[sKey]) {
        oController.getAppComponent().getRouter().navTo(mReportRoutes[sKey]);
        return;
    }

    var oNavContainer = oController.byId("pageContainer");
    // ...
},
```

**After:**
```javascript
navigateToPage: function (oController, sKey) {
    // All pages now use NavContainer — no router.navTo() needed
    var oNavContainer = oController.byId("pageContainer");
    var oPage = oController.byId(sKey);

    if (oPage) {
        oNavContainer.to(oPage);

        var oSideNav = oController.byId("sideNavigation");
        if (oSideNav) {
            oSideNav.setSelectedKey(sKey);
        }
    }
},
```

---

### Step 5: Update manifest.json — Clean Up Routing

**Remove** the standalone ListReport routes and targets that are no longer used: `ExportsListPage`, `AP01ListPage` through `GL01ListPage`.

**Keep** the ObjectPage routes and targets — they're still needed for row-click navigation (detail view).

**Routes to remove:**
```json
{ "name": "ExportsListPage", "pattern": "DrsFile:?query:",                   "target": "ExportsListPage" },
{ "name": "AP01ListPage",    "pattern": "AP01_VendorOpenItems:?query:",       "target": "AP01ListPage" },
{ "name": "AP02ListPage",    "pattern": "AP02_VendorBalances:?query:",        "target": "AP02ListPage" },
{ "name": "AP03ListPage",    "pattern": "AP03_APAgingReport:?query:",         "target": "AP03ListPage" },
{ "name": "AR01ListPage",    "pattern": "AR01_CustomerOpenItems:?query:",     "target": "AR01ListPage" },
{ "name": "AR02ListPage",    "pattern": "AR02_CustomerBalances:?query:",      "target": "AR02ListPage" },
{ "name": "AR03ListPage",    "pattern": "AR03_ARAgingReport:?query:",         "target": "AR03ListPage" },
{ "name": "GL01ListPage",    "pattern": "GL01_GLAccountBalances:?query:",     "target": "GL01ListPage" }
```

**Targets to remove:**
```json
"ExportsListPage": { ... },
"AP01ListPage": { ... },
"AP02ListPage": { ... },
"AP03ListPage": { ... },
"AR01ListPage": { ... },
"AR02ListPage": { ... },
"AR03ListPage": { ... },
"GL01ListPage": { ... }
```

**Targets to KEEP** (ObjectPages for row-click detail view):
```
DrsFileObjectPage, DrsJobConfigObjectPage, JobHistoryObjectPage,
DrsSubscriptionObjectPage, GL01ObjectPage, AR01ObjectPage, AR02ObjectPage,
AR03ObjectPage, AP01ObjectPage, AP02ObjectPage, AP03ObjectPage
```

**Ensure DashboardMainPage navigation includes ALL report entities** for row-click → ObjectPage navigation:

```json
"DashboardMainPage": {
  "options": {
    "settings": {
      "navigation": {
        "DrsJobConfig":           { "detail": { "route": "DrsJobConfigObjectPage" } },
        "JobHistoryAnalytics":    { "detail": { "route": "JobHistoryObjectPage" } },
        "DrsFile":                { "detail": { "route": "DrsFileObjectPage" } },
        "DrsSubscription":        { "detail": { "route": "DrsSubscriptionObjectPage" } },
        "AP01_VendorOpenItems":   { "detail": { "route": "AP01ObjectPage" } },
        "AP02_VendorBalances":    { "detail": { "route": "AP02ObjectPage" } },
        "AP03_APAgingReport":     { "detail": { "route": "AP03ObjectPage" } },
        "AR01_CustomerOpenItems": { "detail": { "route": "AR01ObjectPage" } },
        "AR02_CustomerBalances":  { "detail": { "route": "AR02ObjectPage" } },
        "AR03_ARAgingReport":     { "detail": { "route": "AR03ObjectPage" } },
        "GL01_GLAccountBalances": { "detail": { "route": "GL01ObjectPage" } }
      }
    }
  }
}
```

> **Important:** These navigation entries enable automatic row-click → ObjectPage in `macros:Table`. Without them, clicking a row does nothing.

---

### Step 6: Verify Report Annotations Exist

The `macros:Table` with `metaPath="/AP01_VendorOpenItems/@com.sap.vocabularies.UI.v1.LineItem"` needs a valid `UI.LineItem` annotation for each report entity.

**Check if annotations exist in backend metadata:** These are already defined in `metadata.xml` via the CDS views in the backend (verified: `VendorOpenItemsType` has `UI.Facets`, `UI.HeaderInfo`, `UI.Identification`, etc.).

**If any report entity is missing `UI.LineItem`:** Add it to `webapp/annotations/annotation.xml`. Example:

```xml
<Annotations Target="com.sap.gateway.srvd.zsd_drs_main.v0001.VendorOpenItemsType">
    <Annotation Term="UI.LineItem">
        <Collection>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="Supplier"/>
                <PropertyValue Property="Label" String="Supplier"/>
            </Record>
            <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="SupplierName"/>
                <PropertyValue Property="Label" String="Supplier Name"/>
            </Record>
            <!-- ... more fields as needed ... -->
        </Collection>
    </Annotation>
</Annotations>
```

> **Note:** If the backend metadata already provides `UI.LineItem` for all 7 report entities, no local annotations are needed. Verify by checking the OData `$metadata` endpoint.

---

## 4. Navigation Flow After Fix

### Sidebar Menu Click
```
User clicks "My Exports" or "Report AP-01" in sidebar
    ↓
Main.controller.onItemSelect(sKey)
    ↓
pageContainer.to(this.byId(sKey))   ← stays inside ToolPage
    ↓
macros:Table renders with data     ← sidebar VISIBLE ✓
```

### Row Click → Detail Page
```
User clicks a row in exports or report table
    ↓
macros:Table detects click → reads manifest navigation
    ↓
manifest: DashboardMainPage.navigation.DrsFile.detail.route = "DrsFileObjectPage"
    ↓
router.navTo("DrsFileObjectPage", { FileUuid: "..." })
    ↓
ObjectPage renders (standalone) → shell back button auto-generated ✓
    ↓
User presses browser Back or shell Back → returns to DashboardMainPage
    ↓
ToolPage with sidebar restores ✓
```

---

## 5. Verification Checklist

| # | Test Case | Expected Result | Status |
|---|-----------|----------------|--------|
| 1 | Click "My Exports" in sidebar | Exports table loads, sidebar visible | ☐ |
| 2 | Click a file row in exports table | DrsFileObjectPage opens with back button | ☐ |
| 3 | Press Back from DrsFileObjectPage | Returns to dashboard with sidebar | ☐ |
| 4 | Click "Report AP-01" in sidebar | AP01 table loads, sidebar visible | ☐ |
| 5 | Click a row in AP01 report table | AP01ObjectPage opens with back button | ☐ |
| 6 | Press Back from AP01ObjectPage | Returns to dashboard with sidebar | ☐ |
| 7 | Repeat for AP02, AP03, AR01, AR02, AR03, GL01 | Same behavior | ☐ |
| 8 | Click Dashboard → Subscriptions → Exports → History | Sidebar stays visible throughout | ☐ |
| 9 | KPI tile press navigates correctly | All tiles go to correct pages with sidebar | ☐ |
| 10 | Quick action tiles navigate correctly | All actions go to correct pages with sidebar | ☐ |
| 11 | Table features: export, sort, filter, variant | All work on new embedded tables | ☐ |

---

## 6. Risk & Considerations

| Risk | Mitigation |
|------|-----------|
| **Report tables may need `UI.LineItem` annotations** | Check `$metadata` for each entity first; add local annotations only if missing |
| **Deep linking to exports/reports will break** | Old URLs like `#/DrsFile` no longer work (they were ListReport routes). If deep linking is needed, it requires additional route handling |
| **Performance: all macros:Table mount at view init** | `macros:Table` uses lazy data loading — tables only fetch data when scrolled into view via `growingThreshold`. No performance impact. |
| **ObjectPage back button behavior** | Shell back button is auto-generated by `sap.fe.templates.ObjectPage` when navigated from a route with a "parent" pattern. Verify the back targets are correct. |

---

## 7. Implementation Order

1. **Step 5 first** (manifest.json) — clean up routes/targets, add navigation entries to DashboardMainPage
2. **Step 1 + Step 2** (Main.view.xml) — add ScrollContainers for exports + 7 reports
3. **Step 3 + Step 4** (controllers) — remove `mReportRoutes` / `router.navTo()` logic
4. **Step 6** (annotations) — verify/add `UI.LineItem` for report entities
5. **Test** — verify all 11 test cases
6. **Deploy** — `npm run deploy`
