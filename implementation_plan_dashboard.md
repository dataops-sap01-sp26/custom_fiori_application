# Implementation Plan: Dashboard Screen

## 1. Overview

Transform the empty dashboard into a fully functional overview page with KPIs, quick actions, charts, and recent activity tables.

### Target Layout
```
┌──────────────────────────────────────────────────────────────┐
│  Dashboard Overview                                          │
├──────────────────────────────────────────────────────────────┤
│  SECTION 1: KPI Tiles (5 GenericTiles)                       │
│  [Reports] [Total Subscr] [Active Subscr] [Running] [Failed] │
├──────────────────────────────────────────────────────────────┤
│  SECTION 2: Quick Actions (5 Navigation Tiles)               │
│  [Browse Reports] [My Subscr] [Job Monitor] [History] [Files]│
├──────────────────────────────────────────────────────────────┤
│  SECTION 3: Job Execution Trend Chart (VizFrame)             │
│  Stacked column chart showing job status by date             │
├──────────────────────────────────────────────────────────────┤
│  SECTION 4: Recent Subscriptions Table (Top 5)               │
├──────────────────────────────────────────────────────────────┤
│  SECTION 5: Recent Jobs Table (Top 5)                        │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `ext/controller/DashboardController.js` | Load dashboard data |
| MODIFY | `ext/view/Main.view.xml` | Add dashboard sections |
| MODIFY | `ext/view/Main.controller.js` | Initialize dashboard |
| MODIFY | `model/constants.js` | Add dashboard constants |
| MODIFY | `i18n/i18n.properties` | Add dashboard labels |

---

## 3. Data Model

### 3.1 Dashboard JSON Model Structure

```javascript
{
    // KPI Counts
    reportCount: 0,
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    scheduledJobs: 0,      // ← "Scheduled" (BTCSTATUS domain: 'S')
    failedJobs: 0,         // ← "Aborted" (BTCSTATUS domain: 'A')
    
    // Chart Data
    chartData: [],
    
    // Recent Tables
    recentSubscriptions: [],
    recentJobs: [],
    
    // Loading States
    isLoading: true
}
```

### 3.2 OData Queries

| Data | Entity | Filter / Sort |
|------|--------|---------------|
| Report Count | `ReportCatalog` | `$filter=IsActive eq true` |
| Total Subscriptions | `DrsSubscription` | (không filter) |
| Active Subscriptions | `DrsSubscription` | `$filter=Status eq 'A'` ← single char domain |
| Scheduled Jobs | `DrsJobConfig` | `$filter=JobStatus eq 'S'` ← BTCSTATUS: S=Scheduled |
| Aborted Jobs (Failed) | `DrsJobConfig` | `$filter=JobStatus eq 'A'` ← BTCSTATUS: A=Aborted |
| Chart Data | `JobHistoryAnalytics` | `$orderby=JobDate desc`, top 100 |
| Recent Subscriptions | `DrsSubscription` | `$orderby=CreatedAt desc`, top 5 |
| Recent Jobs | `DrsJobConfig` | `$orderby=CreatedAt desc`, top 5 |

> **Lưu ý domain values:** `Status` trên `DrsSubscription` dùng single char: `A`=Active, `P`=Paused, `I`=Inactive (KHÔNG phải `'ACTIVE'`). `JobStatus` dùng BTCSTATUS domain: `S`=Scheduled, `F`=Finished, `C`=Cancelled, `A`=Aborted (KHÔNG phải số `'2'`, `'4'`).

---

## 4. Implementation Steps

### Phase 1: Foundation (30 min)

#### Step 1.1: ~~Update constants.js~~ ← File này đã bị xóa

`constants.js` đã bị xóa trong quá trình cleanup. Các constant (ACTION_NAMESPACE, REPORT_OPTIONS, REPORT_PAGE_MAP) đã được inline trực tiếp vào từng controller cần dùng.

#### Step 1.2: Update i18n.properties
Keys hiện có trong `i18n.properties` (đã cleanup — các key không dùng đã xóa):

```properties
# Dashboard Section
systemOverview=System Overview
quickActions=Quick Actions
jobTrend=Job Execution Trend
recentSubscriptions=Recent Subscriptions
recentJobs=Recent Job Executions
viewAll=View All

