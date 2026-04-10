sap.ui.define([
    "./constants"
], function (Constants) {
    "use strict";

    return {
        
        /**
         * Format job status code to display text
         * @param {string} sStatus - Status code (1-5)
         * @returns {string} Display text
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
         * Format subscription status with proper casing
         * @param {string} sStatus - Status (ACTIVE, PAUSED, INACTIVE)
         * @returns {string} Title case status
         */
        formatSubscriptionStatus: function (sStatus) {
            if (!sStatus) { return ""; }
            return sStatus.charAt(0) + sStatus.slice(1).toLowerCase();
        },
        
        /**
         * Format boolean as Yes/No
         * @param {boolean} bValue - Boolean value
         * @returns {string} Yes or No
         */
        formatYesNo: function (bValue) {
            return bValue ? "Yes" : "No";
        },
        
        /**
         * Format boolean as Active/Inactive
         * @param {boolean} bValue - Boolean value
         * @returns {string} Active or Inactive
         */
        formatActiveInactive: function (bValue) {
            return bValue ? "Active" : "Inactive";
        },
        
        /**
         * Format date for display (YYYY-MM-DD)
         * @param {Date|string} oDate - Date object or string
         * @returns {string} Formatted date string
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
         * @param {Date|string} oDate - Date/time object or string
         * @returns {string} Formatted datetime string
         */
        formatDateTime: function (oDate) {
            if (!oDate) { return ""; }
            var oDateFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
                pattern: "yyyy-MM-dd HH:mm:ss"
            });
            return oDateFormat.format(new Date(oDate));
        },
        
        /**
         * Get module display name from module ID
         * @param {string} sModuleId - Module ID (GL, AR, AP, etc.)
         * @returns {string} Module display name
         */
        formatModuleName: function (sModuleId) {
            var oModule = Constants.MODULES[sModuleId];
            return oModule ? oModule.name : sModuleId;
        },
        
        /**
         * Get criticality value for status
         * @param {string} sStatus - Status value
         * @returns {number} Criticality (0-3)
         */
        getStatusCriticality: function (sStatus) {
            var mCriticality = {
                "ACTIVE": Constants.CRITICALITY.POSITIVE,
                "PAUSED": Constants.CRITICALITY.CRITICAL,
                "INACTIVE": Constants.CRITICALITY.NEGATIVE,
                "3": Constants.CRITICALITY.POSITIVE,   // Completed
                "4": Constants.CRITICALITY.NEGATIVE,   // Failed
                "2": Constants.CRITICALITY.CRITICAL    // Running
            };
            return mCriticality[sStatus] || Constants.CRITICALITY.NEUTRAL;
        },
        
        /**
         * Get icon for job status
         * @param {string} sStatus - Status code
         * @returns {string} SAP icon URI
         */
        getJobStatusIcon: function (sStatus) {
            var mIcons = {
                "1": "sap-icon://appointment",
                "2": "sap-icon://synchronize",
                "3": "sap-icon://accept",
                "4": "sap-icon://error",
                "5": "sap-icon://cancel"
            };
            return mIcons[sStatus] || "sap-icon://question-mark";
        }
    };
});
