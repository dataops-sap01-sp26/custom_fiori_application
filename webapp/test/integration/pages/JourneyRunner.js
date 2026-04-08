sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"cfa/customfioriapplication/test/integration/pages/DashboardMainPage"
], function (JourneyRunner, DashboardMainPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('cfa/customfioriapplication') + '/test/flp.html#app-preview',
        pages: {
			onTheDashboardMainPage: DashboardMainPage
        },
        async: true
    });

    return runner;
});

