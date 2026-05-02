sap.ui.define([
    "sap/fe/core/PageController",
    "../controller/DashboardController",
    "../controller/JobConfigController",
    "../controller/SubscriptionController",
    "../controller/CatalogController",
    "../controller/JobHistoryController",
    "../controller/UserController",
    "../controller/SidebarController"
], function (PageController, DashboardController, JobConfigController,
             SubscriptionController, CatalogController, JobHistoryController, UserController, SidebarController) {
    "use strict";

    /**
     * Main Controller - Orchestration layer that delegates to domain controllers
     * 
     * Domain Controllers:
     * - DashboardController: Dashboard KPIs, charts, recent data
     * - JobConfigController: Job configuration CRUD
     * - SubscriptionController: Subscription CRUD + dialog
     * - CatalogController: Report catalog actions
     * - JobHistoryController: Chart loading/config
     */
    return PageController.extend("z.sap01.cfa.ext.view.Main", {

        onInit: function () {
            PageController.prototype.onInit.apply(this, arguments);

            // ═══════════════════════════════════════════════════════════════
            // BLOCK UI until authorization is verified
            // ═══════════════════════════════════════════════════════════════
            var oView = this.getView();
            oView.setBusy(true);
            oView.setBusyIndicatorDelay(0); // Show immediately

            // Initialize domain controllers
            this._dashboardController = new DashboardController();
            this._jobConfigController = new JobConfigController();
            this._subscriptionController = new SubscriptionController();
            this._catalogController = new CatalogController();
            this._jobHistoryController = new JobHistoryController();
            this._userController = new UserController();
            this._sidebarController = new SidebarController();
            
            // Initialize dashboard and chart models
            this._dashboardController.init(this);
            this._jobHistoryController.init(this);
            
            // Initialize user session model (data loads after route match)
            this._userController.init(this);

            // Setup router pattern match
            var that = this;
            try {
                var oRouter = this.getAppComponent().getRouter();
                oRouter.getRoute("DashboardMainPage").attachPatternMatched(function () {
                    // Load user session (OData model ready here)
                    // Authorization check happens inside loadUserSession()
                    // Pass callback to update navigation visibility after user data loads
                    that._userController.loadUserSession(that, function() {
                        that._updateNavigationVisibility();
                    });
                    
                    // Load sidebar reports AFTER user session loaded
                    // Only authorized reports will be shown (DCL filtering)
                    that._sidebarController.loadReportMenu(that);
                    
                    // Load dashboard data on initial page load
                    that._dashboardController.loadDashboardData(that);
                    setTimeout(function () {
                        that._jobConfigController.refreshTable(that);
                    }, 500);
                });
            } catch (e) {
                // Router not ready - load dashboard data directly
                this._dashboardController.loadDashboardData(this);
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // ROLE-BASED UI VISIBILITY CONTROL
        // ═══════════════════════════════════════════════════════════════

        /**
         * Hide Subscription and Job Config navigation items for HEAD_ACCT role
         * HEAD_ACCT should only monitor Job History/Files, not create/manage subscriptions
         * 
         * Implementation: Phase 4 - Frontend Updates (Authorization v2.1)
         */
        _updateNavigationVisibility: function() {
            var oUserModel = this.getView().getModel("userSession");
            
            // Wait for user session to load
            if (!oUserModel || !oUserModel.getProperty("/isLoaded")) {
                console.warn("Main.controller: User session not loaded yet, skipping navigation visibility update");
                return;
            }
            
            var sRoleId = oUserModel.getProperty("/roleId");
            var bIsHeadAcct = oUserModel.getProperty("/isHeadAcct");
            
            // Hide subscription and job config menu for HEAD_ACCT
            if (bIsHeadAcct || sRoleId === "ZDRS_HEAD_ACCT") {
                var oSubscrItem = this.byId("navItemSubscriptions");
                var oJobConfigItem = this.byId("navItemJobConfig");
                
                if (oSubscrItem) {
                    oSubscrItem.setVisible(false);
                    console.log("Main.controller: Hidden Subscriptions menu for HEAD_ACCT role");
                }
                
                if (oJobConfigItem) {
                    oJobConfigItem.setVisible(false);
                    console.log("Main.controller: Hidden Job Config menu for HEAD_ACCT role");
                }
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // NAVIGATION HANDLERS
        // ═══════════════════════════════════════════════════════════════

        onMenuButtonPress: function () {
            var oToolPage = this.byId("toolPage");
            oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
        },

        onUserMenuPress: function (oEvent) {
            var oButton = oEvent.getSource();
            var oView = this.getView();
            
            if (!this._oUserPopover) {
                this._oUserPopover = new sap.m.ResponsivePopover({
                    title: "User Profile",
                    contentWidth: "320px",
                    placement: "Bottom",
                    content: [
                        new sap.m.VBox({
                            items: [
                                new sap.m.ObjectHeader({
                                    title: "{userSession>/userFullName}",
                                    intro: "{userSession>/userId}",
                                    icon: "sap-icon://person-placeholder",
                                    responsive: true
                                }),
                                new sap.m.List({
                                    items: [
                                        new sap.m.StandardListItem({ 
                                            title: "Email", 
                                            description: "{userSession>/email}",
                                            icon: "sap-icon://email"
                                        }),
                                        new sap.m.StandardListItem({ 
                                            title: "Role", 
                                            description: "{userSession>/roleName}",
                                            icon: "sap-icon://role"
                                        }),
                                        new sap.m.StandardListItem({ 
                                            title: "Company Codes", 
                                            description: "{userSession>/companyCodeList}",
                                            icon: "sap-icon://factory"
                                        })
                                    ]
                                })
                            ]
                        })
                    ]
                });
                oView.addDependent(this._oUserPopover);
            }
            this._oUserPopover.openBy(oButton);
        },

        onItemSelect: function (oEvent) {
            var oItem = oEvent.getParameter("item");
            var sKey = oItem.getKey();

            if (!sKey) { return; }

            // All pages are inside NavContainer with inline macros
            this.byId("pageContainer").to(this.byId(sKey));

            // Load data based on target page
            if (sKey === "dashboard") {
                this._dashboardController.loadDashboardData(this);
            } else if (sKey === "history") {
                this._jobHistoryController.loadChartData(this);
            } else if (sKey === "catalog") {
                this._catalogController.initCatalog(this);
            }
        },
        
        // ═══════════════════════════════════════════════════════════════
        // DASHBOARD HANDLERS - Delegate to DashboardController
        // ═══════════════════════════════════════════════════════════════

        onKpiTilePress: function (oEvent) {
            var sTargetPage = oEvent.getSource().data("targetPage");
            this._dashboardController.navigateToPage(this, sTargetPage);
            
            // Load data for target page after navigation
            if (sTargetPage === "catalog") {
                this._catalogController.initCatalog(this);
            } else if (sTargetPage === "history") {
                this._jobHistoryController.loadChartData(this);
            }
        },

        onQuickActionPress: function (oEvent) {
            var sTargetPage = oEvent.getSource().data("targetPage");
            this._dashboardController.navigateToPage(this, sTargetPage);
            
            // Load data for target page after navigation
            if (sTargetPage === "catalog") {
                this._catalogController.initCatalog(this);
            } else if (sTargetPage === "history") {
                this._jobHistoryController.loadChartData(this);
            }
        },

        onViewAllSubscriptions: function () {
            this._dashboardController.navigateToPage(this, "subscriptions");
        },

        onViewAllJobs: function () {
            this._dashboardController.navigateToPage(this, "jobconfigs");
        },

        onSubscriptionRowPress: function (oEvent) {
            // Navigate to subscription detail or show in table
            this._dashboardController.navigateToPage(this, "subscriptions");
        },

        onJobRowPress: function (oEvent) {
            // Navigate to job config detail or show in table
            this._dashboardController.navigateToPage(this, "jobconfigs");
        },

        // ═══════════════════════════════════════════════════════════════
        // JOB CONFIG HANDLERS - Delegate to JobConfigController
        // ═══════════════════════════════════════════════════════════════

        onCreateJobConfig: function () {
            this._jobConfigController.onCreate(this);
        },

        onDeleteJobConfig: function () {
            this._jobConfigController.onDelete(this);
        },

        // ═══════════════════════════════════════════════════════════════
        // SUBSCRIPTION HANDLERS - Delegate to SubscriptionController
        // ═══════════════════════════════════════════════════════════════

        onCreateSubscription: function () {
            this._subscriptionController.showCreateDialog(this);
        },

        onDeleteSubscription: function () {
            this._subscriptionController.onDelete(this);
        },

        // ═══════════════════════════════════════════════════════════════
        // JOB HISTORY HANDLERS - Delegate to JobHistoryController
        // ═══════════════════════════════════════════════════════════════

        onJobHistoryFilterSearch: function () {
            this._jobHistoryController.onFilterSearch(this);
        }
    });
});
