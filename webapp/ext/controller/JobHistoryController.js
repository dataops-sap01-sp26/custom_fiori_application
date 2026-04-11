sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    /**
     * JobHistoryController - Handles Job History and Chart operations
     */
    return BaseController.extend("cfa.customfioriapplication.ext.controller.JobHistoryController", {
        
        _aHistoryData: [],
        
        /**
         * Initialize chart model on the controller's view
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        init: function (oController) {
            oController.getView().setModel(new JSONModel({ chartData: [] }), "chartModel");
        },
        
        /**
         * Configure VizFrame chart properties
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
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
        
        /**
         * Load chart data from JobHistoryAnalytics entity
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        loadChartData: function (oController) {
            var that = this;
            
            // Configure chart once when loading
            this.configureChart(oController);
            
            var oModel = oController.getView().getModel();
            var oBinding = oModel.bindList("/JobHistoryAnalytics", undefined, undefined, undefined, {
                $orderby: "JobDate desc"
            });
            
            oBinding.requestContexts(0, 999).then(function (aContexts) {
                var aRawData = aContexts.map(function (oCtx) {
                    return oCtx.getObject();
                });
                
                // Cache for potential filtering
                that._aHistoryData = aRawData;
                that._aggregateChartData(oController, aRawData);
                
            }).catch(function (oError) {
                console.error("JobHistory chart data load error:", oError);
            });
        },
        
        /**
         * Aggregate data by JobDate + JobStatus for chart visualization
         * @param {sap.fe.core.PageController} oController - Main controller reference
         * @param {Array} aData - Raw data from OData
         * @private
         */
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
                return a.JobDate.localeCompare(b.JobDate);
            });
            
            oController.getView().getModel("chartModel").setProperty("/chartData", aChartData);
        },
        
        /**
         * Handler for FilterBar search - reloads chart data
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        onFilterSearch: function (oController) {
            this.loadChartData(oController);
        },
        
        /**
         * Get cached history data
         * @returns {Array} Cached history data
         */
        getCachedData: function () {
            return this._aHistoryData;
        }
    });
});
