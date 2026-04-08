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
            }
        });
    }
);
