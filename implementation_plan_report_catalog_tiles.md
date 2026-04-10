# Implementation Plan: Report Catalog Tile-Based Redesign

## 1. Overview

Redesign the Report Catalog section to match the legacy `drs_admin` app's tile-based UI with grouped GenericTiles organized by SAP module.

### Current State (FPM Table)
```
catalog ScrollContainer/
├── macros:FilterBar              ← FPM filter bar
└── macros:Table                  ← Flat table rows
    ├── LineItem annotations
    ├── Actions: Preview, Create Subscription
    └── No visual grouping
```

**Problems:**
- Flat table view lacks visual hierarchy
- No module grouping (GL, AR, AP, CO, FI)
- Inconsistent with legacy app's tile-based design
- Users prefer visual tile navigation over table rows

### Target State (Tile-Based)
```
catalog ScrollContainer/
├── HBox (Toolbar)
│   ├── SearchField              ← Simple text search
│   ├── Button (Refresh)         ← Reload data
│   └── SegmentedButton          ← All/Active/Inactive filter
├── Text                          ← Report count display
└── VBox (catalogTileContainer)   ← Dynamically populated
    ├── VBox (GL Group)
    │   ├── Title "FI-GL — General Ledger"
    │   └── HBox (Tile Row)
    │       ├── GenericTile (GL-01)
    │       └── GenericTile (GL-02)
    ├── VBox (AR Group)
    │   ├── Title "FI-AR — Accounts Receivable"
    │   └── HBox (Tile Row)
    │       ├── GenericTile (AR-01)
    │       └── GenericTile (AR-02)
    └── ... more groups
```

---

## 2. Current Method Inventory

### CatalogController.js (Current ~70 lines)

| Method | Lines | Description |
|--------|-------|-------------|
| `onPreview` | 15-45 | Preview selected report via NavContainer |
| `onCreateSubscription` | 47-70 | Create subscription with selected ReportId |

### Legacy ReportCatalog.controller.js (Reference ~280 lines)

| Method | Lines | Description |
|--------|-------|-------------|
| `onInit` | 52-63 | Setup view model, attach route |
| `_loadReports` | 68-80 | Load reports via OData |
| `_applyFiltersAndRender` | 84-108 | Apply search + status filters |
| `_renderGroupedTiles` | 112-175 | Create grouped tile UI dynamically |
| `_onTilePress` | 177-183 | Navigate to report detail |
| `onSearch` | 187-190 | Handle search input |
| `onSearchLive` | 192-195 | Handle live search |
| `onFilterChange` | 197-200 | Handle filter button change |
| `onRefresh` | 202-208 | Reset and reload |

---

## 3. Target Organization

### 3.1 CatalogController.js (Enhanced)
Tile rendering with module grouping.

