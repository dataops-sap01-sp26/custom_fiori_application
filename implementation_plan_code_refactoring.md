# Implementation Plan: Code Structure Refactoring

## 1. Overview

Refactor `custom_fiori_application` to match the well-organized structure of `drs_admin` freestyle app for better maintainability.

### Current State (FPM App)
```
webapp/
├── ext/view/
│   ├── Main.controller.js    ← 500+ lines, ALL logic here
│   └── Main.view.xml         ← 350+ lines, ALL view here
├── annotations/
│   └── annotation.xml        ← 900+ lines, ALL annotations
└── Component.js
```

**Problems:**
- Single monolithic controller with 21+ methods
- No separation of concerns
- Hard to find specific functionality
- Difficult to maintain and test
- No reusable utilities

### Target State (Đã hoàn thành — Cấu trúc thực tế hiện tại)
```
webapp/
├── ext/
│   ├── controller/                    ← Domain-specific controllers (đã triển khai)
│   │   ├── BaseController.js          ← Shared methods (showMessage, showError, getTableSelectedContexts...)
│   │   ├── DashboardController.js     ← Dashboard KPIs, charts, recent data, navigateToPage (NavContainer + router cho List Report)
│   │   ├── JobConfigController.js     ← Job config CRUD (Create/Delete)
│   │   ├── SubscriptionController.js  ← Subscription CRUD + dialog chọn Report
│   │   ├── CatalogController.js       ← Report catalog: tile rendering, ActionSheet
│   │   └── JobHistoryController.js    ← Job history chart: load, configure, aggregate
│   ├── view/
│   │   ├── Main.controller.js         ← Orchestration (~160+ lines; `onItemSelect` có map router cho exports/reports)
│   │   └── Main.view.xml              ← ToolPage + NavContainer: dashboard, catalog, subscriptions, jobconfigs, history, settings (macros); exports + 7 reports → `sap.fe.templates.ListReport` qua manifest (~460 lines)
│   └── fragment/
│       ├── DashboardChart.fragment.xml   ← (backup — VizFrame đã inline trong view)
│       └── JobHistoryChart.fragment.xml  ← (backup — VizFrame đã inline trong view)
├── annotations/
│   └── annotation.xml                 ← UI annotations cho tất cả entities
├── css/
│   └── style.css                      ← Custom styles (~128 lines)
├── i18n/
│   └── i18n.properties                ← Resource bundle (~61 lines)
└── Component.js
```

> **Các file đã bị xóa trong quá trình cleanup:**
> - `model/constants.js` — các constant đã được inline vào từng controller
> - `model/formatter.js` — không còn dùng formatter
> - `ext/helper/ChartHelper.js` — logic chart nằm trong `JobHistoryController.js`
> - Tất cả `ext/fragment/Page*.fragment.xml` (11 files) — Fragment-based lazy loading không hoạt động với macros:Table

---

## 2. Current Method Inventory

### Main.controller.js — Trạng thái TRƯỚC khi refactor (~500 lines, monolithic)

| Method | Domain | Mô tả |
|--------|--------|-------|
| `onInit` | Core | Khởi tạo, router setup |
| `_configureChart` | JobHistory | Cấu hình VizFrame |
| `_loadHistoryChart` | JobHistory | Load dữ liệu chart |
| `_aggregateChartData` | JobHistory | Aggregate data cho chart |
| `onJobHistoryFilterSearch` | JobHistory | Filter search handler |
| `onMenuButtonPress` | Navigation | Toggle sidebar |
| `onItemSelect` | Navigation | Chọn sidebar item |
| `_refreshJobConfigTable` | JobConfig | Refresh bảng |
| `onCreateJobConfig` | JobConfig | Tạo job config |
| `onDeleteJobConfig` | JobConfig | Xóa job config |
| `onCreateSubscription` | Subscription | Dialog tạo subscription |
| `_createSubscriptionWithReportId` | Subscription | Tạo subscription với ReportId |
| `onDeleteSubscription` | Subscription | Xóa subscription |
| `onPreviewReport` | Catalog | Preview report |
| `onCreateSubscriptionFromCatalog` | Catalog | Tạo subscription từ catalog |

### Main.controller.js — Trạng thái SAU khi refactor (~160+ lines, orchestration only)

