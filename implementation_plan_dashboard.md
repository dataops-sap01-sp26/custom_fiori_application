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
    runningJobs: 0,
    failedJobs: 0,
    
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

| Data | Entity | Query Parameters |
|------|--------|------------------|
| Report Count | `ReportCatalog` | `$count=true&$filter=IsActive eq true&$top=0` |
| Total Subscriptions | `DrsSubscription` | `$count=true&$top=0` |
| Active Subscriptions | `DrsSubscription` | `$count=true&$filter=Status eq 'ACTIVE'&$top=0` |
| Running Jobs | `DrsJobConfig` | `$count=true&$filter=JobStatus eq '2'&$top=0` |
| Failed Jobs (Today) | `JobHistoryAnalytics` | `$count=true&$filter=JobStatus eq '4'&$top=0` |
| Chart Data | `JobHistoryAnalytics` | `$orderby=JobDate desc&$top=100` |
| Recent Subscriptions | `DrsSubscription` | `$orderby=CreatedAt desc&$top=5` |
| Recent Jobs | `DrsJobConfig` | `$orderby=CreatedAt desc&$top=5` |

---

## 4. Implementation Steps

### Phase 1: Foundation (30 min)

#### Step 1.1: Update constants.js
Add dashboard-related constants.

```javascript
// Add to model/constants.js
DASHBOARD: {
    TILE_KEYS: {
        REPORTS: "catalog",
        SUBSCRIPTIONS: "subscriptions", 
        JOB_CONFIGS: "jobconfigs",
        HISTORY: "history",
        EXPORTS: "exports"
    },
    KPI_COLORS: {
        NEUTRAL: "Neutral",
        GOOD: "Good",
        CRITICAL: "Critical",
        ERROR: "Error"
    }
}
```

#### Step 1.2: Update i18n.properties
Add all dashboard text labels.

```properties
# Dashboard Section
dashboardTitle=Dashboard Overview
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
runningJobs=Running Jobs
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
duration=Duration

# Status
statusActive=Active
statusPaused=Paused
statusCompleted=Completed
statusRunning=Running
statusFailed=Failed
```

---

### Phase 2: Dashboard Controller (45 min)

#### Step 2.1: Create DashboardController.js