```javascript
// ext/controller/CatalogController.js
sap.ui.define([
    "./BaseController",
    "cfa/customfioriapplication/model/constants",
    "sap/ui/model/json/JSONModel",
    "sap/m/GenericTile",
    "sap/m/TileContent",
    "sap/m/ImageContent",
    "sap/m/Title",
    "sap/m/Text",
    "sap/m/HBox",
    "sap/m/VBox",
    "sap/m/FlexWrap"
], function (BaseController, Constants, JSONModel,
    GenericTile, TileContent, ImageContent, Title, Text, HBox, VBox, FlexWrap) {
    "use strict";

    /**
     * Module group metadata for tile grouping
     */
    var MODULE_GROUPS = {
        "GL": { 
            title: "FI-GL — General Ledger", 
            icon: "sap-icon://accounting-document-verification", 
            sort: 1 
        },
        "AR": { 
            title: "FI-AR — Accounts Receivable", 
            icon: "sap-icon://customer", 
            sort: 2 
        },
        "AP": { 
            title: "FI-AP — Accounts Payable", 
            icon: "sap-icon://supplier", 
            sort: 3 
        },
        "CO": { 
            title: "CO — Controlling", 
            icon: "sap-icon://cost-center", 
            sort: 4 
        },
        "FI": { 
            title: "FI — Finance", 
            icon: "sap-icon://accounting-document-verification", 
            sort: 5 
        }
    };

    /**
     * Resolve module key from report data
     */
    function resolveModule(oReport) {
        var sModule = oReport.ModuleId;
        if (MODULE_GROUPS[sModule] && sModule !== "FI") {
            return sModule;
        }
        var sId = oReport.ReportId || "";
        var sPrefix = sId.replace(/[-_]?\d+$/, "").toUpperCase();
        if (MODULE_GROUPS[sPrefix]) {
            return sPrefix;
        }
        return sModule || "OTHER";
    }

    return BaseController.extend("cfa.customfioriapplication.ext.controller.CatalogController", {
        
        _allReports: [],
        _sSearchQuery: "",
        _sFilterKey: "all",

        /**
         * Initialize catalog view model and load data
         */
        initCatalog: function (oController) {
            if (!oController.getModel("view")) {
                oController.setModel(new JSONModel({ reportCount: 0 }), "view");
            }
            this.loadCatalog(oController);
        },

        /**
         * Load reports from OData ReportCatalog entity
         */
        loadCatalog: function (oController) {
            var that = this;
            var oModel = oController.getModel();
            
            var oBinding = oModel.bindList("/ReportCatalog", undefined, [
                new sap.ui.model.Sorter("ModuleId", false),
                new sap.ui.model.Sorter("SortOrder", false)
            ]);
            
            oBinding.requestContexts(0, 999).then(function (aContexts) {
                var aReports = aContexts.map(function (oCtx) {
                    return oCtx.getObject();
                });
                that._allReports = aReports;
                that._applyFiltersAndRender(oController);
            }).catch(function (oError) {
                console.error("CatalogController: Failed to load reports", oError);
                that._allReports = [];
                that._applyFiltersAndRender(oController);
            });
        },

        /**
         * Apply search + status filters and render tiles
         */
        _applyFiltersAndRender: function (oController) {
            var aReports = this._allReports || [];
            var sQuery = this._sSearchQuery.toLowerCase();
            var sFilterKey = this._sFilterKey;

            // Apply search filter
            if (sQuery) {
                aReports = aReports.filter(function (r) {
                    return (r.ReportId || "").toLowerCase().indexOf(sQuery) >= 0 ||
                           (r.ReportName || "").toLowerCase().indexOf(sQuery) >= 0 ||
                           (r.Description || "").toLowerCase().indexOf(sQuery) >= 0;
                });
            }

            // Apply status filter
            if (sFilterKey === "active") {
                aReports = aReports.filter(function (r) { 
                    return r.IsActive === "X" || r.IsActive === true; 
                });
            } else if (sFilterKey === "inactive") {
                aReports = aReports.filter(function (r) { 
                    return r.IsActive !== "X" && r.IsActive !== true; 
                });
            }

            // Update count
            var oViewModel = oController.getModel("view");
            if (oViewModel) {
                oViewModel.setProperty("/reportCount", aReports.length);
            }
            
            this._renderGroupedTiles(oController, aReports);
        },

        /**
         * Render tiles grouped by module
         */
        _renderGroupedTiles: function (oController, aReports) {
            var oContainer = oController.byId("catalogTileContainer");
            if (!oContainer) {
                console.error("CatalogController: catalogTileContainer not found");
                return;
            }
            oContainer.destroyItems();

            // Group by resolved module
            var mGroups = {};
            aReports.forEach(function (r) {
                var sModule = resolveModule(r);
                if (!mGroups[sModule]) {
                    mGroups[sModule] = [];
                }
                mGroups[sModule].push(r);
            });

            // Sort groups by predefined order
            var aSortedKeys = Object.keys(mGroups).sort(function (a, b) {
                var nA = (MODULE_GROUPS[a] && MODULE_GROUPS[a].sort) || 99;
                var nB = (MODULE_GROUPS[b] && MODULE_GROUPS[b].sort) || 99;
                return nA - nB;
            });

            var that = this;

            aSortedKeys.forEach(function (sModule) {
                var oGroupMeta = MODULE_GROUPS[sModule] || { 
                    title: sModule, 
                    icon: "sap-icon://document", 
                    sort: 99 
                };
                var aGroupReports = mGroups[sModule];

                // Group header
                var oGroupTitle = new Title({
                    text: oGroupMeta.title,
                    level: "H3"
                }).addStyleClass("sapUiSmallMarginBottom drsCatalogGroupTitle");

                // Tile row
                var oTileRow = new HBox({
                    wrap: FlexWrap.Wrap
                }).addStyleClass("drsCatalogTileRow");

                aGroupReports.forEach(function (oReport) {
                    var bActive = oReport.IsActive === "X" || oReport.IsActive === true;

                    var oTile = new GenericTile({
                        header: oReport.ReportName || oReport.ReportId,
                        subheader: oReport.ReportId,
                        frameType: "OneByOne",
                        state: bActive ? "Loaded" : "Disabled",
                        press: function () {
                            that._onTilePress(oController, oReport.ReportId);
                        }
                    }).addStyleClass("sapUiTinyMarginEnd sapUiTinyMarginBottom drsCatalogTile");

                    oTile.addTileContent(new TileContent({
                        content: new ImageContent({
                            src: oGroupMeta.icon
                        })
                    }));

                    oTileRow.addItem(oTile);
                });

                // Group VBox
                var oGroupBox = new VBox({
                    items: [oGroupTitle, oTileRow]
                }).addStyleClass("sapUiMediumMarginBottom");

                oContainer.addItem(oGroupBox);
            });

            // No results message
            if (aSortedKeys.length === 0) {
                oContainer.addItem(new Text({
                    text: "No reports found matching your criteria"
                }).addStyleClass("sapUiSmallMarginTop"));
            }
        },

        /**
         * Handle tile press - navigate to report preview page
         */
        _onTilePress: function (oController, sReportId) {
            var sPageKey = Constants.REPORT_PAGE_MAP[sReportId];
            
            if (sPageKey) {
                var oNavContainer = oController.byId("pageContainer");
                var oTargetPage = oController.byId(sPageKey);
                
                if (oTargetPage) {
                    oNavContainer.to(oTargetPage);
                    this.showMessage("Showing " + sReportId + " preview");
                } else {
                    this.showMessage("Preview page not found for " + sReportId);
                }
            } else {
                this.showMessage("Preview not available for " + sReportId);
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // EVENT HANDLERS
        // ═══════════════════════════════════════════════════════════════

        /**
         * Handle search field submit
         */
        onCatalogSearch: function (oEvent, oController) {
            this._sSearchQuery = oEvent.getParameter("query") || "";
            this._applyFiltersAndRender(oController);
        },

        /**
         * Handle live search (as user types)
         */
        onCatalogSearchLive: function (oEvent, oController) {
            this._sSearchQuery = oEvent.getParameter("newValue") || "";
            this._applyFiltersAndRender(oController);
        },

        /**
         * Handle filter button change
         */
        onCatalogFilterChange: function (oEvent, oController) {
            this._sFilterKey = oEvent.getParameter("item").getKey();
            this._applyFiltersAndRender(oController);
        },

        /**
         * Handle refresh button press
         */
        onRefreshCatalog: function (oController) {
            this._sSearchQuery = "";
            this._sFilterKey = "all";
            
            var oSearchField = oController.byId("catalogSearchField");
            if (oSearchField) {
                oSearchField.setValue("");
            }
            
            var oFilterSegment = oController.byId("catalogFilterSegment");
            if (oFilterSegment) {
                oFilterSegment.setSelectedKey("all");
            }
            
            this.loadCatalog(oController);
            this.showMessage("Reports refreshed");
        },

        // ═══════════════════════════════════════════════════════════════
        // EXISTING METHODS (kept for compatibility)
        // ═══════════════════════════════════════════════════════════════
        
        /**
         * Preview selected report - kept for macros:Table compatibility
         */
        onPreview: function (oController) {
            var aContexts = this.getTableSelectedContexts(oController, "catalogTable");
            
            if (!aContexts || aContexts.length === 0) {
                this.showMessage("Please select a report to preview");
                return;
            }
            
            var sReportId = aContexts[0].getProperty("ReportId");
            var bIsActive = aContexts[0].getProperty("IsActive");
            
            if (!bIsActive) {
                this.showMessage("Cannot preview inactive report");
                return;
            }
            
            this._onTilePress(oController, sReportId);
        },
        
        /**
         * Create subscription with selected report pre-filled
         */
        onCreateSubscription: function (oController, oSubscriptionController) {
            var aContexts = this.getTableSelectedContexts(oController, "catalogTable");
            
            if (!aContexts || aContexts.length === 0) {
                this.showMessage("Please select a report");
                return;
            }
            
            var sReportId = aContexts[0].getProperty("ReportId");
            var bIsActive = aContexts[0].getProperty("IsActive");
            
            if (!bIsActive) {
                this.showMessage("Cannot create subscription for inactive report");
                return;
            }
            
            oSubscriptionController.createWithReportId(oController, sReportId);
        }
    });
});
```

