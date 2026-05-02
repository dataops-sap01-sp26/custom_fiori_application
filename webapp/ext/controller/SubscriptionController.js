sap.ui.define([
    "./BaseController",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Select",
    "sap/m/VBox",
    "sap/m/Label",
    "sap/m/Text",
    "sap/ui/core/Item",
    "sap/m/MessageBox",
    "sap/ui/model/Sorter"
], function (BaseController, Dialog, Button, Select, VBox, Label, Text, Item, MessageBox, Sorter) {
    var ACTION_NS = "com.sap.gateway.srvd.zsd_drs_main.v0001";
    
    // REMOVED: Hardcoded REPORT_OPTIONS array
    // Reports are now loaded dynamically from /ReportCatalog with DCL filtering
    
    "use strict";

    /**
     * SubscriptionController - Handles Subscription CRUD operations
     */
    return BaseController.extend("z.sap01.cfa.ext.controller.SubscriptionController", {
        
        _oReportSelectDialog: null,
        
        /**
         * Show dialog to select Report ID before creating subscription
         * Loads authorized reports from /ReportCatalog (DCL filtered by ZDRS_REP)
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        showCreateDialog: function (oController) {
            var that = this;
            var oModel = oController.getView().getModel();
            
            // Create dialog if not exists
            if (!this._oReportSelectDialog) {
                // Create empty Select - items will be loaded dynamically
                var oSelect = new Select({
                    id: "reportIdSelect_" + Date.now(), // Unique ID
                    width: "100%",
                    items: [
                        new Item({ key: "", text: "-- Loading reports... --" })
                    ]
                });
                this._oReportSelect = oSelect;
                
                this._oReportSelectDialog = new Dialog({
                    title: "Create New Subscription",
                    contentWidth: "400px",
                    content: [
                        new VBox({
                            items: [
                                new Label({ text: "Select Report Type", required: true }),
                                oSelect,
                                new Text({
                                    text: "Note: Only reports you are authorized to access are shown.",
                                    wrapping: true
                                }).addStyleClass("sapUiTinyMarginTop sapUiTinyMarginBottom")
                            ]
                        }).addStyleClass("sapUiSmallMargin")
                    ],
                    beginButton: new Button({
                        text: "Create",
                        type: "Emphasized",
                        press: function () {
                            var sReportId = that._oReportSelect.getSelectedKey();
                            if (!sReportId) {
                                that.showMessage("Please select a Report Type");
                                return;
                            }
                            that._oReportSelectDialog.close();
                            that.createWithReportId(oController, sReportId);
                        }
                    }),
                    endButton: new Button({
                        text: "Cancel",
                        press: function () {
                            that._oReportSelectDialog.close();
                        }
                    })
                });
                oController.getView().addDependent(this._oReportSelectDialog);
            }
            
            // Load authorized reports from ReportCatalog (DCL filtered)
            this._oReportSelectDialog.setBusy(true);
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
                
                console.log("SubscriptionController: Loaded " + aActiveReports.length + " authorized reports");
                
                // Build Select items
                var aItems = [
                    new Item({ key: "", text: "-- Select a Report --" })
                ];
                
                aActiveReports.forEach(function (oReport) {
                    aItems.push(new Item({
                        key: oReport.ReportId,
                        text: oReport.ReportId + " - " + oReport.ReportName
                    }));
                });
                
                // Update Select control
                that._oReportSelect.destroyItems();
                aItems.forEach(function (oItem) {
                    that._oReportSelect.addItem(oItem);
                });
                
                that._oReportSelectDialog.setBusy(false);
                
                // Show warning if no reports found
                if (aActiveReports.length === 0) {
                    that.showWarning("No reports available. You may not have authorization to create subscriptions.");
                }
                
            }).catch(function (oError) {
                console.error("SubscriptionController: Failed to load reports", oError);
                that._oReportSelectDialog.setBusy(false);
                that.showError("Unable to load reports. Please try again.");
            });
            
            // Reset selection and open dialog
            this._oReportSelect.setSelectedKey("");
            this._oReportSelectDialog.open();
        },
        
        /**
         * Create subscription draft with ReportId, then call createReportParams action
         * @param {sap.fe.core.PageController} oController - Main controller reference
         * @param {string} sReportId - Selected report ID (e.g., "GL-01")
         */
        createWithReportId: function (oController, sReportId) {
            var that = this;
            var oExtensionAPI = oController.getExtensionAPI();
            var oModel = oExtensionAPI.getModel();
            var oListBinding = oModel.bindList("/DrsSubscription");

            // Step 1: Create draft with ReportId pre-filled
            var oContext = oListBinding.create({
                ReportId: sReportId
            }, true); // bSkipRefresh = true

            oContext.created().then(function () {
                // Step 2: Call createReportParams action
                var sActionPath = oContext.getPath() + "/" + ACTION_NS + ".createReportParams";
                var oOperation = oModel.bindContext(sActionPath + "(...)");
                
                return oOperation.execute().then(function () {
                    // Step 3: Navigate to Object Page
                    that.navigateToDetail(oController, oContext);
                });
            }).catch(function (oError) {
                console.error("Create subscription failed:", oError);
                // If createReportParams fails, still navigate
                that.showWarning(
                    "Subscription created but parameters could not be initialized automatically. " +
                    "You can click 'Create Report Parameters' button on the detail page.",
                    function () {
                        that.navigateToDetail(oController, oContext);
                    }
                );
            });
        },
        
        /**
         * Navigate to Subscription Object Page using router
         * @param {sap.fe.core.PageController} oController - Main controller reference
         * @param {sap.ui.model.odata.v4.Context} oContext - The subscription context
         */
        navigateToDetail: function (oController, oContext) {
            var oRouter = oController.getAppComponent().getRouter();
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
         * Delete selected subscriptions (active records + drafts)
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        onDelete: function (oController) {
            var that = this;
            var aContexts = this.getTableSelectedContexts(oController, "subscrTable");

            if (!aContexts || aContexts.length === 0) {
                this.showMessage("Please select at least one subscription to delete.");
                return;
            }

            // Separate active vs draft records
            var oSeparated = this.separateActiveAndDraft(aContexts);
            var aActiveContexts = oSeparated.active;
            var aDraftContexts = oSeparated.draft;

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
                        that._executeDelete(oController, aActiveContexts, aDraftContexts, iTotal);
                    }
                }
            });
        },
        
        /**
         * Execute the delete operation
         * @private
         */
        _executeDelete: function (oController, aActiveContexts, aDraftContexts, iTotal) {
            var that = this;
            var oModel = oController.getView().getModel();
            var aAllPromises = [];

            // Active records → HTTP DELETE
            aActiveContexts.forEach(function (oContext) {
                aAllPromises.push(oContext.delete());
            });

            // Draft records → Discard action
            aDraftContexts.forEach(function (oContext) {
                var sDiscardPath = oContext.getPath() + "/" + ACTION_NS + ".Discard";
                var oOp = oModel.bindContext(sDiscardPath + "(...)");
                aAllPromises.push(oOp.execute());
            });

            Promise.all(aAllPromises).then(function () {
                that.showMessage("Deleted " + iTotal + " subscription(s) successfully.");
                oModel.refresh();
            }).catch(function (oError) {
                that.showError("Error occurred while deleting subscriptions.");
                oModel.refresh();
            });
        }
    });
});
