sap.ui.define(
    ["sap/fe/core/AppComponent", "sap/ui/core/BusyIndicator"],
    function (Component, BusyIndicator) {
        "use strict";

        return Component.extend("z.sap01.cfa.Component", {
            metadata: {
                manifest: "json"
            },

            init: function () {
                // Show busy indicator immediately (delay=0)
                BusyIndicator.show(0);

                Component.prototype.init.apply(this, arguments);

                // Hide when the first route is matched (page fully loaded)
                var oRouter = this.getRouter();
                if (oRouter) {
                    oRouter.attachEventOnce("routeMatched", function () {
                        BusyIndicator.hide();
                    });
                }

                // Also hide the HTML spinner if running standalone (index.html)
                var oLoader = document.getElementById("drs-app-loading");
                if (oLoader) {
                    oLoader.remove();
                }
            }
        });
    }
);