### 3.2 Main.view.xml (Catalog Section Update)
Replace macros:Table with tile-based layout.

**Current (Lines ~350-380):**
```xml
<ScrollContainer id="catalog" horizontal="false" vertical="true" height="100%">
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <macros:FilterBar
            id="catalogFilterBar"
            metaPath="/ReportCatalog/@com.sap.vocabularies.UI.v1.SelectionFields"
            liveMode="false"/>
        <macros:Table
            id="catalogTable"
            metaPath="/ReportCatalog/@com.sap.vocabularies.UI.v1.LineItem"
            ...
        </macros:Table>
    </VBox>
</ScrollContainer>
```

**New:**
```xml
<ScrollContainer id="catalog" horizontal="false" vertical="true" height="100%">
    <VBox class="sapUiResponsiveMargin drsPageContent">
        <!-- Toolbar: Search + Filter -->
        <HBox id="catalogToolbar" 
              justifyContent="SpaceBetween" 
              alignItems="Center" 
              class="drsCatalogToolbar">
            <HBox alignItems="Center">
                <SearchField 
                    id="catalogSearchField"
                    placeholder="{i18n>searchReports}"
                    width="300px"
                    search=".onCatalogSearch"
                    liveChange=".onCatalogSearchLive"/>
                <Button 
                    id="catalogRefreshBtn"
                    icon="sap-icon://refresh"
                    tooltip="{i18n>refresh}"
                    press=".onRefreshCatalog"
                    class="sapUiTinyMarginBegin"/>
            </HBox>
            <SegmentedButton 
                id="catalogFilterSegment" 
                selectionChange=".onCatalogFilterChange"
                selectedKey="all">
                <items>
                    <SegmentedButtonItem id="filterAll" key="all" text="{i18n>filterAll}"/>
                    <SegmentedButtonItem id="filterActive" key="active" text="{i18n>filterActive}"/>
                    <SegmentedButtonItem id="filterInactive" key="inactive" text="{i18n>filterInactive}"/>
                </items>
            </SegmentedButton>
        </HBox>

        <!-- Report Count -->
        <Text id="catalogCountText" 
              text="{view>/reportCount} {i18n>reportsFound}" 
              class="sapUiTinyMarginBottom"/>

        <!-- Tile Container (populated dynamically) -->
        <VBox id="catalogTileContainer" class="drsCatalogContainer"/>
    </VBox>
</ScrollContainer>
```