# KPI Tiles
reportsAvailable=Reports Available
totalSubscriptions=Total Subscriptions
activeSubscriptions=Active Subscriptions
scheduledJobs=Scheduled Jobs    ← tên đúng (không phải runningJobs)
failedJobs=Failed Jobs

# Quick Action Tiles
browseReports=Browse Reports
browseReportsDesc=View available reports
mySubscriptions=My Subscriptions
mySubscriptionsDesc=Manage subscriptions
jobMonitor=Job Monitor
jobMonitorDesc=Configure jobs
jobHistory=Job History
jobHistoryDesc=View execution logs
myExports=My Exports
myExportsDesc=Download files

# Table Headers
subscriptionId=Subscription ID
reportId=Report
description=Description
status=Status
format=Format
emailTo=Email
jobId=Job ID
startedAt=Started

# No data
noSubscriptions=No subscriptions found
noJobs=No jobs found
```

> **Keys đã xóa (không dùng):** `dashboardTitle`, `duration`, `statusActive/Paused/Completed/Running/Failed`, `refresh`, `noReportsFound`, `reportsRefreshed`, `MainTitle`

---

### Phase 2: Dashboard Controller (45 min)

#### Step 2.1: Create DashboardController.js (code thực tế hiện tại)

```javascript
// ext/controller/DashboardController.js
sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter"
], function (BaseController, JSONModel, Filter, FilterOperator, Sorter) {
    "use strict";

    return BaseController.extend("cfa.customfioriapplication.ext.controller.DashboardController", {
        
        init: function (oController) {
            var oModel = new JSONModel({
                reportCount: 0,
                totalSubscriptions: 0,
                activeSubscriptions: 0,
                scheduledJobs: 0,      // ← "Scheduled" không phải "running"
                failedJobs: 0,         // ← "Aborted" (JobStatus='A')
                chartData: [],
                recentSubscriptions: [],
                recentJobs: [],
                isLoading: true
            });
            oController.getView().setModel(oModel, "dashboard");
        },
        
        loadDashboardData: function (oController) {
            var that = this;
            var oODataModel = oController.getView().getModel();
            var oDashboard = oController.getView().getModel("dashboard");
            
            oDashboard.setProperty("/isLoading", true);
            
            Promise.all([
                this._loadReportCount(oODataModel),
                this._loadSubscriptionCounts(oODataModel),
                this._loadJobCounts(oODataModel),
                this._loadChartData(oODataModel),
                this._loadRecentSubscriptions(oODataModel),
                this._loadRecentJobs(oODataModel)
            ]).then(function (aResults) {
                oDashboard.setProperty("/reportCount", aResults[0]);
                oDashboard.setProperty("/totalSubscriptions", aResults[1].total);
                oDashboard.setProperty("/activeSubscriptions", aResults[1].active);
                oDashboard.setProperty("/scheduledJobs", aResults[2].scheduled);  // ← scheduled
                oDashboard.setProperty("/failedJobs", aResults[2].failed);
                oDashboard.setProperty("/chartData", aResults[3]);
                oDashboard.setProperty("/recentSubscriptions", aResults[4]);
                oDashboard.setProperty("/recentJobs", aResults[5]);
                oDashboard.setProperty("/isLoading", false);
                
                that._configureDashboardChart(oController);
                
            }).catch(function (oError) {
                console.error("Dashboard load error:", oError);
                oDashboard.setProperty("/isLoading", false);
            });
        },
        
        _loadSubscriptionCounts: function (oModel) {
            return new Promise(function (resolve) {
                var oTotalBinding = oModel.bindList("/DrsSubscription");
                // Status domain: A=Active, P=Paused, I=Inactive (single char)
                var oActiveBinding = oModel.bindList("/DrsSubscription", undefined, undefined,
                    [new Filter("Status", FilterOperator.EQ, "A")]);  // ← 'A' không phải 'ACTIVE'
                
                Promise.all([
                    oTotalBinding.requestContexts(0, 999),
                    oActiveBinding.requestContexts(0, 999)
                ]).then(function (aResults) {
                    resolve({ total: aResults[0].length, active: aResults[1].length });
                }).catch(function () {
                    resolve({ total: 0, active: 0 });
                });
            });
        },
        
        _loadJobCounts: function (oModel) {
            return new Promise(function (resolve) {
                // BTCSTATUS domain: S=Scheduled, F=Finished, C=Cancelled, A=Aborted
                var oScheduledBinding = oModel.bindList("/DrsJobConfig", undefined, undefined,
                    [new Filter("JobStatus", FilterOperator.EQ, "S")]);  // ← 'S' không phải '2'
                var oAbortedBinding = oModel.bindList("/DrsJobConfig", undefined, undefined,
                    [new Filter("JobStatus", FilterOperator.EQ, "A")]);  // ← 'A' không phải '4'
                
                Promise.all([
                    oScheduledBinding.requestContexts(0, 999),
                    oAbortedBinding.requestContexts(0, 999)
                ]).then(function (aResults) {
                    resolve({ scheduled: aResults[0].length, failed: aResults[1].length });
                }).catch(function () {
                    resolve({ scheduled: 0, failed: 0 });
                });
            });
        },
        
        /**
         * Navigate to a page by key
         * CHÚ Ý: tham số (oController, sKey) — oController đứng TRƯỚC sKey
         */
        navigateToPage: function (oController, sKey) {  // ← thứ tự tham số khác plan ban đầu
            var mReportRoutes = {
                exports: "ExportsListPage",
                report_ap01: "AP01ListPage", report_ap02: "AP02ListPage", report_ap03: "AP03ListPage",
                report_ar01: "AR01ListPage", report_ar02: "AR02ListPage", report_ar03: "AR03ListPage",
                report_gl01: "GL01ListPage"
            };
            if (mReportRoutes[sKey]) {
                oController.getAppComponent().getRouter().navTo(mReportRoutes[sKey]);
                return;
            }
            var oNavContainer = oController.byId("pageContainer");
            var oPage = oController.byId(sKey);
            if (oPage) {
                oNavContainer.to(oPage);
                var oSideNav = oController.byId("sideNavigation");
                if (oSideNav) { oSideNav.setSelectedKey(sKey); }
            }
        }
        
        // getKpiColor() đã bị xóa trong cleanup — không còn dùng
    });
});
```

> **Cập nhật (List Report — My Exports + 7 reports):** Các key `exports` và `report_ap01` … `report_gl01` không còn `ScrollContainer` tương ứng trong `Main.view.xml`. `navigateToPage` (và `Main.controller.js` / `onItemSelect`) phải gọi `router.navTo("ExportsListPage")` hoặc `AP01ListPage` … `GL01ListPage` trước khi fallback `NavContainer.to`. Quick action "My Exports" (`targetPage="exports"`) cũng đi qua map này. Màn list là full-screen; quay lại dashboard bằng Back / breadcrumb.

---

### Phase 3: View XML Updates (1 hour)

#### Step 3.1: Update Main.view.xml Dashboard Section

Replace the empty dashboard `ScrollContainer` with full content:

```xml
<!-- DASHBOARD SECTION -->
<ScrollContainer id="dashboard" horizontal="false" vertical="true" height="100%">
    <VBox class="sapUiResponsiveMargin">
        
        <!-- SECTION 1: KPI Overview -->
        <VBox class="sapUiMediumMarginBottom">
            <Title text="{i18n>systemOverview}" level="H3" class="sapUiSmallMarginBottom"/>
            <HBox wrap="Wrap" class="sapUiTinyMarginTop">
                <!-- Reports Available -->
                <GenericTile
                    id="tileReports"
                    class="sapUiTinyMarginEnd sapUiTinyMarginBottom"
                    header="{i18n>reportsAvailable}"
                    press=".onKpiTilePress"
                    customData:key="catalog">
                    <TileContent>
                        <NumericContent
                            value="{dashboard>/reportCount}"
                            icon="sap-icon://document"
                            valueColor="Neutral"/>
                    </TileContent>
                </GenericTile>
                
                <!-- Total Subscriptions -->
                <GenericTile
                    id="tileTotalSubscr"
                    class="sapUiTinyMarginEnd sapUiTinyMarginBottom"
                    header="{i18n>totalSubscriptions}"
                    press=".onKpiTilePress"
                    customData:key="subscriptions">
                    <TileContent>
                        <NumericContent
                            value="{dashboard>/totalSubscriptions}"
                            icon="sap-icon://email"
                            valueColor="Neutral"/>
                    </TileContent>
                </GenericTile>
                
                <!-- Active Subscriptions -->
                <GenericTile
                    id="tileActiveSubscr"
                    class="sapUiTinyMarginEnd sapUiTinyMarginBottom"
                    header="{i18n>activeSubscriptions}"
                    press=".onKpiTilePress"
                    customData:key="subscriptions">
                    <TileContent>
                        <NumericContent
                            value="{dashboard>/activeSubscriptions}"
                            icon="sap-icon://activate"
                            valueColor="Good"/>
                    </TileContent>
                </GenericTile>
                
                <!-- Running Jobs -->
                <GenericTile
                    id="tileRunningJobs"
                    class="sapUiTinyMarginEnd sapUiTinyMarginBottom"
                    header="{i18n>runningJobs}"
                    press=".onKpiTilePress"
                    customData:key="jobconfigs">
                    <TileContent>
                        <NumericContent
                            value="{dashboard>/runningJobs}"
                            icon="sap-icon://process"
                            valueColor="Neutral"/>
                    </TileContent>
                </GenericTile>
                
                <!-- Failed Jobs -->
                <GenericTile
                    id="tileFailedJobs"
                    class="sapUiTinyMarginEnd sapUiTinyMarginBottom"
                    header="{i18n>failedJobs}"
                    press=".onKpiTilePress"
                    customData:key="history">
                    <TileContent>
                        <NumericContent
                            value="{dashboard>/failedJobs}"
                            icon="sap-icon://alert"
                            valueColor="{= ${dashboard>/failedJobs} > 0 ? 'Error' : 'Neutral'}"/>
                    </TileContent>
                </GenericTile>
            </HBox>
        </VBox>
        
        <!-- SECTION 2: Quick Actions -->
        <VBox class="sapUiMediumMarginBottom">
            <Title text="{i18n>quickActions}" level="H3" class="sapUiSmallMarginBottom"/>
            <HBox wrap="Wrap" class="sapUiTinyMarginTop">
                <GenericTile
                    id="actionBrowseReports"
                    class="sapUiTinyMarginEnd sapUiTinyMarginBottom"
                    header="{i18n>browseReports}"
                    subheader="{i18n>browseReportsDesc}"
                    press=".onQuickActionPress"
                    customData:key="catalog">
                    <TileContent>
                        <ImageContent src="sap-icon://document"/>
                    </TileContent>
                </GenericTile>
                
                <GenericTile
                    id="actionMySubscr"
                    class="sapUiTinyMarginEnd sapUiTinyMarginBottom"
                    header="{i18n>mySubscriptions}"
                    subheader="{i18n>mySubscriptionsDesc}"
                    press=".onQuickActionPress"
                    customData:key="subscriptions">
                    <TileContent>
                        <ImageContent src="sap-icon://email"/>
                    </TileContent>
                </GenericTile>
                
                <GenericTile
                    id="actionJobMonitor"
                    class="sapUiTinyMarginEnd sapUiTinyMarginBottom"
                    header="{i18n>jobMonitor}"
                    subheader="{i18n>jobMonitorDesc}"
                    press=".onQuickActionPress"
                    customData:key="jobconfigs">
                    <TileContent>
                        <ImageContent src="sap-icon://settings"/>
                    </TileContent>
                </GenericTile>
                
                <GenericTile
                    id="actionJobHistory"
                    class="sapUiTinyMarginEnd sapUiTinyMarginBottom"
                    header="{i18n>jobHistory}"
                    subheader="{i18n>jobHistoryDesc}"
                    press=".onQuickActionPress"
                    customData:key="history">
                    <TileContent>
                        <ImageContent src="sap-icon://history"/>
                    </TileContent>
                </GenericTile>
                
                <GenericTile
                    id="actionMyExports"
                    class="sapUiTinyMarginEnd sapUiTinyMarginBottom"
                    header="{i18n>myExports}"
                    subheader="{i18n>myExportsDesc}"
                    press=".onQuickActionPress"
                    customData:key="exports">
                    <TileContent>
                        <ImageContent src="sap-icon://open-folder"/>
                    </TileContent>
                </GenericTile>
            </HBox>
        </VBox>
        
        <!-- SECTION 3: Job Execution Trend Chart -->
        <VBox class="sapUiMediumMarginBottom">
            <Title text="{i18n>jobTrend}" level="H3" class="sapUiSmallMarginBottom"/>
            <viz:VizFrame
                id="dashboardChart"
                vizType="stacked_column"
                height="300px"
                width="100%">
                <viz:dataset>
                    <viz.data:FlattenedDataset data="{dashboard>/chartData}">
                        <viz.data:dimensions>
                            <viz.data:DimensionDefinition name="Date" value="{dashboard>JobDate}"/>
                            <viz.data:DimensionDefinition name="Status" value="{dashboard>JobStatus}"/>
                        </viz.data:dimensions>
                        <viz.data:measures>
                            <viz.data:MeasureDefinition name="Count" value="{dashboard>JobCountTotal}"/>
                        </viz.data:measures>
                    </viz.data:FlattenedDataset>
                </viz:dataset>
                <viz:feeds>
                    <viz.feeds:FeedItem type="Dimension" uid="categoryAxis" values="Date"/>
                    <viz.feeds:FeedItem type="Dimension" uid="color" values="Status"/>
                    <viz.feeds:FeedItem type="Measure" uid="valueAxis" values="Count"/>
                </viz:feeds>
            </viz:VizFrame>
        </VBox>
        
        <!-- SECTION 4: Recent Subscriptions -->
        <VBox class="sapUiMediumMarginBottom">
            <HBox justifyContent="SpaceBetween" alignItems="Center" class="sapUiSmallMarginBottom">
                <Title text="{i18n>recentSubscriptions}" level="H3"/>
                <Link text="{i18n>viewAll}" press=".onViewAllSubscriptions"/>
            </HBox>
            <Table
                id="recentSubscriptionsTable"
                inset="false"
                items="{dashboard>/recentSubscriptions}">
                <columns>
                    <Column width="15%"><Text text="{i18n>subscriptionId}"/></Column>
                    <Column width="12%"><Text text="{i18n>reportId}"/></Column>
                    <Column width="25%"><Text text="{i18n>description}"/></Column>
                    <Column width="12%" hAlign="Center"><Text text="{i18n>status}"/></Column>
                    <Column width="10%"><Text text="{i18n>format}"/></Column>
                    <Column width="26%"><Text text="{i18n>emailTo}"/></Column>
                </columns>
                <items>
                    <ColumnListItem type="Active" press=".onSubscriptionRowPress">
                        <Text text="{dashboard>SubscrId}"/>
                        <Text text="{dashboard>ReportId}"/>
                        <Text text="{dashboard>SubscrName}"/>
                        <ObjectStatus
                            text="{dashboard>Status}"
                            state="{= ${dashboard>Status} === 'ACTIVE' ? 'Success' : 'Warning'}"
                            icon="{= ${dashboard>Status} === 'ACTIVE' ? 'sap-icon://accept' : 'sap-icon://pause'}"/>
                        <Text text="{dashboard>OutputFormat}"/>
                        <Text text="{dashboard>EmailTo}"/>
                    </ColumnListItem>
                </items>
            </Table>
        </VBox>
        
        <!-- SECTION 5: Recent Jobs -->
        <VBox class="sapUiMediumMarginBottom">
            <HBox justifyContent="SpaceBetween" alignItems="Center" class="sapUiSmallMarginBottom">
                <Title text="{i18n>recentJobs}" level="H3"/>
                <Link text="{i18n>viewAll}" press=".onViewAllJobs"/>
            </HBox>
            <Table
                id="recentJobsTable"
                inset="false"
                items="{dashboard>/recentJobs}">
                <columns>
                    <Column width="15%"><Text text="{i18n>jobId}"/></Column>
                    <Column width="30%"><Text text="{i18n>description}"/></Column>
                    <Column width="15%" hAlign="Center"><Text text="{i18n>status}"/></Column>
                    <Column width="20%"><Text text="{i18n>startedAt}"/></Column>
                    <Column width="20%"><Text text="{i18n>subscriptionId}"/></Column>
                </columns>
                <items>
                    <ColumnListItem type="Active" press=".onJobRowPress">
                        <Text text="{dashboard>JobId}"/>
                        <Text text="{dashboard>JobText}"/>
                        <ObjectStatus
                            text="{dashboard>JobStatusText}"
                            state="{= ${dashboard>JobStatus} === '3' ? 'Success' : (${dashboard>JobStatus} === '4' ? 'Error' : 'Warning')}"
                            icon="{= ${dashboard>JobStatus} === '3' ? 'sap-icon://accept' : (${dashboard>JobStatus} === '4' ? 'sap-icon://error' : 'sap-icon://process')}"/>
                        <Text text="{dashboard>CreatedAt}"/>
                        <Text text="{dashboard>SubscrId}"/>
                    </ColumnListItem>
                </items>
            </Table>
        </VBox>
        
    </VBox>
