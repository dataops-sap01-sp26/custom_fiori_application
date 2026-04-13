sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    /**
     * UserController - Handles user session data loading and management
     * Loads current user info from UserSession OData entity
     */
    return BaseController.extend("cfa.customfioriapplication.ext.controller.UserController", {
        
        /**
         * Initialize user session model on the controller's view
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        init: function (oController) {
            var oModel = new JSONModel({
                userId: "",
                userFullName: "",
                email: "",
                roleId: "",
                roleName: "",
                roleDescription: "",
                isAdmin: false,
                isHeadAcct: false,
                hasGLAccess: false,
                hasAPAccess: false,
                hasARAccess: false,
                companyCodeList: "",
                isLoaded: false
            });
            oController.getView().setModel(oModel, "userSession");
        },
        
        /**
         * Load current user session from OData service
         * @param {sap.fe.core.PageController} oController - Main controller reference
         */
        loadUserSession: function (oController) {
            var oODataModel = oController.getView().getModel();
            var oUserModel = oController.getView().getModel("userSession");
            
            // Guard: Wait for OData model to be ready
            if (!oODataModel) {
                console.warn("UserController: OData model not ready, skipping user session load");
                return;
            }
            
            // Prevent duplicate loading
            if (oUserModel.getProperty("/isLoaded")) {
                return;
            }
            
            var oBinding = oODataModel.bindContext("/UserSession('CURRENT')", null, {
                $$groupId: "$direct"  // Direct request, not batched
            });
            
            oBinding.requestObject().then(function (oData) {
                if (oData) {
                    oUserModel.setData({
                        userId: oData.UserId,
                        userFullName: oData.UserFullName,
                        email: oData.Email,
                        roleId: oData.RoleId,
                        roleName: oData.RoleName,
                        roleDescription: oData.RoleDescription,
                        isAdmin: oData.IsAdmin,
                        isHeadAcct: oData.IsHeadAcct,
                        hasGLAccess: oData.HasGLAccess,
                        hasAPAccess: oData.HasAPAccess,
                        hasARAccess: oData.HasARAccess,
                        companyCodeList: oData.CompanyCodeList,
                        isLoaded: true
                    });
                }
            }).catch(function (oError) {
                console.error("Failed to load user session:", oError);
                // Set fallback values for graceful degradation
                oUserModel.setProperty("/userFullName", "User");
                oUserModel.setProperty("/roleName", "Unknown Role");
                oUserModel.setProperty("/isLoaded", true);
            });
        }
    });
});
