sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox"
], function (BaseController, JSONModel, MessageBox) {
    "use strict";

    /**
     * UserController - Handles user session data loading and management
     * Loads current user info from UserSession OData entity
     */
    return BaseController.extend("z.sap01.cfa.ext.controller.UserController", {
        
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
         * @param {Function} fnCallback - Optional callback executed after successful load
         */
        loadUserSession: function (oController, fnCallback) {
            var oODataModel = oController.getView().getModel();
            var oUserModel = oController.getView().getModel("userSession");
            
            // Guard: Wait for OData model to be ready
            if (!oODataModel) {
                console.warn("UserController: OData model not ready, skipping user session load");
                return;
            }
            
            // Prevent duplicate loading
            if (oUserModel.getProperty("/isLoaded")) {
                // Already loaded - execute callback if provided
                if (fnCallback && typeof fnCallback === "function") {
                    fnCallback();
                }
                return;
            }
            
            var oBinding = oODataModel.bindContext("/UserSession('CURRENT')", null, {
                $$groupId: "$direct"  // Direct request, not batched
            });
            
            oBinding.requestObject().then(function (oData) {
                if (oData) {
                    // ═══════════════════════════════════════════════════════════
                    // AUTHORIZATION CHECK - Block unauthorized users
                    // ═══════════════════════════════════════════════════════════
                    var bIsAuthorized = oData.RoleId && 
                                       oData.RoleId.startsWith('ZDRS_') &&
                                       oData.RoleId !== 'NO_ROLE';
                    
                    if (!bIsAuthorized) {
                        // User does not have DRS role - BLOCK ACCESS
                        MessageBox.error(
                            "You are not authorized to access this application.\n\n" +
                            "Required: ZDRS role assignment (ZDRS_ADMIN, ZDRS_FI_AR_STAFF, etc.)\n\n" +
                            "Please contact IT Support to request access.",
                            {
                                title: "Access Denied",
                                styleClass: "sapUiSizeCompact",
                                onClose: function() {
                                    // Navigate back to launchpad or close window
                                    if (window.history.length > 1) {
                                        window.history.back();
                                    } else {
                                        window.close();
                                    }
                                }
                            }
                        );
                        
                        // Keep busy indicator to block UI
                        // Do NOT call setBusy(false)
                        return; // Stop processing
                    }
                    
                    // ═══════════════════════════════════════════════════════════
                    // User is AUTHORIZED - Proceed with normal flow
                    // ═══════════════════════════════════════════════════════════
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
                    
                    // Remove busy indicator - user is authorized
                    oController.getView().setBusy(false);
                    
                    // Execute callback if provided (for role-based UI updates)
                    if (fnCallback && typeof fnCallback === "function") {
                        fnCallback();
                    }
                }
            }).catch(function (oError) {
                console.error("Failed to load user session:", oError);
                
                // Show error dialog for service failure
                MessageBox.error(
                    "Unable to verify your authorization. Please try again.\n\n" +
                    "If the problem persists, contact IT Support.",
                    {
                        title: "Authentication Error",
                        styleClass: "sapUiSizeCompact",
                        onClose: function() {
                            if (window.history.length > 1) {
                                window.history.back();
                            } else {
                                window.close();
                            }
                        }
                    }
                );
            });
        }
    });
});