### 3.3 Main.controller.js (Event Wiring)
Add event handlers for catalog actions.

```javascript
// Add to Main.controller.js

// ═══════════════════════════════════════════════════════════════
// CATALOG TILE HANDLERS (delegated to CatalogController)
// ═══════════════════════════════════════════════════════════════

onCatalogSearch: function (oEvent) {
    this._oCatalogController.onCatalogSearch(oEvent, this);
},

onCatalogSearchLive: function (oEvent) {
    this._oCatalogController.onCatalogSearchLive(oEvent, this);
},

onCatalogFilterChange: function (oEvent) {
    this._oCatalogController.onCatalogFilterChange(oEvent, this);
},

onRefreshCatalog: function () {
    this._oCatalogController.onRefreshCatalog(this);
}
```

**Update `_handlePageNavigation` or `onItemSelect`:**
```javascript
onItemSelect: function (oEvent) {
    var sKey = oEvent.getParameter("item").getKey();
    var oNavContainer = this.byId("pageContainer");
    var oPage = this.byId(sKey);
    
    if (oPage) {
        oNavContainer.to(oPage);
    }
    
    // Initialize catalog when navigating to it
    if (sKey === "catalog") {
        this._oCatalogController.initCatalog(this);
    }
    
    // ... existing history chart logic
}
```

