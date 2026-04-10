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
    "cfa/customfioriapplication/model/constants"
], function (BaseController, Dialog, Button, Select, VBox, Label, Text, Item, MessageBox, Constants) {
    "use strict";

    /**
     * SubscriptionController - Handles Subscription CRUD operations
     */
    return BaseController.extend("cfa.customfioriapplication.ext.controller.SubscriptionController", {
        
        _oReportSelectDialog: null,
        
        /**
         * Show dialog to select Report ID before creating subscription
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        showCreateDialog: function (oController) {
            var that = this;
            
            // Create dialog if not exists
            if (!this._oReportSelectDialog) {
                var aItems = Constants.REPORT_OPTIONS.map(function (oOpt) {
                    return new Item({ key: oOpt.key, text: oOpt.text });
                });
                
                var oSelect = new Select({
                    id: "reportIdSelect_" + Date.now(), // Unique ID
                    width: "100%",
                    items: aItems
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
                                    text: "Note: Parameters will be auto-created based on report type.",
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
                var sActionPath = oContext.getPath() + "/" + Constants.ACTION_NAMESPACE + ".createReportParams";
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
                var sDiscardPath = oContext.getPath() + "/" + Constants.ACTION_NAMESPACE + ".Discard";
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