| Method | Domain | Mô tả |
|--------|--------|-------|
| `onInit` | Core | Khởi tạo domain controllers, router setup |
| `onMenuButtonPress` | Navigation | Toggle sidebar |
| `onItemSelect` | Navigation | Chọn sidebar: `exports` / `report_*` → `router.navTo(ListReport)`; còn lại → `NavContainer.to` + delegate load data |
| `onKpiTilePress` | Dashboard | Delegate → DashboardController |
| `onQuickActionPress` | Dashboard | Delegate → DashboardController |
| `onViewAllSubscriptions` | Dashboard | Navigate → subscriptions |
| `onViewAllJobs` | Dashboard | Navigate → jobconfigs |
| `onSubscriptionRowPress` | Dashboard | Navigate → subscriptions |
| `onJobRowPress` | Dashboard | Navigate → jobconfigs |
| `onCreateJobConfig` | JobConfig | Delegate → JobConfigController |
| `onDeleteJobConfig` | JobConfig | Delegate → JobConfigController |
| `onCreateSubscription` | Subscription | Delegate → SubscriptionController |
| `onDeleteSubscription` | Subscription | Delegate → SubscriptionController |
| `onJobHistoryFilterSearch` | JobHistory | Delegate → JobHistoryController |

---

## 3. Target Organization

### 3.1 BaseController.js
Shared methods used by all domain controllers.

```javascript
// ext/controller/BaseController.js
sap.ui.define([
    "sap/fe/core/PageController",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (PageController, MessageBox, MessageToast) {
    "use strict";

    return PageController.extend("cfa.customfioriapplication.ext.controller.BaseController", {
        
        getRouter: function () {
            return this.getAppComponent().getRouter();
        },
        
        getModel: function (sName) {
            return this.getView().getModel(sName);
        },
        
        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },
        
        byId: function (sId) {
            return this.getView().byId(sId);
        },
        
        showMessage: function (sMessage) {
            MessageToast.show(sMessage);
        },
        
        showError: function (sMessage) {
            MessageBox.error(sMessage);
        },
        
        confirmAction: function (sMessage, fnCallback) {
            MessageBox.confirm(sMessage, {
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                onClose: fnCallback
            });
        }
    });
});
```

### 3.2 JobConfigController.js
Job configuration CRUD operations.

```javascript
// ext/controller/JobConfigController.js
sap.ui.define([
    "./BaseController"
], function (BaseController) {
    "use strict";

    return BaseController.extend("cfa.customfioriapplication.ext.controller.JobConfigController", {
        
        refreshTable: function (oController) {
            var oTable = oController.byId("jobConfigTable");
            if (oTable) {
                oTable.getBinding("rows")?.refresh();
            }
        },
        
        onCreate: function (oController) {
            var oEditFlow = oController.getExtensionAPI().getEditFlow();
            oEditFlow.createDocument(
                oController.byId("jobConfigTable"),
                { creationMode: "NewPage" }
            );
        },
        
        onDelete: function (oController) {
            var oTable = oController.byId("jobConfigTable");
            var aContexts = oTable.getSelectedContexts();
            
            if (!aContexts || aContexts.length === 0) {
                this.showMessage("Please select at least one job to delete.");
                return;
            }
            
            var that = this;
            var iTotal = aContexts.length;
            
            // Separate active vs draft
            var aActiveContexts = [];
            var aDraftContexts = [];
            
            aContexts.forEach(function (oContext) {
                var bIsActive = oContext.getProperty("IsActiveEntity");
                if (bIsActive) {
                    aActiveContexts.push(oContext);
                } else {
                    aDraftContexts.push(oContext);
                }
            });
            
            this.confirmAction(
                "Delete " + iTotal + " job configuration(s)?",
                function (sAction) {
                    if (sAction === "YES") {
                        that._executeDelete(oController, aActiveContexts, aDraftContexts, iTotal);
                    }
                }
            );
        },
        
        _executeDelete: function (oController, aActiveContexts, aDraftContexts, iTotal) {
            var that = this;
            var oModel = oController.getModel();
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
                that.showMessage("Deleted " + iTotal + " job(s) successfully.");
                oModel.refresh();
            }).catch(function () {
                that.showError("Error occurred while deleting jobs.");
                oModel.refresh();
            });
        }
    });
});
```

### 3.3 SubscriptionController.js
Subscription CRUD operations.

