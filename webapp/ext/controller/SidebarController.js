sap.ui.define([
    "./BaseController",
    "sap/ui/model/Sorter",
    "sap/tnt/NavigationListItem"
], function (BaseController, Sorter, NavigationListItem) {
    "use strict";

    /**
     * Module-to-icon mapping
     */
    var MODULE_ICONS = {
        "GL": "sap-icon://accounting-document-verification",
        "AR": "sap-icon://customer-financial-fact-sheet",
        "AP": "sap-icon://money-bills",
        "FI": "sap-icon://database",
        "CO": "sap-icon://cost-center"
    };

    /**
     * SidebarController - Handles dynamic sidebar report menu rendering
     * Loads authorized reports from /ReportCatalog (DCL filtered by user's ZDRS_REP access)
     * 
     * Key Features:
     * - Only shows reports user has access to (via backend DCL)
     * - Groups reports by module (GL, AR, AP)
     * - Dynamically creates NavigationListItems
     * - Hides Reports group if no reports authorized
     */
    return BaseController.extend("z.sap01.cfa.ext.controller.SidebarController", {
        
        /**
         * Load authorized reports and render sidebar menu
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        loadReportMenu: function (oController) {
            var that = this;
            var oModel = oController.getView().getModel();
            
            // Bind to ReportCatalog - DCL automatically filters by user's ZDRS_REP access
            var oBinding = oModel.bindList("/ReportCatalog", undefined, [
                new Sorter("ModuleId", false),
                new Sorter("SortOrder", false)
            ]);
            
            oBinding.requestContexts(0, 999).then(function (aContexts) {
                var aReports = aContexts.map(function (oCtx) {
                    return oCtx.getObject();
                });
                
                // Filter to active reports only
                var aActiveReports = aReports.filter(function (r) {
                    return r.IsActive === "X" || r.IsActive === true;
                });
                
                console.log("SidebarController: Loaded " + aActiveReports.length + " authorized reports");
                that._renderReportMenu(oController, aActiveReports);
            }).catch(function (oError) {
                console.error("SidebarController: Failed to load reports", oError);
                // Graceful degradation - hide reports group if load fails
                var oReportsGroup = oController.byId("reportsNavigationGroup");
                if (oReportsGroup) {
                    oReportsGroup.setVisible(false);
                }
            });
        },
        
        /**
         * Render report navigation items dynamically
         * @param {sap.fe.core.PageController} oController - Main controller
         * @param {Array} aReports - Authorized reports from catalog
         */
        _renderReportMenu: function (oController, aReports) {
            var oReportsGroup = oController.byId("reportsNavigationGroup");
            
            if (!oReportsGroup) {
                console.error("SidebarController: reportsNavigationGroup not found in view");
                return;
            }
            
            // Clear existing items
            oReportsGroup.destroyItems();
            
            if (aReports.length === 0) {
                // No reports authorized - hide the group
                oReportsGroup.setVisible(false);
                console.warn("SidebarController: No authorized reports found for user");
                return;
            }
            
            // Group reports by module
            var mGroupedReports = this._groupByModule(aReports);
            
            // Sort modules: GL, AR, AP, others
            var aModules = Object.keys(mGroupedReports).sort(function (a, b) {
                var order = { "GL": 1, "AR": 2, "AP": 3 };
                return (order[a] || 99) - (order[b] || 99);
            });
            
            // Create navigation items
            aModules.forEach(function (sModule) {
                var aModuleReports = mGroupedReports[sModule];
                
                aModuleReports.forEach(function (oReport) {
                    var sIcon = MODULE_ICONS[sModule] || "sap-icon://document";
                    var sKey = "report_" + oReport.ReportId.toLowerCase().replace(/-/g, "");
                    
                    var oItem = new NavigationListItem({
                        text: oReport.ReportName || oReport.ReportId,
                        icon: sIcon,
                        key: sKey
                    });
                    
                    oReportsGroup.addItem(oItem);
                });
            });
            
            // Show group with dynamically loaded items
            oReportsGroup.setVisible(true);
            console.log("SidebarController: Rendered " + aReports.length + " report items in sidebar");
        },
        
        /**
         * Group reports by module prefix (GL, AR, AP)
         * @param {Array} aReports - Report list
         * @returns {Object} Module-grouped reports { "GL": [...], "AR": [...] }
         */
        _groupByModule: function (aReports) {
            var mGroups = {};
            
            aReports.forEach(function (oReport) {
                var sModule = oReport.ModuleId || "OTHER";
                
                // Extract module from ReportId if ModuleId not set
                // Example: "FI-GL-01" → "GL", "FI-AR-01" → "AR"
                if (sModule === "FI" || sModule === "OTHER") {
                    var sReportId = oReport.ReportId || "";
                    var aIdParts = sReportId.split("-");
                    if (aIdParts.length >= 2) {
                        sModule = aIdParts[1]; // "FI-GL-01" → "GL"
                    }
                }
                
                if (!mGroups[sModule]) {
                    mGroups[sModule] = [];
                }
                mGroups[sModule].push(oReport);
            });
            
            return mGroups;
        }
    });
});
