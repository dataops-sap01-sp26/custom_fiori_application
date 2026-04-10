sap.ui.define([
    "sap/fe/core/PageController",
    "sap/ui/model/json/JSONModel",
    "../controller/JobConfigController",
    "../controller/SubscriptionController",
    "../controller/CatalogController",
    "../controller/JobHistoryController"
], function (PageController, JSONModel, JobConfigController, SubscriptionController, 
             CatalogController, JobHistoryController) {
    "use strict";

    /**
     * Main Controller - Orchestration layer that delegates to domain controllers
     * 
     * Domain Controllers:
     * - JobConfigController: Job configuration CRUD
     * - SubscriptionController: Subscription CRUD + dialog
     * - CatalogController: Report catalog actions
     * - JobHistoryController: Chart loading/config
     */
    return PageController.extend("cfa.customfioriapplication.ext.view.Main", {

        onInit: function () {
            PageController.prototype.onInit.apply(this, arguments);

            // Initialize domain controllers
            this._jobConfigController = new JobConfigController();
            this._subscriptionController = new SubscriptionController();
            this._catalogController = new CatalogController();
            this._jobHistoryController = new JobHistoryController();
            
            // Initialize chart model
            this._jobHistoryController.init(this);

            // Setup router pattern match
            var that = this;
            try {
                var oRouter = this.getAppComponent().getRouter();
                oRouter.getRoute("DashboardMainPage").attachPatternMatched(function () {
                    setTimeout(function () {
                        that._jobConfigController.refreshTable(that);
                    }, 500);
                });
            } catch (e) {
                // Router not ready
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // NAVIGATION HANDLERS
        // ═══════════════════════════════════════════════════════════════

        onMenuButtonPress: function () {
            var oToolPage = this.byId("toolPage");
            oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
        },

        onItemSelect: function (oEvent) {
            var oItem = oEvent.getParameter("item");
            var sKey = oItem.getKey();

            if (!sKey) { return; }

            this.byId("pageContainer").to(this.byId(sKey));

            // Load chart data when navigating to history
            if (sKey === "history") {
                this._jobHistoryController.loadChartData(this);
            }
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
        
        _createSubscriptionWithReportId: function (sReportId) {
            this._subscriptionController.createWithReportId(this, sReportId);
        },

        // ═══════════════════════════════════════════════════════════════
        // CATALOG HANDLERS - Delegate to CatalogController
        // ═══════════════════════════════════════════════════════════════

        onPreviewReport: function () {
            this._catalogController.onPreview(this);
        },

        onCreateSubscriptionFromCatalog: function () {
            this._catalogController.onCreateSubscription(this, this._subscriptionController);
        },

        // ═══════════════════════════════════════════════════════════════
        // JOB HISTORY HANDLERS - Delegate to JobHistoryController
        // ═══════════════════════════════════════════════════════════════

        onJobHistoryFilterSearch: function () {
            this._jobHistoryController.onFilterSearch(this);
        }
    });
});