```javascript
// ext/controller/SubscriptionController.js
sap.ui.define([
    "./BaseController",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Select",
    "sap/ui/core/Item",
    "sap/m/Label",
    "sap/m/VBox"
], function (BaseController, Dialog, Button, Select, Item, Label, VBox) {
    "use strict";

    return BaseController.extend("cfa.customfioriapplication.ext.controller.SubscriptionController", {
        
        // Report ID to supported param types mapping
        REPORT_PARAM_MAP: {
            "GL-01": true,
            "AR-01": true,
            "AR-02": true,
            "AR-03": true,
            "AP-01": true,
            "AP-02": true,
            "AP-03": true
        },
        
        ACTION_NAMESPACE: "com.sap.gateway.srvd.zsd_drs_main_o4.v0001",
        
        showCreateDialog: function (oController) {
            var that = this;
            var oModel = oController.getModel();
            
            // Load available reports
            var oReportSelect = new Select({
                width: "100%",
                items: [
                    new Item({ key: "GL-01", text: "GL-01: G/L Account Balances" }),
                    new Item({ key: "AR-01", text: "AR-01: Customer Open Items" }),
                    new Item({ key: "AR-02", text: "AR-02: Customer Balances" }),
                    new Item({ key: "AR-03", text: "AR-03: AR Aging Report" }),
                    new Item({ key: "AP-01", text: "AP-01: Vendor Open Items" }),
                    new Item({ key: "AP-02", text: "AP-02: Vendor Balances" }),
                    new Item({ key: "AP-03", text: "AP-03: AP Aging Report" })
                ]
            });

            var oDialog = new Dialog({
                title: "Create Subscription",
                content: new VBox({
                    items: [
                        new Label({ text: "Select Report" }),
                        oReportSelect
                    ]
                }).addStyleClass("sapUiSmallMargin"),
                beginButton: new Button({
                    text: "Create",
                    type: "Emphasized",
                    press: function () {
                        var sReportId = oReportSelect.getSelectedKey();
                        oDialog.close();
                        that.createWithReportId(oController, sReportId);
                    }
                }),
                endButton: new Button({
                    text: "Cancel",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },
        
        createWithReportId: function (oController, sReportId) {
            var that = this;
            var oModel = oController.getModel();
            var oListBinding = oModel.bindList("/DrsSubscription");
            
            var oContext = oListBinding.create({
                ReportId: sReportId
            });
            
            oContext.created().then(function () {
                // Call createReportParams action
                var sActionPath = oContext.getPath() + "/" + that.ACTION_NAMESPACE + ".createReportParams";
                var oActionBinding = oModel.bindContext(sActionPath + "(...)");
                
                return oActionBinding.execute().then(function () {
                    that.navigateToDetail(oController, oContext);
                }).catch(function () {
                    // Params action failed, still navigate
                    that.showMessage("Subscription created but parameters could not be initialized.");
                    that.navigateToDetail(oController, oContext);
                });
            }).catch(function (oError) {
                that.showError("Failed to create subscription.");
            });
        },
        
        navigateToDetail: function (oController, oContext) {
            var oRouter = oController.getRouter();
            var sSubscrUuid = oContext.getProperty("SubscrUuid");
            var sSubscrId = oContext.getProperty("SubscrId");
            var bIsActiveEntity = oContext.getProperty("IsActiveEntity");
            
            var sKey = "SubscrUuid=" + sSubscrUuid +
                       ",SubscrId='" + sSubscrId + "'" +
                       ",IsActiveEntity=" + bIsActiveEntity;
            
            oRouter.navTo("DrsSubscriptionObjectPage", { key: sKey });
        },
        
        onDelete: function (oController) {
            var oTable = oController.byId("subscrTable");
            var aContexts = oTable.getSelectedContexts();
            
            if (!aContexts || aContexts.length === 0) {
                this.showMessage("Please select at least one subscription to delete.");
                return;
            }
            
            var that = this;
            var iTotal = aContexts.length;
            
            var aActiveContexts = [];
            var aDraftContexts = [];
            
            aContexts.forEach(function (oContext) {
                var bIsActive = oContext.getProperty("IsActiveEntity");
                if (bIsActive) {
                    aActiveContexts.push(oContext);
                } else {
                    aDraftContexts.push(oContext);
                }
            });
            
            this.confirmAction(
                "Delete " + iTotal + " subscription(s)?",
                function (sAction) {
                    if (sAction === "YES") {
                        that._executeDelete(oController, aActiveContexts, aDraftContexts, iTotal);
                    }
                }
            );
        },
        
        _executeDelete: function (oController, aActiveContexts, aDraftContexts, iTotal) {
            var that = this;
            var oModel = oController.getModel();
            var aAllPromises = [];
            
            aActiveContexts.forEach(function (oContext) {
                aAllPromises.push(oContext.delete());
            });
            
            aDraftContexts.forEach(function (oContext) {
                var sDiscardPath = oContext.getPath() + "/" + that.ACTION_NAMESPACE + ".Discard";
                var oOp = oModel.bindContext(sDiscardPath + "(...)");
                aAllPromises.push(oOp.execute());
            });
            
            Promise.all(aAllPromises).then(function () {
                that.showMessage("Deleted " + iTotal + " subscription(s) successfully.");
                oModel.refresh();
            }).catch(function () {
                that.showError("Error occurred while deleting subscriptions.");
                oModel.refresh();
            });
        }
    });
});
```