</ScrollContainer>
```

---

### Phase 4: Main Controller Integration (30 min)

#### Step 4.1: Update Main.controller.js (code thực tế hiện tại)

```javascript
// Main.controller.js — Orchestration layer
sap.ui.define([
    "sap/fe/core/PageController",
    "../controller/DashboardController",
    "../controller/JobConfigController",
    "../controller/SubscriptionController",
    "../controller/CatalogController",
    "../controller/JobHistoryController"
], function (PageController, DashboardController, JobConfigController,
             SubscriptionController, CatalogController, JobHistoryController) {
    "use strict";

    return PageController.extend("cfa.customfioriapplication.ext.view.Main", {

        onInit: function () {
            PageController.prototype.onInit.apply(this, arguments);

            this._dashboardController = new DashboardController();
            this._jobConfigController = new JobConfigController();
            this._subscriptionController = new SubscriptionController();
            this._catalogController = new CatalogController();
            this._jobHistoryController = new JobHistoryController();
            
            this._dashboardController.init(this);
            this._jobHistoryController.init(this);

            var that = this;
            try {
                var oRouter = this.getAppComponent().getRouter();
                oRouter.getRoute("DashboardMainPage").attachPatternMatched(function () {
                    that._dashboardController.loadDashboardData(that);
                    setTimeout(function () {
                        that._jobConfigController.refreshTable(that);
                    }, 500);
                });
            } catch (e) {
                this._dashboardController.loadDashboardData(this);
            }
        },

        onItemSelect: function (oEvent) {
            var oItem = oEvent.getParameter("item");
            var sKey = oItem.getKey();
            if (!sKey) { return; }

            this.byId("pageContainer").to(this.byId(sKey));

            if (sKey === "dashboard") {
                this._dashboardController.loadDashboardData(this);
            } else if (sKey === "history") {
                this._jobHistoryController.loadChartData(this);
            } else if (sKey === "catalog") {
                this._catalogController.initCatalog(this);
            }
        },

        // Handlers delegate sang DashboardController
        // CHÚ Ý: navigateToPage(oController, sKey) — oController đứng TRƯỚC sKey
        onKpiTilePress: function (oEvent) {
            var sTargetPage = oEvent.getSource().data("targetPage");
            this._dashboardController.navigateToPage(this, sTargetPage);
        },

        onQuickActionPress: function (oEvent) {
            var sTargetPage = oEvent.getSource().data("targetPage");
            this._dashboardController.navigateToPage(this, sTargetPage);
        },

        onViewAllSubscriptions: function () {
            this._dashboardController.navigateToPage(this, "subscriptions");
        },

        onViewAllJobs: function () {
            this._dashboardController.navigateToPage(this, "jobconfigs");
        },

        // Row press đơn giản — chỉ navigate đến trang list tương ứng
        onSubscriptionRowPress: function () {
            this._dashboardController.navigateToPage(this, "subscriptions");
        },

        onJobRowPress: function () {
            this._dashboardController.navigateToPage(this, "jobconfigs");
        }
    });
});
```

---

## 5. Implementation Order

| Phase | Task | Est. Time |
|-------|------|-----------|
| 1.1 | Update `constants.js` | 5 min |
| 1.2 | Update `i18n.properties` | 10 min |
| 2.1 | Create `DashboardController.js` | 45 min |
| 3.1 | Update `Main.view.xml` dashboard section | 60 min |
| 4.1 | Update `Main.controller.js` | 30 min |
| 5 | Testing & Fixes | 30 min |
| **Total** | | **3 hours** |

---

## 6. Testing Checklist

- [ ] Dashboard loads without errors
- [ ] All 5 KPI tiles show correct counts
- [ ] KPI tile click navigates to correct page
- [ ] Quick action tiles navigate correctly
- [ ] Chart displays job trend data
- [ ] Recent subscriptions table shows data
- [ ] Recent jobs table shows data
- [ ] "View All" links work
- [ ] Row click navigates to detail page
- [ ] Failed jobs KPI shows red when > 0
- [ ] Active subscriptions KPI shows green

---

## 7. XML Namespace Requirements

Add to Main.view.xml root element:
```xml
xmlns:customData="http://schemas.sap.com/sapui5/extension/sap.ui.core.CustomData/1"
```

---

## 8. Styling (Optional)

Add to `css/style.css`:
```css
/* Dashboard KPI Tiles */
.sapMGT {
    margin: 0.5rem !important;
}

