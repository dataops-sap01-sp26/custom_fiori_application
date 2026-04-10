sap.ui.define([
    "sap/ui/base/Object",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (BaseObject, MessageBox, MessageToast) {
    "use strict";

    /**
     * BaseController - Provides shared utility methods for domain controllers.
     * Domain controllers inherit from this class and receive the main controller reference.
     */
    return BaseObject.extend("cfa.customfioriapplication.ext.controller.BaseController", {
        
        /**
         * Display a toast message
         * @param {string} sMessage - Message to display
         */
        showMessage: function (sMessage) {
            MessageToast.show(sMessage);
        },
        
        /**
         * Display an error message box
         * @param {string} sMessage - Error message
         */
        showError: function (sMessage) {
            MessageBox.error(sMessage);
        },
        
        /**
         * Display a warning message box
         * @param {string} sMessage - Warning message
         * @param {function} [fnOnClose] - Callback when dialog closes
         */
        showWarning: function (sMessage, fnOnClose) {
            MessageBox.warning(sMessage, {
                onClose: fnOnClose
            });
        },
        
        /**
         * Display a confirmation dialog
         * @param {string} sMessage - Confirmation message
         * @param {function} fnCallback - Callback function(sAction)
         * @param {string} [sTitle] - Optional dialog title
         */
        confirmAction: function (sMessage, fnCallback, sTitle) {
            MessageBox.confirm(sMessage, {
                title: sTitle || "Confirm",
                onClose: fnCallback
            });
        },
        
        /**
         * Get table contexts with fallback for inner table
         * @param {sap.fe.core.PageController} oController - Main controller
         * @param {string} sTableId - Table ID
         * @returns {sap.ui.model.odata.v4.Context[]} Selected contexts
         */
        getTableSelectedContexts: function (oController, sTableId) {
            var oTable = oController.byId(sTableId);
            var aContexts = oTable && oTable.getSelectedContexts ? oTable.getSelectedContexts() : [];
            
            // Fallback: try inner table (::Table suffix)
            if ((!aContexts || aContexts.length === 0) && oController.byId(sTableId + "::Table")) {
                aContexts = oController.byId(sTableId + "::Table").getSelectedContexts() || [];
            }
            
            return aContexts;
        },
        
        /**
         * Separate contexts into active and draft lists
         * @param {sap.ui.model.odata.v4.Context[]} aContexts - Selected contexts
         * @returns {object} { active: [], draft: [] }
         */
        separateActiveAndDraft: function (aContexts) {
            var aActive = [];
            var aDraft = [];
            
            aContexts.forEach(function (oContext) {
                if (oContext.getProperty("IsActiveEntity") === false) {
                    aDraft.push(oContext);
                } else {
                    aActive.push(oContext);
                }
            });
            
            return { active: aActive, draft: aDraft };
        }
    });
});
