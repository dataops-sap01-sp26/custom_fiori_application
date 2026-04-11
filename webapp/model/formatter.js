sap.ui.define([
    "./constants"
], function (Constants) {
    "use strict";

    return {
        
        /**
         * Format job status code to display text (BTCSTATUS domain)
         * @param {string} sStatus - Status code (P/R/S/F/A)
         * @returns {string} Display text
         */
        formatJobStatus: function (sStatus) {
            var mStatusText = {
                "S": "Scheduled",
                "F": "Finished",
                "C": "Cancelled",
                "A": "Aborted"
            };
            return mStatusText[sStatus] || sStatus;
        },
        
        /**
         * Format subscription status with proper casing
         * @param {string} sStatus - Status (A/P/I)
         * @returns {string} Display text
         */
        formatSubscriptionStatus: function (sStatus) {
            var mStatusText = {
                "A": "Active",
                "P": "Paused",
                "I": "Inactive"
            };
            return mStatusText[sStatus] || sStatus;
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
         * Get criticality for subscription status
         * @param {string} sStatus - Status value (A/P/I)
         * @returns {number} Criticality (0-3)
         */
        getSubscriptionStatusCriticality: function (sStatus) {
            var mCriticality = {
                "A": Constants.CRITICALITY.POSITIVE,   // Active
                "P": Constants.CRITICALITY.CRITICAL,   // Paused
                "I": Constants.CRITICALITY.NEGATIVE    // Inactive
            };
            return mCriticality[sStatus] || Constants.CRITICALITY.NEUTRAL;
        },
        
        /**
         * Get criticality for job status (BTCSTATUS)
         * @param {string} sStatus - Status value (P/R/S/F/A)
         * @returns {number} Criticality (0-3)
         */
        getJobStatusCriticality: function (sStatus) {
            var mCriticality = {
                "S": Constants.CRITICALITY.CRITICAL,   // Scheduled
                "F": Constants.CRITICALITY.POSITIVE,   // Finished
                "C": Constants.CRITICALITY.NEUTRAL,    // Cancelled
                "A": Constants.CRITICALITY.NEGATIVE    // Aborted
            };
            return mCriticality[sStatus] || Constants.CRITICALITY.NEUTRAL;
        },
        
        /**
         * Get icon for job status (BTCSTATUS domain)
         * @param {string} sStatus - Status code (P/R/S/F/A)
         * @returns {string} SAP icon URI
         */
        getJobStatusIcon: function (sStatus) {
            var mIcons = {
                "S": "sap-icon://appointment",   // Scheduled
                "F": "sap-icon://accept",        // Finished
                "C": "sap-icon://cancel",        // Cancelled
                "A": "sap-icon://error"          // Aborted
            };
            return mIcons[sStatus] || "sap-icon://question-mark";
        }
    };
});