/* Dashboard Section Spacing */
.dashboardSection {
    margin-bottom: 2rem;
}

/* Chart Container */
#dashboardChart {
    border: 1px solid #e5e5e5;
    border-radius: 4px;
}
```

---

## Appendix: File Structure Hiện Tại (sau cleanup)

```
webapp/
├── ext/
│   ├── controller/
│   │   ├── BaseController.js
│   │   ├── DashboardController.js
│   │   ├── JobConfigController.js
│   │   ├── SubscriptionController.js
│   │   ├── CatalogController.js
│   │   └── JobHistoryController.js
│   ├── view/
│   │   ├── Main.controller.js        ← Orchestration only (~147 lines)
│   │   └── Main.view.xml             ← Full view (~635 lines)
│   └── fragment/
│       ├── DashboardChart.fragment.xml   ← backup (VizFrame đã inline)
│       └── JobHistoryChart.fragment.xml  ← backup (VizFrame đã inline)
├── annotations/
│   └── annotation.xml
├── i18n/
│   └── i18n.properties
└── css/
    └── style.css

Đã xóa:
├── model/constants.js    ← DELETED — inline vào từng controller
├── model/formatter.js    ← DELETED — không còn dùng
└── ext/helper/ChartHelper.js  ← DELETED — logic nằm trong JobHistoryController
```