```javascript
// ext/controller/DashboardController.js
sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("cfa.customfioriapplication.ext.controller.DashboardController", {
        
        /**
         * Initialize dashboard model
         * @param {sap.fe.core.PageController} oController - Main controller
         */
        init: function (oController) {
            var oModel = new JSONModel({
                reportCount: 0,
                totalSubscriptions: 0,
                activeSubscriptions: 0,
                runningJobs: 0,
                failedJobs: 0,
                chartData: [],
                recentSubscriptions: [],
                recentJobs: [],
                isLoading: true
            });
            oController.getView().setModel(oModel, "dashboard");
        },
        
        /**
         * Load all dashboard data
         * @param {sap.fe.core.PageController} oController - Main controller
         */
        loadDashboardData: function (oController) {
            var that = this;
            var oODataModel = oController.getView().getModel();
            
            // Load all data in parallel
            Promise.all([
                this._loadReportCount(oODataModel),
                this._loadSubscriptionCounts(oODataModel),
                this._loadJobCounts(oODataModel),
                this._loadChartData(oODataModel),
                this._loadRecentSubscriptions(oODataModel),
                this._loadRecentJobs(oODataModel)
            ]).then(function (aResults) {
                var oDashboard = oController.getView().getModel("dashboard");
                
                oDashboard.setProperty("/reportCount", aResults[0]);
                oDashboard.setProperty("/totalSubscriptions", aResults[1].total);
                oDashboard.setProperty("/activeSubscriptions", aResults[1].active);
                oDashboard.setProperty("/runningJobs", aResults[2].running);
                oDashboard.setProperty("/failedJobs", aResults[2].failed);
                oDashboard.setProperty("/chartData", aResults[3]);
                oDashboard.setProperty("/recentSubscriptions", aResults[4]);
                oDashboard.setProperty("/recentJobs", aResults[5]);
                oDashboard.setProperty("/isLoading", false);
                
            }).catch(function (oError) {
                console.error("Dashboard load error:", oError);
                oController.getView().getModel("dashboard").setProperty("/isLoading", false);
            });
        },
        
        /**
         * Load report catalog count
         * @private
         */
        _loadReportCount: function (oModel) {
            return new Promise(function (resolve) {
                var oBinding = oModel.bindList("/ReportCatalog", undefined, undefined, 
                    new sap.ui.model.Filter("IsActive", "EQ", true));
                oBinding.requestContexts(0, 1).then(function (aContexts) {
                    resolve(oBinding.getLength() || 0);
                }).catch(function () {
                    resolve(0);
                });
            });
        },
        
        /**
         * Load subscription counts (total and active)
         * @private
         */
        _loadSubscriptionCounts: function (oModel) {
            var that = this;
            return new Promise(function (resolve) {
                var oTotalBinding = oModel.bindList("/DrsSubscription");
                var oActiveBinding = oModel.bindList("/DrsSubscription", undefined, undefined,
                    new sap.ui.model.Filter("Status", "EQ", "ACTIVE"));
                
                Promise.all([
                    oTotalBinding.requestContexts(0, 1),
                    oActiveBinding.requestContexts(0, 1)
                ]).then(function () {
                    resolve({
                        total: oTotalBinding.getLength() || 0,
                        active: oActiveBinding.getLength() || 0
                    });
                }).catch(function () {
                    resolve({ total: 0, active: 0 });
                });
            });
        },
        
        /**
         * Load job counts (running and failed)
         * @private
         */
        _loadJobCounts: function (oModel) {
            return new Promise(function (resolve) {
                var oRunningBinding = oModel.bindList("/DrsJobConfig", undefined, undefined,
                    new sap.ui.model.Filter("JobStatus", "EQ", "2"));
                var oFailedBinding = oModel.bindList("/JobHistoryAnalytics", undefined, undefined,
                    new sap.ui.model.Filter("JobStatus", "EQ", "4"));
                
                Promise.all([
                    oRunningBinding.requestContexts(0, 1),
                    oFailedBinding.requestContexts(0, 1)
                ]).then(function () {
                    resolve({
                        running: oRunningBinding.getLength() || 0,
                        failed: oFailedBinding.getLength() || 0
                    });
                }).catch(function () {
                    resolve({ running: 0, failed: 0 });
                });
            });
        },
        
        /**
         * Load chart data from JobHistoryAnalytics
         * @private
         */
        _loadChartData: function (oModel) {
            return new Promise(function (resolve) {
                var oBinding = oModel.bindList("/JobHistoryAnalytics", undefined,
                    [new sap.ui.model.Sorter("JobDate", true)], // descending
                    undefined,
                    { $top: 100 });
                
                oBinding.requestContexts(0, 100).then(function (aContexts) {
                    var aData = aContexts.map(function (oCtx) {
                        return oCtx.getObject();
                    });
                    
                    // Aggregate by date and status
                    var mAggregated = {};
                    aData.forEach(function (oItem) {
                        var sDate = oItem.JobDate || "";
                        var sStatus = oItem.JobStatus || "Unknown";
                        var sKey = sDate + "|" + sStatus;
                        
                        if (!mAggregated[sKey]) {
                            mAggregated[sKey] = {
                                JobDate: sDate,
                                JobStatus: sStatus,
                                JobCountTotal: 0
                            };
                        }
                        mAggregated[sKey].JobCountTotal += (oItem.JobCountTotal || 1);
                    });
                    
                    var aChartData = Object.values(mAggregated).sort(function (a, b) {
                        return a.JobDate.localeCompare(b.JobDate);
                    });
                    
                    resolve(aChartData);
                }).catch(function () {
                    resolve([]);
                });
            });
        },
        
        /**
         * Load recent subscriptions (top 5)
         * @private
         */
        _loadRecentSubscriptions: function (oModel) {
            return new Promise(function (resolve) {
                var oBinding = oModel.bindList("/DrsSubscription", undefined,
                    [new sap.ui.model.Sorter("CreatedAt", true)], // descending
                    undefined,
                    { $top: 5 });
                
                oBinding.requestContexts(0, 5).then(function (aContexts) {
                    resolve(aContexts.map(function (oCtx) {
                        return oCtx.getObject();
                    }));
                }).catch(function () {
                    resolve([]);
                });
            });
        },
        
        /**
         * Load recent jobs (top 5)
         * @private
         */
        _loadRecentJobs: function (oModel) {
            return new Promise(function (resolve) {
                var oBinding = oModel.bindList("/DrsJobConfig", undefined,
                    [new sap.ui.model.Sorter("CreatedAt", true)], // descending
                    undefined,
                    { $top: 5 });
                
                oBinding.requestContexts(0, 5).then(function (aContexts) {
                    resolve(aContexts.map(function (oCtx) {
                        return oCtx.getObject();
                    }));
                }).catch(function () {
                    resolve([]);
                });
            });
        },
        
        /**
         * Navigate to a page by key
         * @param {string} sKey - Page key (catalog, subscriptions, etc.)
         * @param {sap.fe.core.PageController} oController - Main controller
         */
        navigateToPage: function (sKey, oController) {
            var oNavContainer = oController.byId("pageContainer");
            var oPage = oController.byId(sKey);
            if (oPage) {
                oNavContainer.to(oPage);
            }
        },
        
        /**
         * Get color for KPI based on value
         */
        getKpiColor: function (sType, iValue) {
            if (sType === "failed") {
                return iValue > 0 ? "Error" : "Neutral";
            }
            if (sType === "active") {
                return iValue > 0 ? "Good" : "Neutral";
            }
            return "Neutral";
        }
    });
});
```

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