### 3.4 i18n.properties Updates

```properties
# ═══════════════════════════════════════════════════════════════
# REPORT CATALOG SECTION
# ═══════════════════════════════════════════════════════════════

# Toolbar
searchReports=Search reports...
refresh=Refresh

# Filters
filterAll=All
filterActive=Active
filterInactive=Inactive

# Count & Messages
reportsFound=reports found
noReportsFound=No reports found matching your criteria
reportsRefreshed=Reports refreshed successfully
reportPreviewNotAvailable=Preview not available for this report

# Module Groups (optional - can use hardcoded)
moduleGL=FI-GL — General Ledger
moduleAR=FI-AR — Accounts Receivable
moduleAP=FI-AP — Accounts Payable
moduleCO=CO — Controlling
moduleFI=FI — Finance
moduleOther=Other Reports
```

### 3.5 CSS Styles

```css
/* ═══════════════════════════════════════════════════════════════
   REPORT CATALOG TILES
   ═══════════════════════════════════════════════════════════════ */

.drsCatalogToolbar {
    padding: 0.5rem 0;
    margin-bottom: 0.5rem;
}

.drsCatalogContainer {
    padding-top: 0.5rem;
}

.drsCatalogGroupTitle {
    margin: 1rem 0 0.75rem 0;
    color: #32363a;
    font-weight: 600;
}

.drsCatalogGroupTitle:first-child {
    margin-top: 0;
}

.drsCatalogTileRow {
    gap: 0.75rem;
    flex-wrap: wrap;
    padding-bottom: 0.5rem;
}

/* Tile hover effect */
.drsCatalogTile {
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.drsCatalogTile:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Inactive tile styling */
.drsCatalogTile.sapMGTDisabled {
    opacity: 0.6;
}
```

---

## 4. File Changes Summary

| Action | Path | Lines | Description |
|--------|------|-------|-------------|
| **REPLACE** | `ext/controller/CatalogController.js` | ~250 | Add tile rendering, module grouping |
| **UPDATE** | `ext/view/Main.view.xml` | ~35 | Replace catalog section |
| **UPDATE** | `ext/view/Main.controller.js` | ~20 | Add event handlers |
| **UPDATE** | `i18n/i18n.properties` | ~15 | Add catalog labels |
| **UPDATE** | `css/style.css` | ~30 | Add tile styles |

**Total Estimated Lines:** ~350

---

## 5. Implementation Order

