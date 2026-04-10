sap.ui.define(
    [
        'sap/fe/core/PageController',
        'sap/m/MessageBox',
        'sap/m/MessageToast',
        'sap/ui/model/json/JSONModel'
    ],
    function (PageController, MessageBox, MessageToast, JSONModel) {
        'use strict';

        return PageController.extend('cfa.customfioriapplication.ext.view.Main', {

            onInit: function () {
                PageController.prototype.onInit.apply(this, arguments);

                // Khởi tạo chartModel rỗng để VizFrame binding không bị lỗi khi view mount
                this.getView().setModel(new JSONModel({ chartData: [] }), "chartModel");

                var that = this;
                try {
                    var oRouter = this.getAppComponent().getRouter();
                    oRouter.getRoute("DashboardMainPage").attachPatternMatched(function () {
                        setTimeout(function () {
                            that._refreshJobConfigTable();
                        }, 500);
                    });
                } catch (e) {
                    // Nếu router chưa ready, bỏ qua
                }
            },

            // ─── CHART CONFIG ─────────────────────────────────────────────────────────
            // Set vizProperties sau khi view rendered (theo cách drs_fiori_app làm)
            _configureChart: function () {
                var oVizFrame = this.byId("jobTrendChart");
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

            // ─── LOAD CHART DATA ──────────────────────────────────────────────────────
            _loadHistoryChart: function () {
                var that = this;

                // Configure chart một lần khi load lần đầu
                this._configureChart();

                var oModel = this.getView().getModel();
                var oBinding = oModel.bindList("/JobHistoryAnalytics", undefined, undefined, undefined, {
                    $orderby: "JobDate desc"
                });

                oBinding.requestContexts(0, 999).then(function (aContexts) {
                    var aRawData = aContexts.map(function (oCtx) {
                        return oCtx.getObject();
                    });

                    // Cache lại để filter có thể dùng lại
                    that._aHistoryData = aRawData;
                    that._aggregateChartData(aRawData);

                }).catch(function (oError) {
                    // Chart load thất bại — không throw, chỉ log console
                    console.error("JobHistory chart data load error:", oError);
                });
            },

            // Aggregate theo JobDate + JobStatus rồi đẩy vào chartModel
            _aggregateChartData: function (aData) {
                var mAggregated = {};

                aData.forEach(function (oItem) {
                    var sDate   = oItem.JobDate   || "";
                    var sStatus = oItem.JobStatus || "Unknown";
                    var sKey    = sDate + "|" + sStatus;

                    if (!mAggregated[sKey]) {
                        mAggregated[sKey] = {
                            JobDate:       sDate,
                            JobStatus:     sStatus,
                            JobCountTotal: 0
                        };
                    }
                    mAggregated[sKey].JobCountTotal += (oItem.JobCountTotal || 1);
                });

                var aChartData = Object.values(mAggregated).sort(function (a, b) {
                    return a.JobDate.localeCompare(b.JobDate);
                });

                this.getView().getModel("chartModel").setProperty("/chartData", aChartData);
            },

            // ─── EVENTS ───────────────────────────────────────────────────────────────

            // Khi user nhấn "Go" trên FilterBar → reload chart
            onJobHistoryFilterSearch: function () {
                this._loadHistoryChart();
            },


            // ─── MENU NAVIGATION ──────────────────────────────────────────────────────

            onMenuButtonPress: function () {
                var oToolPage = this.byId("toolPage");
                oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
            },

            onItemSelect: function (oEvent) {
                var oItem = oEvent.getParameter("item");
                var sKey  = oItem.getKey();

                if (!sKey) { return; }

                this.byId("pageContainer").to(this.byId(sKey));

                // Khi chuyển sang tab History, tự load chart data
                if (sKey === "history") {
                    this._loadHistoryChart();
                }
            },

            // ─── JOB CONFIG ACTIONS ───────────────────────────────────────────────────

            _refreshJobConfigTable: function () {
                try {
                    this.getView().getModel().refresh();
                } catch (ex) {
                    // ignore
                }
            },

            onCreateJobConfig: function (oEvent) {
                var oExtensionAPI = this.getExtensionAPI();
                var oListBinding  = oExtensionAPI.getModel().bindList("/DrsJobConfig");
                oExtensionAPI.getEditFlow().createDocument(oListBinding, {
                    creationMode: "NewPage"
                });
            },

            onDeleteJobConfig: function (oEvent) {
                var that = this;
                var oTable    = this.byId("jobConfigTable");
                var aContexts = oTable.getSelectedContexts ? oTable.getSelectedContexts() : [];

                if ((!aContexts || aContexts.length === 0) && this.byId("jobConfigTable::Table")) {
                    aContexts = this.byId("jobConfigTable::Table").getSelectedContexts() || [];
                }

                if (aContexts && aContexts.length > 0) {
                    var aDraftContexts  = [];
                    var aActiveContexts = [];

                    aContexts.forEach(function (oContext) {
                        if (oContext.getProperty("IsActiveEntity") === false) {
                            aDraftContexts.push(oContext);
                        } else {
                            aActiveContexts.push(oContext);
                        }
                    });

                    var iTotal     = aContexts.length;
                    var sDraftInfo = aDraftContexts.length  > 0 ? aDraftContexts.length  + " draft(s) will be discarded. "         : "";
                    var sActiveInfo= aActiveContexts.length > 0 ? aActiveContexts.length + " active record(s) will be deleted." : "";

                    MessageBox.confirm("Are you sure?\n" + sDraftInfo + sActiveInfo, {
                        title: "Confirm Deletion (" + iTotal + " selected)",
                        onClose: function (sAction) {
                            if (sAction === MessageBox.Action.OK) {
                                var aAllPromises = [];

                                aActiveContexts.forEach(function (oContext) {
                                    aAllPromises.push(oContext.delete());
                                });

                                var oModel = that.getView().getModel();
                                aDraftContexts.forEach(function (oContext) {
                                    var sDiscardAction = oContext.getPath() + "/com.sap.gateway.srvd.zsd_drs_main_o4.v0001.Discard";
                                    var oDiscardOp     = oModel.bindContext(sDiscardAction + "(...)");
                                    aAllPromises.push(oDiscardOp.execute());
                                });

                                Promise.all(aAllPromises).then(function () {
                                    MessageToast.show("Successfully processed " + iTotal + " record(s).");
                                    that._refreshJobConfigTable();
                                }).catch(function (oError) {
                                    MessageBox.error("Error: " + (oError ? oError.message : "Unknown error"));
                                    that._refreshJobConfigTable();
                                });
                            }
                        }
                    });
                } else {
                    MessageToast.show("Please select a record to delete.");
                }
            },

            // ─── SUBSCRIPTION ACTIONS ─────────────────────────────────────────────────

            /**
             * Show dialog to select Report ID before creating subscription
             * This ensures createReportParams action can create the correct parameter record
             */
            onCreateSubscription: function (oEvent) {
                var that = this;
                
                // Create dialog if not exists
                if (!this._oReportSelectDialog) {
                    this._oReportSelectDialog = new sap.m.Dialog({
                        title: "Create New Subscription",
                        contentWidth: "400px",
                        content: [
                            new sap.m.VBox({
                                items: [
                                    new sap.m.Label({ text: "Select Report Type", required: true }),
                                    new sap.m.Select({
                                        id: "reportIdSelect",
                                        width: "100%",
                                        items: [
                                            new sap.ui.core.Item({ key: "", text: "-- Select a Report --" }),
                                            new sap.ui.core.Item({ key: "GL-01", text: "GL-01 - GL Account Balances" }),
                                            new sap.ui.core.Item({ key: "AR-01", text: "AR-01 - Customer Open Items" }),
                                            new sap.ui.core.Item({ key: "AR-02", text: "AR-02 - Customer Balances" }),
                                            new sap.ui.core.Item({ key: "AR-03", text: "AR-03 - AR Aging Report" }),
                                            new sap.ui.core.Item({ key: "AP-01", text: "AP-01 - Vendor Open Items" }),
                                            new sap.ui.core.Item({ key: "AP-02", text: "AP-02 - Vendor Balances" }),
                                            new sap.ui.core.Item({ key: "AP-03", text: "AP-03 - AP Aging Report" })
                                        ]
                                    }),
                                    new sap.m.Text({
                                        text: "Note: GL-01 will auto-create parameter section with defaults.",
                                        wrapping: true
                                    }).addStyleClass("sapUiTinyMarginTop sapUiTinyMarginBottom")
                                ]
                            }).addStyleClass("sapUiSmallMargin")
                        ],
                        beginButton: new sap.m.Button({
                            text: "Create",
                            type: "Emphasized",
                            press: function () {
                                var sReportId = sap.ui.getCore().byId("reportIdSelect").getSelectedKey();
                                if (!sReportId) {
                                    MessageToast.show("Please select a Report Type");
                                    return;
                                }
                                that._oReportSelectDialog.close();
                                that._createSubscriptionWithReportId(sReportId);
                            }
                        }),
                        endButton: new sap.m.Button({
                            text: "Cancel",
                            press: function () {
                                that._oReportSelectDialog.close();
                            }
                        })
                    });
                    this.getView().addDependent(this._oReportSelectDialog);
                }
                
                // Reset selection and open dialog
                sap.ui.getCore().byId("reportIdSelect").setSelectedKey("");
                this._oReportSelectDialog.open();
            },

            /**
             * Create subscription draft with ReportId, then call createReportParams action
             * @param {string} sReportId - Selected report ID (e.g., "GL-01")
             */
            _createSubscriptionWithReportId: function (sReportId) {
                var that = this;
                var oExtensionAPI = this.getExtensionAPI();
                var oModel = oExtensionAPI.getModel();
                var oListBinding = oModel.bindList("/DrsSubscription");

                // Step 1: Create draft with ReportId pre-filled
                var oContext = oListBinding.create({
                    ReportId: sReportId
                }, true); // bSkipRefresh = true

                oContext.created().then(function () {
                    // Step 2: Call createReportParams action
                    // Backend reads ReportId and creates param record (e.g., _ParamGL01)
                    var sActionPath = oContext.getPath() +
                        "/com.sap.gateway.srvd.zsd_drs_main_o4.v0001.createReportParams";
                    var oOperation = oModel.bindContext(sActionPath + "(...)");
                    
                    return oOperation.execute().then(function () {
                        // Step 3: Navigate to Object Page using router
                        that._navigateToSubscription(oContext);
                    });
                }).catch(function (oError) {
                    console.error("Create subscription failed:", oError);
                    // If createReportParams fails, still navigate (user can click button manually)
                    MessageBox.warning(
                        "Subscription created but parameters could not be initialized automatically. " +
                        "You can click 'Create Report Parameters' button on the detail page.",
                        {
                            onClose: function () {
                                that._navigateToSubscription(oContext);
                            }
                        }
                    );
                });
            },

            /**
             * Navigate to Subscription Object Page using router
             * @param {sap.ui.model.odata.v4.Context} oContext - The subscription context
             */
            _navigateToSubscription: function (oContext) {
                var oRouter = this.getAppComponent().getRouter();
                var sSubscrUuid = oContext.getProperty("SubscrUuid");
                var sSubscrId = oContext.getProperty("SubscrId");
                var bIsActiveEntity = oContext.getProperty("IsActiveEntity");
                
                // Build OData key string: SubscrUuid=guid,SubscrId='value',IsActiveEntity=bool
                var sKey = "SubscrUuid=" + sSubscrUuid + 
                           ",SubscrId='" + sSubscrId + "'" +
                           ",IsActiveEntity=" + bIsActiveEntity;
                
                oRouter.navTo("DrsSubscriptionObjectPage", {
                    key: sKey
                });
            },

            /**
             * Smart delete: Handles both active records (DELETE) and drafts (Discard action)
             */
            onDeleteSubscription: function (oEvent) {
                var that = this;
                var oTable = this.byId("subscrTable");
                var aContexts = oTable.getSelectedContexts ? oTable.getSelectedContexts() : [];

                // Fallback: try inner table
                if ((!aContexts || aContexts.length === 0) && this.byId("subscrTable::Table")) {
                    aContexts = this.byId("subscrTable::Table").getSelectedContexts() || [];
                }

                if (aContexts && aContexts.length > 0) {
                    var aDraftContexts = [];
                    var aActiveContexts = [];

                    aContexts.forEach(function (oContext) {
                        if (oContext.getProperty("IsActiveEntity") === false) {
                            aDraftContexts.push(oContext);
                        } else {
                            aActiveContexts.push(oContext);
                        }
                    });

                    var iTotal = aContexts.length;
                    var sMsg = "";
                    if (aDraftContexts.length > 0 && aActiveContexts.length > 0) {
                        sMsg = aDraftContexts.length + " draft(s) will be discarded.\n" +
                               aActiveContexts.length + " active record(s) will be deleted.\n\nContinue?";
                    } else if (aDraftContexts.length > 0) {
                        sMsg = "Discard " + aDraftContexts.length + " draft subscription(s)?";
                    } else {
                        sMsg = "Delete " + aActiveContexts.length + " active subscription(s)?";
                    }

                    MessageBox.confirm(sMsg, {
                        title: "Confirm Deletion",
                        onClose: function (sAction) {
                            if (sAction === MessageBox.Action.OK) {
                                var oModel = that.getView().getModel();
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
                                    MessageToast.show("Deleted " + iTotal + " subscription(s) successfully.");
                                    that.getView().getModel().refresh();
                                }).catch(function (oError) {
                                    MessageBox.error("Error occurred while deleting subscriptions.");
                                    that.getView().getModel().refresh();
                                });
                            }
                        }
                    });
                } else {
                    MessageToast.show("Please select at least one subscription to delete.");
                }
            },

            // ═══════════════════════════════════════════════════════════════
            // REPORT CATALOG ACTIONS
            // ═══════════════════════════════════════════════════════════════

            /**
             * Preview selected report - navigates to report-specific sidebar page
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
                
                // Map ReportId to sidebar page key
                var mPreviewPages = {
                    "GL-01": "report_gl01",
                    "AR-01": "report_ar01",
                    "AR-02": "report_ar02",
                    "AR-03": "report_ar03",
                    "AP-01": "report_ap01",
                    "AP-02": "report_ap02",
                    "AP-03": "report_ap03"
                };
                
                var sPageKey = mPreviewPages[sReportId];
                
                if (sPageKey) {
                    // Navigate to sidebar page
                    var oNavContainer = this.byId("pageContainer");
                    var oTargetPage = this.byId(sPageKey);
                    if (oTargetPage) {
                        oNavContainer.to(oTargetPage);
                        MessageToast.show("Showing " + sReportId + " preview");
                    } else {
                        MessageToast.show("Preview page not found for " + sReportId);
                    }
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
            }
        });
    }
);