#### Step 4.1: Update Main.controller.js

Add dashboard controller import and initialization:

```javascript
// Add to imports
"../controller/DashboardController"

// Add to onInit
this._dashboardController = new DashboardController();
this._dashboardController.init(this);

// Load dashboard data when navigating to dashboard page
// In onItemSelect, add:
if (sKey === "dashboard") {
    this._dashboardController.loadDashboardData(this);
}

// Also load on initial page load in onInit:
setTimeout(function () {
    that._dashboardController.loadDashboardData(that);
}, 1000);

// Add new handler methods
onKpiTilePress: function (oEvent) {
    var sKey = oEvent.getSource().data("key");
    this._dashboardController.navigateToPage(sKey, this);
},

onQuickActionPress: function (oEvent) {
    var sKey = oEvent.getSource().data("key");
    this._dashboardController.navigateToPage(sKey, this);
},

onViewAllSubscriptions: function () {
    this._dashboardController.navigateToPage("subscriptions", this);
},

onViewAllJobs: function () {
    this._dashboardController.navigateToPage("jobconfigs", this);
},

onSubscriptionRowPress: function (oEvent) {
    var oContext = oEvent.getSource().getBindingContext("dashboard");
    var sSubscrUuid = oContext.getProperty("SubscrUuid");
    var sSubscrId = oContext.getProperty("SubscrId");
    // Navigate to subscription detail
    this._subscriptionController.navigateToDetail(this, {
        getProperty: function (sProp) {
            return oContext.getProperty(sProp);
        }
    });
},

onJobRowPress: function (oEvent) {
    // Navigate to job detail (implement similar to subscription)
}
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

## Appendix: Final File Structure

```
webapp/
├── ext/
│   ├── controller/
│   │   ├── BaseController.js
│   │   ├── DashboardController.js    ← NEW
│   │   ├── JobConfigController.js
│   │   ├── SubscriptionController.js
│   │   ├── CatalogController.js
│   │   └── JobHistoryController.js
│   ├── view/
│   │   ├── Main.controller.js        ← MODIFIED
│   │   └── Main.view.xml             ← MODIFIED
│   └── helper/
│       └── ChartHelper.js
├── model/
│   ├── constants.js                  ← MODIFIED
│   └── formatter.js
├── i18n/
│   └── i18n.properties               ← MODIFIED
└── css/
    └── style.css                     ← NEW (optional)
```
