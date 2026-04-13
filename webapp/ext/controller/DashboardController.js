sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter"
], function (BaseController, JSONModel, Filter, FilterOperator, Sorter) {
    "use strict";

    /**
     * DashboardController - Handles dashboard data loading and KPI calculations
     */
    return BaseController.extend("z.sap01.cfa.ext.controller.DashboardController", {
        
        /**
         * Initialize dashboard model on the controller's view
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        init: function (oController) {
            var oModel = new JSONModel({
                reportCount: 0,
                totalSubscriptions: 0,
                activeSubscriptions: 0,
                scheduledJobs: 0,
                failedJobs: 0,
                finishedJobs: 0,
                cancelledJobs: 0,
                chartData: [],
                recentSubscriptions: [],
                recentJobs: [],
                isLoading: true
            });
            oController.getView().setModel(oModel, "dashboard");
        },
        
        /**
         * Load all dashboard data in parallel
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        loadDashboardData: function (oController) {
            var that = this;
            var oODataModel = oController.getView().getModel();
            var oDashboard = oController.getView().getModel("dashboard");
            
            oDashboard.setProperty("/isLoading", true);
            
            // Load all data in parallel
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
                oDashboard.setProperty("/scheduledJobs", aResults[2].scheduled);
                oDashboard.setProperty("/failedJobs", aResults[2].failed);
                oDashboard.setProperty("/finishedJobs", aResults[2].finished);
                oDashboard.setProperty("/cancelledJobs", aResults[2].cancelled);
                oDashboard.setProperty("/chartData", aResults[3]);
                oDashboard.setProperty("/recentSubscriptions", aResults[4]);
                oDashboard.setProperty("/recentJobs", aResults[5]);
                oDashboard.setProperty("/isLoading", false);
                
                // Configure chart after data is loaded
                that._configureDashboardChart(oController);
                
            }).catch(function (oError) {
                console.error("Dashboard load error:", oError);
                oDashboard.setProperty("/isLoading", false);
            });
        },
        
        /**
         * Configure dashboard VizFrame chart
         * @private
         */
        _configureDashboardChart: function (oController) {
            var oVizFrame = oController.byId("dashboardChart");
            if (!oVizFrame) { return; }
            
            oVizFrame.setVizProperties({
                plotArea: {
                    dataLabel: { visible: false }
                },
                valueAxis: {
                    title: { visible: true, text: "Job Count" }
                },
                categoryAxis: {
                    title: { visible: true, text: "Date" }
                },
                title: { visible: false },
                legend: {
                    visible: true,
                    title: { visible: false }
                }
            });
        },
        
        /**
         * Load report catalog count (active reports only)
         * @private
         */
        _loadReportCount: function (oModel) {
            return new Promise(function (resolve) {
                var oBinding = oModel.bindList("/ReportCatalog", undefined, undefined, 
                    [new Filter("IsActive", FilterOperator.EQ, true)]);
                
                oBinding.requestContexts(0, 999).then(function (aContexts) {
                    resolve(aContexts.length);
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
            return new Promise(function (resolve) {
                var oTotalBinding = oModel.bindList("/DrsSubscription");
                // Status uses single char: A=Active, P=Paused, I=Inactive
                var oActiveBinding = oModel.bindList("/DrsSubscription", undefined, undefined,
                    [new Filter("Status", FilterOperator.EQ, "A")]);
                
                Promise.all([
                    oTotalBinding.requestContexts(0, 999),
                    oActiveBinding.requestContexts(0, 999)
                ]).then(function (aResults) {
                    resolve({
                        total: aResults[0].length,
                        active: aResults[1].length
                    });
                }).catch(function () {
                    resolve({ total: 0, active: 0 });
                });
            });
        },
        
        /**
         * Load job counts by DrsJobConfig.JobStatus (BTCSTATUS: S, F, C, A, …)
         * @private
         */
        _loadJobCounts: function (oModel) {
            return new Promise(function (resolve) {
                // BTCSTATUS domain: S=Scheduled, F=Finished, C=Cancelled, A=Aborted
                var oScheduledBinding = oModel.bindList("/DrsJobConfig", undefined, undefined,
                    [new Filter("JobStatus", FilterOperator.EQ, "S")]);
                var oFailedBinding = oModel.bindList("/DrsJobConfig", undefined, undefined,
                    [new Filter("JobStatus", FilterOperator.EQ, "A")]);
                var oFinishedBinding = oModel.bindList("/DrsJobConfig", undefined, undefined,
                    [new Filter("JobStatus", FilterOperator.EQ, "F")]);
                var oCancelledBinding = oModel.bindList("/DrsJobConfig", undefined, undefined,
                    [new Filter("JobStatus", FilterOperator.EQ, "C")]);
                
                Promise.all([
                    oScheduledBinding.requestContexts(0, 999),
                    oFailedBinding.requestContexts(0, 999),
                    oFinishedBinding.requestContexts(0, 999),
                    oCancelledBinding.requestContexts(0, 999)
                ]).then(function (aResults) {
                    resolve({
                        scheduled: aResults[0].length,
                        failed: aResults[1].length,
                        finished: aResults[2].length,
                        cancelled: aResults[3].length
                    });
                }).catch(function () {
                    resolve({ scheduled: 0, failed: 0, finished: 0, cancelled: 0 });
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
                    [new Sorter("JobDate", true)]); // descending
                
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
                        return (a.JobDate || "").localeCompare(b.JobDate || "");
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
                    [new Sorter("CreatedAt", true)]); // descending
                
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
                    [new Sorter("CreatedAt", true)]); // descending
                
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
         * @param {sap.fe.core.PageController} oController - Main controller reference
         * @param {string} sKey - Page key (catalog, subscriptions, etc.)
         */
        navigateToPage: function (oController, sKey) {
            var mReportRoutes = {
                "exports":     "ExportsListPage",
                "report_ap01": "AP01ListPage",
                "report_ap02": "AP02ListPage",
                "report_ap03": "AP03ListPage",
                "report_ar01": "AR01ListPage",
                "report_ar02": "AR02ListPage",
                "report_ar03": "AR03ListPage",
                "report_gl01": "GL01ListPage"
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
                if (oSideNav) {
                    oSideNav.setSelectedKey(sKey);
                }
            } else {
                console.warn("DashboardController: Page not found for key:", sKey);
            }
        },
        
    });
});
