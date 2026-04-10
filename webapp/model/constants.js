sap.ui.define([], function () {
    "use strict";

    return {
        
        // OData action namespace
        ACTION_NAMESPACE: "com.sap.gateway.srvd.zsd_drs_main_o4.v0001",
        
        // Job status values
        JOB_STATUS: {
            SCHEDULED: "1",
            RUNNING: "2",
            COMPLETED: "3",
            FAILED: "4",
            CANCELLED: "5"
        },
        
        // Subscription status values
        SUBSCRIPTION_STATUS: {
            ACTIVE: "ACTIVE",
            PAUSED: "PAUSED",
            INACTIVE: "INACTIVE"
        },
        
        // Report ID to sidebar page mapping
        REPORT_PAGE_MAP: {
            "GL-01": "report_gl01",
            "AR-01": "report_ar01",
            "AR-02": "report_ar02",
            "AR-03": "report_ar03",
            "AP-01": "report_ap01",
            "AP-02": "report_ap02",
            "AP-03": "report_ap03"
        },
        
        // Report options for select dialog
        REPORT_OPTIONS: [
            { key: "", text: "-- Select a Report --" },
            { key: "GL-01", text: "GL-01 - GL Account Balances" },
            { key: "AR-01", text: "AR-01 - Customer Open Items" },
            { key: "AR-02", text: "AR-02 - Customer Balances" },
            { key: "AR-03", text: "AR-03 - AR Aging Report" },
            { key: "AP-01", text: "AP-01 - Vendor Open Items" },
            { key: "AP-02", text: "AP-02 - Vendor Balances" },
            { key: "AP-03", text: "AP-03 - AP Aging Report" }
        ],
        
        // Reports that support parameters
        PARAM_SUPPORTED_REPORTS: ["GL-01", "AR-01", "AR-02", "AR-03", "AP-01", "AP-02", "AP-03"],
        
        // Module information
        MODULES: {
            "GL": { name: "FI-GL — General Ledger", icon: "sap-icon://loan" },
            "AR": { name: "FI-AR — Accounts Receivable", icon: "sap-icon://customer" },
            "AP": { name: "FI-AP — Accounts Payable", icon: "sap-icon://supplier" },
            "CO": { name: "CO — Controlling", icon: "sap-icon://pie-chart" },
            "FI": { name: "FI — Finance", icon: "sap-icon://money-bills" }
        },
        
        // Status criticality mapping (for UI5 ObjectStatus)
        CRITICALITY: {
            NEUTRAL: 0,
            NEGATIVE: 1,
            CRITICAL: 2,
            POSITIVE: 3
        }
    };
});
