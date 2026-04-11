sap.ui.define([], function () {
    "use strict";

    /**
     * ChartHelper - Reusable chart configuration utilities
     */
    return {
        
        /**
         * Configure a VizFrame with standard job trend settings
         * @param {sap.viz.ui5.controls.VizFrame} oVizFrame - VizFrame control
         * @param {object} [oOptions] - Optional override settings
         */
        configureJobTrendChart: function (oVizFrame, oOptions) {
            if (!oVizFrame) { return; }
            
            var oDefaults = {
                plotArea: {
                    dataLabel: { visible: false },
                    colorPalette: ["#5cbae6", "#b6d957", "#fac364", "#8cd3ff", "#93b9c6"]
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
            };
            
            // Merge options
            var oConfig = Object.assign({}, oDefaults, oOptions || {});
            oVizFrame.setVizProperties(oConfig);
        },
        
        /**
         * Configure a VizFrame for subscription statistics
         * @param {sap.viz.ui5.controls.VizFrame} oVizFrame - VizFrame control
         */
        configureSubscriptionChart: function (oVizFrame) {
            if (!oVizFrame) { return; }
            
            oVizFrame.setVizProperties({
                plotArea: {
                    dataLabel: { visible: true },
                    colorPalette: ["#27ae60", "#f39c12", "#e74c3c"]
                },
                title: { visible: false },
                legend: {
                    visible: true,
                    title: { visible: true, text: "Status" }
                }
            });
        },
        
        /**
         * Aggregate raw data by date and status fields
         * @param {Array} aData - Raw data array
         * @param {string} sDateField - Field name for date grouping
         * @param {string} sStatusField - Field name for status grouping
         * @param {string} sCountField - Field name for count aggregation
         * @returns {Array} Aggregated data sorted by date
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
                return (a[sDateField] || "").localeCompare(b[sDateField] || "");
            });
        },
        
        /**
         * Aggregate data by a single field
         * @param {Array} aData - Raw data array
         * @param {string} sGroupField - Field name to group by
         * @param {string} sCountField - Field name for count (optional)
         * @returns {Array} Aggregated data with count property
         */
        aggregateByField: function (aData, sGroupField, sCountField) {
            var mAggregated = {};
            
            aData.forEach(function (oItem) {
                var sKey = oItem[sGroupField] || "Unknown";
                
                if (!mAggregated[sKey]) {
                    mAggregated[sKey] = {};
                    mAggregated[sKey][sGroupField] = sKey;
                    mAggregated[sKey].count = 0;
                }
                mAggregated[sKey].count += (sCountField ? (oItem[sCountField] || 1) : 1);
            });
            
            return Object.values(mAggregated);
        },
        
        /**
         * Get color for job status
         * @param {string} sStatus - Status code
         * @returns {string} Hex color code
         */
        getStatusColor: function (sStatus) {
            var mColors = {
                "1": "#3498db", // Scheduled - Blue
                "2": "#f39c12", // Running - Orange
                "3": "#27ae60", // Completed - Green
                "4": "#e74c3c", // Failed - Red
                "5": "#95a5a6"  // Cancelled - Gray
            };
            return mColors[sStatus] || "#bdc3c7";
        }
    };
});
