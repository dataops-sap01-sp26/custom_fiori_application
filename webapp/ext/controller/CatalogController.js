sap.ui.define([
    "./BaseController",
    "cfa/customfioriapplication/model/constants"
], function (BaseController, Constants) {
    "use strict";

    /**
     * CatalogController - Handles Report Catalog actions
     */
    return BaseController.extend("cfa.customfioriapplication.ext.controller.CatalogController", {
        
        /**
         * Preview selected report - navigates to report-specific sidebar page
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        onPreview: function (oController) {
            var aContexts = this.getTableSelectedContexts(oController, "catalogTable");
            
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
            
            var sPageKey = Constants.REPORT_PAGE_MAP[sReportId];
            
            if (sPageKey) {
                // Navigate to sidebar page
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
        
        /**
         * Create subscription with selected report pre-filled
         * @param {sap.fe.core.PageController} oController - Main controller reference
         * @param {object} oSubscriptionController - SubscriptionController instance
         */
        onCreateSubscription: function (oController, oSubscriptionController) {
            var aContexts = this.getTableSelectedContexts(oController, "catalogTable");
            
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
            
            // Delegate to SubscriptionController
            oSubscriptionController.createWithReportId(oController, sReportId);
        }
    });
});
