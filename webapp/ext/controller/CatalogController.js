sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Sorter",
    "sap/m/GenericTile",
    "sap/m/TileContent",
    "sap/m/ImageContent",
    "sap/m/Title",
    "sap/m/Text",
    "sap/m/HBox",
    "sap/m/VBox",
    "sap/m/FlexWrap",
    "sap/m/ActionSheet",
    "sap/m/Button"
], function (BaseController, JSONModel, Sorter,
    GenericTile, TileContent, ImageContent, Title, Text, HBox, VBox, FlexWrap,
    ActionSheet, Button) {
    "use strict";

    var REPORT_PAGE_MAP = {
        "GL-01": "report_gl01",
        "AR-01": "report_ar01",
        "AR-02": "report_ar02",
        "AR-03": "report_ar03",
        "AP-01": "report_ap01",
        "AP-02": "report_ap02",
        "AP-03": "report_ap03"
    };

    /**
     * Module group metadata for tile grouping
     */
    var MODULE_GROUPS = {
        "GL": { 
            title: "FI:GL - General Ledger", 
            icon: "sap-icon://accounting-document-verification", 
            sort: 1 
        },
        "AR": { 
            title: "FI:AR - Accounts Receivable", 
            icon: "sap-icon://customer", 
            sort: 2 
        },
        "AP": { 
            title: "FI:AP - Accounts Payable", 
            icon: "sap-icon://supplier", 
            sort: 3 
        },
        "CO": { 
            title: "CO:Controlling", 
            icon: "sap-icon://cost-center", 
            sort: 4 
        },
        "FI": { 
            title: "FI:Finance", 
            icon: "sap-icon://accounting-document-verification", 
            sort: 5 
        }
    };

    /**
     * Resolve module key from report data
     * Priority: ModuleId (if known) → ReportId prefix → "OTHER"
     */
    function resolveModule(oReport) {
        var sModule = oReport.ModuleId;
        if (MODULE_GROUPS[sModule] && sModule !== "FI") {
            return sModule;
        }
        var sId = oReport.ReportId || "";
        var sPrefix = sId.replace(/[-_]?\d+$/, "").toUpperCase();
        if (MODULE_GROUPS[sPrefix]) {
            return sPrefix;
        }
        return sModule || "OTHER";
    }

    /**
     * CatalogController - Handles Report Catalog tile-based view
     * Shows only active reports with ActionSheet for Preview/Create Subscription
     */
    return BaseController.extend("z.sap01.cfa.ext.controller.CatalogController", {
        
        _allReports: [],
        _oActionSheet: null,

        // ═══════════════════════════════════════════════════════════════
        // INITIALIZATION & DATA LOADING
        // ═══════════════════════════════════════════════════════════════

        /**
         * Initialize catalog and load data
         */
        initCatalog: function (oController) {
            this.loadCatalog(oController);
        },

        /**
         * Load active reports from OData ReportCatalog entity
         */
        loadCatalog: function (oController) {
            var that = this;
            var oModel = oController.getModel();
            
            var oBinding = oModel.bindList("/ReportCatalog", undefined, [
                new Sorter("ModuleId", false),
                new Sorter("SortOrder", false)
            ]);
            
            oBinding.requestContexts(0, 999).then(function (aContexts) {
                var aReports = aContexts.map(function (oCtx) {
                    return oCtx.getObject();
                });
                
                // Filter to show only active reports
                that._allReports = aReports.filter(function (r) {
                    return r.IsActive === "X" || r.IsActive === true;
                });
                
                that._renderGroupedTiles(oController);
            }).catch(function (oError) {
                console.error("CatalogController: Failed to load reports", oError);
                that._allReports = [];
                that._renderGroupedTiles(oController);
            });
        },

        // ═══════════════════════════════════════════════════════════════
        // TILE RENDERING
        // ═══════════════════════════════════════════════════════════════

        /**
         * Render tiles grouped by module
         */
        _renderGroupedTiles: function (oController) {
            var aReports = this._allReports || [];
            var oContainer = oController.byId("catalogTileContainer");
            
            if (!oContainer) {
                console.error("CatalogController: catalogTileContainer not found");
                return;
            }
            oContainer.destroyItems();

            // Group by resolved module
            var mGroups = {};
            aReports.forEach(function (r) {
                var sModule = resolveModule(r);
                if (!mGroups[sModule]) {
                    mGroups[sModule] = [];
                }
                mGroups[sModule].push(r);
            });

            // Sort groups by predefined order
            var aSortedKeys = Object.keys(mGroups).sort(function (a, b) {
                var nA = (MODULE_GROUPS[a] && MODULE_GROUPS[a].sort) || 99;
                var nB = (MODULE_GROUPS[b] && MODULE_GROUPS[b].sort) || 99;
                return nA - nB;
            });

            var that = this;

            aSortedKeys.forEach(function (sModule) {
                var oGroupMeta = MODULE_GROUPS[sModule] || { 
                    title: sModule, 
                    icon: "sap-icon://document", 
                    sort: 99 
                };
                var aGroupReports = mGroups[sModule];

                // Group header
                var oGroupTitle = new Title({
                    text: oGroupMeta.title,
                    level: "H3"
                }).addStyleClass("sapUiSmallMarginBottom drsCatalogGroupTitle");

                // Tile row
                var oTileRow = new HBox({
                    wrap: FlexWrap.Wrap
                }).addStyleClass("drsCatalogTileRow");

                aGroupReports.forEach(function (oReport) {
                    var oTile = new GenericTile({
                        header: oReport.ReportName || oReport.ReportId,
                        subheader: oReport.ReportId,
                        frameType: "OneByOne",
                        state: "Loaded",
                        press: function (oEvent) {
                            that._onTilePress(oController, oReport.ReportId, oEvent.getSource());
                        }
                    }).addStyleClass("sapUiTinyMarginEnd sapUiTinyMarginBottom drsCatalogTile");

                    oTile.addTileContent(new TileContent({
                        content: new ImageContent({
                            src: oGroupMeta.icon
                        })
                    }));

                    oTileRow.addItem(oTile);
                });

                // Group VBox
                var oGroupBox = new VBox({
                    items: [oGroupTitle, oTileRow]
                }).addStyleClass("sapUiMediumMarginBottom");

                oContainer.addItem(oGroupBox);
            });

            // No results message
            if (aSortedKeys.length === 0) {
                oContainer.addItem(new Text({
                    text: "No active reports available"
                }).addStyleClass("sapUiSmallMarginTop"));
            }
        },

        /**
         * Handle tile press - show ActionSheet with Preview and Create Subscription
         */
        _onTilePress: function (oController, sReportId, oSource) {
            var that = this;
            
            // Destroy previous ActionSheet if exists
            if (this._oActionSheet) {
                this._oActionSheet.destroy();
            }
            
            this._oActionSheet = new ActionSheet({
                title: sReportId,
                showCancelButton: true,
                buttons: [
                    new Button({
                        text: "Preview Report",
                        icon: "sap-icon://display",
                        press: function () {
                            that._navigateToPreview(oController, sReportId);
                        }
                    }),
                    new Button({
                        text: "Create Subscription",
                        icon: "sap-icon://add-activity",
                        press: function () {
                            that._createSubscription(oController, sReportId);
                        }
                    })
                ],
                afterClose: function () {
                    that._oActionSheet.destroy();
                    that._oActionSheet = null;
                }
            });
            
            this._oActionSheet.openBy(oSource);
        },

        /**
         * Navigate to report preview page via NavContainer
         */
        _navigateToPreview: function (oController, sReportId) {
            var sPageKey = REPORT_PAGE_MAP[sReportId];
            
            if (sPageKey) {
                var oNavContainer = oController.byId("pageContainer");
                var oPage = oController.byId(sPageKey);
                
                if (oNavContainer && oPage) {
                    oNavContainer.to(oPage);
                    
                    var oSideNav = oController.byId("sideNavigation");
                    if (oSideNav) {
                        oSideNav.setSelectedKey(sPageKey);
                    }
                } else {
                    this.showMessage("Preview page not found for " + sReportId);
                }
            } else {
                this.showMessage("Preview not available for " + sReportId);
            }
        },

        /**
         * Create subscription for selected report
         */
        _createSubscription: function (oController, sReportId) {
            // Get subscription controller from main controller
            if (oController._subscriptionController) {
                oController._subscriptionController.createWithReportId(oController, sReportId);
            } else {
                this.showMessage("Unable to create subscription");
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // EVENT HANDLERS
        // ═══════════════════════════════════════════════════════════════

        /**
         * Handle refresh button press
         */
        onRefreshCatalog: function (oController) {
            this.loadCatalog(oController);
            this.showMessage("Reports refreshed");
        },

        // ═══════════════════════════════════════════════════════════════
        // LEGACY METHODS (kept for backwards compatibility)
        // ═══════════════════════════════════════════════════════════════
        
        /**
         * Preview selected report - kept for macros:Table compatibility
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
            
            this._onTilePress(oController, sReportId);
        },
        
        /**
         * Create subscription with selected report pre-filled
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
            
            oSubscriptionController.createWithReportId(oController, sReportId);
        }
    });
});