```
Phase 1: Preparation (10 min)
├── Review current CatalogController.js
└── Verify constants.js has REPORT_PAGE_MAP

Phase 2: CatalogController Enhancement (30 min)
├── Add MODULE_GROUPS constant
├── Add resolveModule() helper
├── Add initCatalog() method
├── Add loadCatalog() method
├── Add _applyFiltersAndRender() method
├── Add _renderGroupedTiles() method
├── Add _onTilePress() method
├── Add event handlers (search, filter, refresh)
└── Keep existing onPreview/onCreateSubscription for compatibility

Phase 3: Main.view.xml Update (15 min)
├── Add SearchField namespace if needed
├── Add SegmentedButton namespace if needed
├── Replace catalog macros:FilterBar + macros:Table
└── Add new toolbar + tile container structure

Phase 4: Main.controller.js Wiring (10 min)
├── Add onCatalogSearch handler
├── Add onCatalogSearchLive handler
├── Add onCatalogFilterChange handler
├── Add onRefreshCatalog handler
└── Update onItemSelect for catalog initialization

Phase 5: i18n + CSS (10 min)
├── Add i18n labels
└── Add CSS styles

Phase 6: Testing (15 min)
├── Verify tiles render grouped by module
├── Test search functionality
├── Test filter (All/Active/Inactive)
├── Test tile press navigation
├── Test refresh button
└── Verify responsive layout
```

**Total Time Estimate:** ~1.5 hours

---

## 6. Benefits After Implementation

| Aspect | Before | After |
|--------|--------|-------|
| **Visual Design** | Flat table rows | Grouped tiles with icons |
| **Module Organization** | None | GL, AR, AP, CO, FI groups |
| **Search** | FPM FilterBar | Simple SearchField |
| **Filter** | Multiple filter fields | SegmentedButton (3 options) |
| **Navigation** | Select row + click action | Direct tile click |
| **User Experience** | Data-oriented | Visual-oriented |
| **Consistency** | Different from legacy | Matches legacy app |

---

## 7. Testing Checklist

After implementation, verify:

- [ ] Tiles render grouped by module (GL, AR, AP, CO, FI)
- [ ] Module headers show correct titles and icons
- [ ] Search filters across ReportId, ReportName, Description
- [ ] "All" filter shows all reports
- [ ] "Active" filter shows only IsActive = true
- [ ] "Inactive" filter shows only IsActive = false
- [ ] Active tiles are clickable
- [ ] Inactive tiles are disabled (grayed out)
- [ ] Tile click navigates to correct report preview page
- [ ] Report count updates correctly after filter/search
- [ ] Refresh button clears filters and reloads data
- [ ] Empty state shows "No reports found" message
- [ ] Responsive layout: tiles wrap on smaller screens
- [ ] No console errors
- [ ] Existing preview/create subscription actions still work

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing catalog actions | Keep onPreview/onCreateSubscription methods |
| Missing report in REPORT_PAGE_MAP | Show "Preview not available" message |
| OData load failure | Catch error, show empty state |
| View element ID conflicts | Use unique IDs with "catalog" prefix |
| Performance with many reports | Limit initial load, use virtual scrolling if needed |

---

## 9. Rollback Plan

If issues occur, revert to macros:Table:

1. Restore original `Main.view.xml` catalog section (from git)
2. Remove new methods from `CatalogController.js` (keep original)
3. Remove new event handlers from `Main.controller.js`
4. Remove catalog-specific CSS and i18n entries

---

## Appendix: Module Icon Reference

| Module | Icon | Description |
|--------|------|-------------|
| GL | `sap-icon://accounting-document-verification` | General Ledger |
| AR | `sap-icon://customer` | Accounts Receivable |
| AP | `sap-icon://supplier` | Accounts Payable |
| CO | `sap-icon://cost-center` | Controlling |
| FI | `sap-icon://accounting-document-verification` | Finance (generic) |
| OTHER | `sap-icon://document` | Fallback |