### 3.4 CatalogController.js
Report catalog actions.

```javascript
// ext/controller/CatalogController.js
sap.ui.define([
    "./BaseController"
], function (BaseController) {
    "use strict";

    return BaseController.extend("cfa.customfioriapplication.ext.controller.CatalogController", {
        
        // Map ReportId to sidebar page key
        PREVIEW_PAGE_MAP: {
            "GL-01": "report_gl01",
            "AR-01": "report_ar01",
            "AR-02": "report_ar02",
            "AR-03": "report_ar03",
            "AP-01": "report_ap01",
            "AP-02": "report_ap02",
            "AP-03": "report_ap03"
        },
        
        onPreview: function (oController) {
            var oTable = oController.byId("catalogTable");
            var aContexts = oTable.getSelectedContexts();
            
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
            
            var sPageKey = this.PREVIEW_PAGE_MAP[sReportId];
            
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
        
        onCreateSubscription: function (oController, oSubscriptionController) {
            var oTable = oController.byId("catalogTable");
            var aContexts = oTable.getSelectedContexts();
            
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

### 3.5 JobHistoryController.js
Job history and chart management.

```javascript
// ext/controller/JobHistoryController.js
sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("cfa.customfioriapplication.ext.controller.JobHistoryController", {
        
        _aHistoryData: [],
        
        init: function (oController) {
            oController.setModel(new JSONModel({ chartData: [] }), "chartModel");
        },
        
        configureChart: function (oController) {
            var oVizFrame = oController.byId("jobTrendChart");
            if (!oVizFrame) { return; }
            
            oVizFrame.setVizProperties({
                plotArea: {
                    dataLabel: { visible: false }
                },
                valueAxis: {
                    title: { visible: true, text: "Execution Count" }
                },
                categoryAxis: {
                    title: { visible: true, text: "Job Date" }
                },
                title: { visible: false },
                legend: {
                    visible: true,
                    title: { visible: true, text: "Job Status" }
                }
            });
        },
        
        loadChartData: function (oController) {
            var that = this;
            
            this.configureChart(oController);
            
            var oModel = oController.getModel();
            var oBinding = oModel.bindList("/JobHistoryAnalytics", undefined, undefined, undefined, {
                $orderby: "JobDate desc"
            });
            
            oBinding.requestContexts(0, 999).then(function (aContexts) {
                var aRawData = aContexts.map(function (oCtx) {
                    return oCtx.getObject();
                });
                
                that._aHistoryData = aRawData;
                that._aggregateChartData(oController, aRawData);
            }).catch(function (oError) {
                console.error("JobHistory chart data load error:", oError);
            });
        },
        
        _aggregateChartData: function (oController, aData) {
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
                return a.JobDate < b.JobDate ? -1 : 1;
            });
            
            oController.getModel("chartModel").setProperty("/chartData", aChartData);
        },
        
        onFilterSearch: function (oController) {
            this.loadChartData(oController);
        }
    });
});
```

### 3.6 ChartHelper.js
Reusable chart configuration utilities.

```javascript
// ext/helper/ChartHelper.js
sap.ui.define([], function () {
    "use strict";

    return {
        
        /**
         * Configure a VizFrame with standard job trend settings
         */
        configureJobTrendChart: function (oVizFrame) {
            if (!oVizFrame) { return; }
            
            oVizFrame.setVizProperties({
                plotArea: {
                    dataLabel: { visible: false },
                    colorPalette: ["#5cbae6", "#b6d957", "#fac364", "#8cd3ff"]
                },
                valueAxis: {
                    title: { visible: true, text: "Execution Count" }
                },
                categoryAxis: {
                    title: { visible: true, text: "Job Date" }
                },
                title: { visible: false },
                legend: {
                    visible: true,
                    title: { visible: true, text: "Job Status" }
                }
            });
        },
        
        /**
         * Aggregate raw data by date and status
         */
        aggregateByDateAndStatus: function (aData, sDateField, sStatusField, sCountField) {
            var mAggregated = {};
            
            aData.forEach(function (oItem) {
                var sDate = oItem[sDateField] || "";
                var sStatus = oItem[sStatusField] || "Unknown";
                var sKey = sDate + "|" + sStatus;
                
                if (!mAggregated[sKey]) {
                    mAggregated[sKey] = {};
                    mAggregated[sKey][sDateField] = sDate;
                    mAggregated[sKey][sStatusField] = sStatus;
                    mAggregated[sKey][sCountField] = 0;
                }
                mAggregated[sKey][sCountField] += (oItem[sCountField] || 1);
            });
            
            return Object.values(mAggregated).sort(function (a, b) {
                return a[sDateField] < b[sDateField] ? -1 : 1;
            });
        }
    };
});
```

### 3.7 model/constants.js
Centralized constants and mappings.

```javascript
// model/constants.js
sap.ui.define([], function () {
    "use strict";

    return {
        
        // OData action namespace
        ACTION_NAMESPACE: "com.sap.gateway.srvd.zsd_drs_main_o4.v0001",
        
        // Job status values
        JOB_STATUS: {
            SCHEDULED: "1",
            RUNNING: "2",
            COMPLETED: "3",
            FAILED: "4",
            CANCELLED: "5"
        },
        
        // Subscription status values
        SUBSCRIPTION_STATUS: {
            ACTIVE: "ACTIVE",
            PAUSED: "PAUSED",
            INACTIVE: "INACTIVE"
        },
        
        // Report ID to sidebar page mapping
        REPORT_PAGE_MAP: {
            "GL-01": "report_gl01",
            "AR-01": "report_ar01",
            "AR-02": "report_ar02",
            "AR-03": "report_ar03",
            "AP-01": "report_ap01",
            "AP-02": "report_ap02",
            "AP-03": "report_ap03"
        },
        
        // Reports that support parameters
        PARAM_SUPPORTED_REPORTS: ["GL-01", "AR-01", "AR-02", "AR-03", "AP-01", "AP-02", "AP-03"],
        
        // Module information
        MODULES: {
            "GL": { name: "FI-GL — General Ledger", icon: "sap-icon://loan" },
            "AR": { name: "FI-AR — Accounts Receivable", icon: "sap-icon://customer" },
            "AP": { name: "FI-AP — Accounts Payable", icon: "sap-icon://supplier" },
            "CO": { name: "CO — Controlling", icon: "sap-icon://pie-chart" },
            "FI": { name: "FI — Finance", icon: "sap-icon://money-bills" }
        },
        
        // Status criticality mapping
        CRITICALITY: {
            NEUTRAL: 0,
            NEGATIVE: 1,
            CRITICAL: 2,
            POSITIVE: 3
        }
    };
});
```

### 3.8 model/formatter.js
Data formatting functions.

```javascript
// model/formatter.js
sap.ui.define([
    "./constants"
], function (Constants) {
    "use strict";

    return {
        
        /**
         * Format job status for display
         */
        formatJobStatus: function (sStatus) {
            var mStatusText = {
                "1": "Scheduled",
                "2": "Running",
                "3": "Completed",
                "4": "Failed",
                "5": "Cancelled"
            };
            return mStatusText[sStatus] || sStatus;
        },
        
        /**
         * Format subscription status
         */
        formatSubscriptionStatus: function (sStatus) {
            return sStatus ? sStatus.charAt(0) + sStatus.slice(1).toLowerCase() : "";
        },
        
        /**
         * Format boolean as Yes/No
         */
        formatYesNo: function (bValue) {
            return bValue ? "Yes" : "No";
        },
        
        /**
         * Format date for display
         */
        formatDate: function (oDate) {
            if (!oDate) { return ""; }
            var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({
                pattern: "yyyy-MM-dd"
            });
            return oDateFormat.format(new Date(oDate));
        },
        
        /**
         * Format datetime for display
         */
        formatDateTime: function (oDate) {
            if (!oDate) { return ""; }
            var oDateFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
                pattern: "yyyy-MM-dd HH:mm:ss"
            });
            return oDateFormat.format(new Date(oDate));
        },
        
        /**
         * Get module display name
         */
        formatModuleName: function (sModuleId) {
            var oModule = Constants.MODULES[sModuleId];
            return oModule ? oModule.name : sModuleId;
        },
        
        /**
         * Get status criticality
         */
        getStatusCriticality: function (sStatus) {
            var mCriticality = {
                "ACTIVE": Constants.CRITICALITY.POSITIVE,
                "PAUSED": Constants.CRITICALITY.CRITICAL,
                "INACTIVE": Constants.CRITICALITY.NEGATIVE,
                "3": Constants.CRITICALITY.POSITIVE, // Completed
                "4": Constants.CRITICALITY.NEGATIVE, // Failed
                "2": Constants.CRITICALITY.CRITICAL  // Running
            };
            return mCriticality[sStatus] || Constants.CRITICALITY.NEUTRAL;
        }
    };
});
```

### 3.9 Refactored Main.controller.js
Orchestration only - delegates to domain controllers.

```javascript
// ext/view/Main.controller.js
sap.ui.define([
    "sap/fe/core/PageController",
    "sap/ui/model/json/JSONModel",
    "../controller/JobConfigController",
    "../controller/SubscriptionController",
    "../controller/CatalogController",
    "../controller/JobHistoryController"
], function (PageController, JSONModel, JobConfigController, SubscriptionController, 
             CatalogController, JobHistoryController) {
    "use strict";

    return PageController.extend("cfa.customfioriapplication.ext.view.Main", {

        onInit: function () {
            PageController.prototype.onInit.apply(this, arguments);

            // Initialize domain controllers
            this._jobConfigController = new JobConfigController();
            this._subscriptionController = new SubscriptionController();
            this._catalogController = new CatalogController();
            this._jobHistoryController = new JobHistoryController();
            
            // Initialize chart model
            this._jobHistoryController.init(this);

            // Setup router
            var that = this;
            try {
                var oRouter = this.getAppComponent().getRouter();
                oRouter.getRoute("DashboardMainPage").attachPatternMatched(function () {
                    setTimeout(function () {
                        that._jobConfigController.refreshTable(that);
                    }, 500);
                });
            } catch (e) {
                // Router not ready
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // NAVIGATION HANDLERS
        // ═══════════════════════════════════════════════════════════════

        onMenuButtonPress: function () {
            var oToolPage = this.byId("toolPage");
            oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
        },

        onItemSelect: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            var oNavContainer = this.byId("pageContainer");
            var oPage = this.byId(sKey);
            
            if (oPage) {
                oNavContainer.to(oPage);
            }
            
            // Load chart data when navigating to history
            if (sKey === "history") {
                this._jobHistoryController.loadChartData(this);
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // JOB CONFIG HANDLERS - Delegate to JobConfigController
        // ═══════════════════════════════════════════════════════════════

        onCreateJobConfig: function () {
            this._jobConfigController.onCreate(this);
        },

        onDeleteJobConfig: function () {
            this._jobConfigController.onDelete(this);
        },

        // ═══════════════════════════════════════════════════════════════
        // SUBSCRIPTION HANDLERS - Delegate to SubscriptionController
        // ═══════════════════════════════════════════════════════════════

        onCreateSubscription: function () {
            this._subscriptionController.showCreateDialog(this);
        },

        onDeleteSubscription: function () {
            this._subscriptionController.onDelete(this);
        },
        
        _createSubscriptionWithReportId: function (sReportId) {
            this._subscriptionController.createWithReportId(this, sReportId);
        },

        // ═══════════════════════════════════════════════════════════════
        // CATALOG HANDLERS - Delegate to CatalogController
        // ═══════════════════════════════════════════════════════════════

        onPreviewReport: function () {
            this._catalogController.onPreview(this);
        },

        onCreateSubscriptionFromCatalog: function () {
            this._catalogController.onCreateSubscription(this, this._subscriptionController);
        },

        // ═══════════════════════════════════════════════════════════════
        // JOB HISTORY HANDLERS - Delegate to JobHistoryController
        // ═══════════════════════════════════════════════════════════════

        onJobHistoryFilterSearch: function () {
            this._jobHistoryController.onFilterSearch(this);
        }
    });
});
```

---

## 4. File Changes Summary

| Action | Path | Lines | Description |
|--------|------|-------|-------------|
| **CREATE** | `ext/controller/BaseController.js` | ~50 | Shared base methods |
| **CREATE** | `ext/controller/JobConfigController.js` | ~80 | Job config CRUD |
| **CREATE** | `ext/controller/SubscriptionController.js` | ~150 | Subscription CRUD + dialog |
| **CREATE** | `ext/controller/CatalogController.js` | ~60 | Catalog preview/create |
| **CREATE** | `ext/controller/JobHistoryController.js` | ~80 | Chart loading/config |
| **CREATE** | `ext/helper/ChartHelper.js` | ~50 | Reusable chart utilities |
| **CREATE** | `model/constants.js` | ~60 | App-wide constants |
| **CREATE** | `model/formatter.js` | ~80 | Data formatters |
| **REFACTOR** | `ext/view/Main.controller.js` | ~100 | Orchestration only |
| **CREATE** | `css/style.css` | ~20 | Custom styles (optional) |

**Total New Files:** 9  
**Estimated Lines:** ~700 (split from ~500 monolithic)

---

## 5. Implementation Order

```
Phase 1: Foundation (30 min)
├── Create model/constants.js
├── Create model/formatter.js
└── Create ext/controller/BaseController.js

Phase 2: Domain Controllers (1 hour)
├── Create ext/controller/JobConfigController.js
├── Create ext/controller/SubscriptionController.js
├── Create ext/controller/CatalogController.js
└── Create ext/controller/JobHistoryController.js

Phase 3: Helpers (30 min)
├── Create ext/helper/ChartHelper.js
└── Create css/style.css (optional)

Phase 4: Integration (30 min)
├── Refactor Main.controller.js to use domain controllers
└── Test all functionality

Phase 5: Cleanup (15 min)
├── Verify no broken references
└── Test edge cases
```

---

## 6. Benefits After Refactoring

| Aspect | Before | After |
|--------|--------|-------|
| **Controller files** | 1 (500+ lines) | 5 (avg 80 lines each) |
| **Finding code** | Scroll through monolith | Go to domain controller |
| **Testing** | Hard to isolate | Easy to unit test |
| **Reusability** | Copy-paste | Import and use |
| **Maintenance** | High risk | Low risk, isolated changes |
| **Onboarding** | Overwhelming | Clear structure |
| **Constants** | Hardcoded | Centralized |
| **Formatting** | Inline | Reusable functions |

---

## 7. Testing Checklist

After refactoring, verify:

- [ ] Sidebar navigation works
- [ ] Job Config: Create, Delete, Refresh
- [ ] Subscription: Create dialog, Create with ReportId, Delete, Navigate
- [ ] Catalog: Preview, Create Subscription
- [ ] Job History: Chart loads, Filter works
- [ ] No console errors
- [ ] All existing functionality preserved

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Test each domain after extraction |
| Import path errors | Use consistent naming convention |
| Context binding issues | Pass `oController` reference to domain controllers |
| Performance impact | Minimal - same code, just organized |

---

## Appendix: Directory Structure

```
webapp/
├── ext/
│   ├── controller/
│   │   ├── BaseController.js         ← NEW
│   │   ├── JobConfigController.js    ← NEW
│   │   ├── SubscriptionController.js ← NEW
│   │   ├── CatalogController.js      ← NEW
│   │   └── JobHistoryController.js   ← NEW
│   ├── view/
│   │   ├── Main.controller.js        ← REFACTORED
│   │   └── Main.view.xml
│   ├── helper/
│   │   └── ChartHelper.js            ← NEW
│   └── fragment/                      ← FUTURE
│       └── (dialogs as fragments)
├── model/
│   ├── constants.js                   ← NEW
│   ├── formatter.js                   ← NEW
│   └── models.js                      ← FUTURE
├── util/                               ← FUTURE
│   ├── ServiceHelper.js
│   └── ErrorHandler.js
├── css/
│   └── style.css                      ← NEW (optional)
├── annotations/
│   └── annotation.xml
├── i18n/
│   └── i18n.properties
├── Component.js
└── manifest.json
```
