sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"z/sap01/cfa/test/integration/pages/DashboardMainPage"
], function (JourneyRunner, DashboardMainPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('z/sap01/cfa') + '/test/flp.html#app-preview',
        pages: {
			onTheDashboardMainPage: DashboardMainPage
        },
        async: true
    });

    return runner;
});

