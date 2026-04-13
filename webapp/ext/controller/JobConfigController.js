sap.ui.define([
    "./BaseController",
    "sap/m/MessageBox"
], function (BaseController, MessageBox) {
    "use strict";

    /**
     * JobConfigController - Handles Job Configuration CRUD operations
     */
    return BaseController.extend("z.sap01.cfa.ext.controller.JobConfigController", {
        
        /**
         * Refresh the job config table by refreshing the model
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        refreshTable: function (oController) {
            try {
                oController.getView().getModel().refresh();
            } catch (ex) {
                // Ignore refresh errors
            }
        },
        
        /**
         * Create a new job configuration - navigates to NewPage
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        onCreate: function (oController) {
            var oExtensionAPI = oController.getExtensionAPI();
            var oListBinding = oExtensionAPI.getModel().bindList("/DrsJobConfig");
            oExtensionAPI.getEditFlow().createDocument(oListBinding, {
                creationMode: "NewPage"
            });
        },
        
        /**
         * Delete selected job configurations (active records + drafts)
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        onDelete: function (oController) {
            var that = this;
            var aContexts = this.getTableSelectedContexts(oController, "jobConfigTable");

            if (!aContexts || aContexts.length === 0) {
                this.showMessage("Please select a record to delete.");
                return;
            }

            // Separate active vs draft records
            var oSeparated = this.separateActiveAndDraft(aContexts);
            var aActiveContexts = oSeparated.active;
            var aDraftContexts = oSeparated.draft;

            var iTotal = aContexts.length;
            var sDraftInfo = aDraftContexts.length > 0 
                ? aDraftContexts.length + " draft(s) will be discarded. " 
                : "";
            var sActiveInfo = aActiveContexts.length > 0 
                ? aActiveContexts.length + " active record(s) will be deleted." 
                : "";

            MessageBox.confirm("Are you sure?\n" + sDraftInfo + sActiveInfo, {
                title: "Confirm Deletion (" + iTotal + " selected)",
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
                var sDiscardAction = oContext.getPath() + "/com.sap.gateway.srvd.zsd_drs_main_o4.v0001.Discard";
                var oDiscardOp = oModel.bindContext(sDiscardAction + "(...)");
                aAllPromises.push(oDiscardOp.execute());
            });

            Promise.all(aAllPromises).then(function () {
                that.showMessage("Successfully processed " + iTotal + " record(s).");
                that.refreshTable(oController);
            }).catch(function (oError) {
                that.showError("Error: " + (oError ? oError.message : "Unknown error"));
                that.refreshTable(oController);
            });
        }
    });
});
