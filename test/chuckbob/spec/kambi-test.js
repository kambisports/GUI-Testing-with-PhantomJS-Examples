/*global window, document */

/* jQuery selector to match exact text inside an element
 *  http://wowmotty.blogspot.com/2010/05/jquery-selectors-adding-contains-exact.html
 *  :containsExact()     - case insensitive
 *  :containsExactCase() - case sensitive
 *  :containsRegex()     - set by user ( use: $(el).find(':containsRegex("/(red|blue|yellow)/gi")') )
 */
var addJqueryPlugins = function ($) {
	$.extend( $.expr[":"], {
		containsExact: $.expr.createPseudo ?
			$.expr.createPseudo(function(text) {
				return function(elem) {
					return $.trim(elem.innerHTML.toLowerCase()) === text.toLowerCase();
				};
			}) :
		// support: jQuery <1.8
		function(elem, i, match) {
			return $.trim(elem.innerHTML.toLowerCase()) === match[3].toLowerCase();
		},

		containsExactCase: $.expr.createPseudo ?
			$.expr.createPseudo(function(text) {
				return function(elem) {
					return $.trim(elem.innerHTML) === text;
				};
			}) :
		// support: jQuery <1.8
		function(elem, i, match) {
			return $.trim(elem.innerHTML) === match[3];
		},

		containsRegex: $.expr.createPseudo ?
			$.expr.createPseudo(function(text) {
				var reg = /^\/((?:\\\/|[^\/])+)\/([mig]{0,3})$/.exec(text);
				return function(elem) {
					return reg ? RegExp(reg[1], reg[2]).test($.trim(elem.innerHTML)) : false;
				};
			}) :
		// support: jQuery <1.8
		function(elem, i, match) {
			var reg = /^\/((?:\\\/|[^\/])+)\/([mig]{0,3})$/.exec(match[3]);
			return reg ? RegExp(reg[1], reg[2]).test($.trim(elem.innerHTML)) : false;
		}

	});
};

(function () {
	var firstPageRendered = false,
	notificationCallback = function (event) {
		if (event.name === 'pageRendered') {
			if (!firstPageRendered) {
				firstPageRendered = true;
				window.chuckbob.initialize();
				return;
			}
			window.chuckbob.integrationApi.endWaiting();
		}
	},
	addTests;

	window.customerSettings.notification = function (event, $) {
		console.log('Event notification, ', event);
		if (window.chuckbob) {
			notificationCallback(event);
			addJqueryPlugins($);
			window.chuckbob.integrationApi.setJQuery($);
		}
		window.kambi$ = $;
	};

	addTests = function (chuckbob) {
		"use strict";

		console.log("Kambi tests loaded.");

		var kambiSmokeTests = function () {
			var homeFootballSelector =
					'.group-list-widget a:containsExact(FOOTBALL)',
					// The CI tests sometimes adds an "All Football" group.
					// And we have American Football too
				handballSelector =
					'.group-list-widget a:contains(HANDBALL)',
				baseParams = "?locale=en_GB&offering=ub&api=test04remote",
				mrRich = "ticket=mrRich%40unibet&playerId=mrRich%40unibet",
				loggedInApi = baseParams + "&auth=true&" + mrRich;


			chuckbob.addTest("betslip shows single tab by default", function () {
				this.clearLocalStorage()
					.navigate("#home")
					.comment('We start by having singles selected')
					.count('#tab-single.selected')
					.equals(1);
			});

			chuckbob.addTest("Visit Football", function () {
				this.clearLocalStorage()
					.navigate(baseParams + "#home")
					.pick(homeFootballSelector)
					.click().wait()
					.count('a[title="PREMIER LEAGUE"]').equals(1);
			});

			chuckbob.addTest("Visiting bet history", function () {
				this.clearLocalStorage()
					.navigate(baseParams + "&navpanel=false#home")
					.comment('There should be a account button')
					.count('#header-account-btn')
					.equals(1)

					.pick('#header-account-btn')
					.click()
					.comment('The account page should be open')
					.count('.account-page.opened')
					.equals(1)

					.pick('.bob-bet-history')
					.click().wait()
					.comment('We are now on the bet history details page')

					.count('.bethistory-coupon-item')
					.comment('There should be atleast one bet history item')
					.isGreaterThan(0)

					.pick('.bethistory-coupon-item:first')
					.click()
					.comment('In details of the item there should be one transaction toggler')
					.pick('.transaction-history__toggle')

					.click()
					.comment('In Transaction details')
					.count('.transaction-history__header')
					.equals(1)

					.pick('.js-overlay-close-btn')
					.click().wait()
					.comment('Closed the overlay');
			});

			chuckbob.XaddTest("Visit Football with breakpoints", function () {
				this.clearLocalStorage()
					.navigate(baseParams + "#home")
					.breakpoint()
					.pick(homeFootballSelector)

					.click().wait()
					.count('a[title="PREMIER LEAGUE"]')
					.breakpoint()
					.equals(1);
			});


			// We don't want to run this, just use it as a subroutine
			chuckbob.XaddTest("common add to betslip", function () {
				this
					.pick(handballSelector)
					.click().wait()
					.comment('We are now on a group page')
					.pick('.js-prematch .event-link:eq(0)')
					.click().wait()
					.comment('We are now on a detail page')

					.comment('We have an empty betslip')
					.count('#betslip.state-empty').equals(1)

					.comment('We click on the first button')
					.pick('button.outcome:eq(1)')
					.click()

					.comment('There should now be a betslip, .state-empty should be removed')
					.countNow('#betslip.state-empty').equals(0);
			});

			chuckbob.addTest("Add to betslip shows betslip", function () {
				this.clearLocalStorage()
					.navigate(baseParams + "#home")
					.gosub("common add to betslip");
			});

			chuckbob.addTest("Place a bet", function () {
				var $ = this.$;
				var pressKey = function ($element) {
					if ($('body').hasClass('windowsphoneos')) {
						$element.trigger('mousedown');
					} else {
						$element.trigger('touchstart');
					}
				}, steps = this.clearLocalStorage()
						.navigate(loggedInApi + "#home")
						.gosub("common add to betslip")
						.comment("We now have a match on the betslip.")
						.comment('We now click on the betslip to show it.')
						.pick('#topbar')
						.click()
						.comment('Sleeping until it is animated up')
						.sleep(500)

						.comment('We pick the input field');

				if ($('body').hasClass('desktop')) {
					steps = steps
						.pick('input.outcome-item__stake__input')
						.comment("We write 12 (desktop input)")
						.run(function ($element) {
							$element.val('12').trigger('input');
						});
				} else {
					steps = steps.comment('The input field is actually a div')
						.comment("We write 12 (with numeric keypad)")
						.pick('div.outcome-item__stake__input')
						.click()
						.sleep(2000)
						.comment('We have a numeric keypad')
						.pick('button.one')
						.run(pressKey)
						.sleep(1000)
						.pick('button.two')
						.run(pressKey)
						.pick('button.ok')
						.run(pressKey)
						.sleep(2000)
						.comment('The numeric keypad is now closed');
				}

				steps.comment("We should now have 12.00 as total stake")
					.pick('.total-stake .value')
					.check(function ($element) {
						var text = $element.text();
						if (text.match(/12\.00/)) {
							return true;
						}
					})
					.comment("We have a stake, lets click on play bet")
					.sleep(300)
					.pick('#place-bet')
					.click()
					.sleep(3000)
					.comment("Second click, then sleeping")
					.click()
					.comment('We are now shown the receipt (or pba)')
					.pick('p.receipt-id, #modal:visible');
			});

			// Racing mode tests

			chuckbob.addTest("Racing mode for 888 has toggle", function () {
				this.clearLocalStorage()
					.navigate("?racingMode=true&offering=888&customer=888&locale=en_GB#home")
					.count(".all-sports-toggle-widget")
					.equals(1)
					.countNow('.home-widgets a:containsExact(FOOTBALL):visible')
					.equals(0)
					.pick("#racing-mode-show-all-sports-toggle")
					.click()
					.comment("We now see football")
					.count('.home-widgets a:containsExact(FOOTBALL):visible')
					.equals(1);
			});

			chuckbob.addTest("Racing mode for ub", function () {
				this.clearLocalStorage()
					.navigate("?racingMode=true&locale=en_GB&offering=ub&customer=ub#home")
					.sleep(2000)
					.countNow(".all-sports-toggle-widget")
					.comment("unibet does not have a toggler in racing mode")
					.equals(0)
					.comment("We don't see any football")
					.countNow('.home-widgets a:containsExact(FOOTBALL):visible')
					.equals(0);
			});

		},
		startingWithinTests = function () {
			chuckbob.addTest('Starting within', function () {
				this.comment('We know that this handball game always start at 18 every day')
					.clearLocalStorage()
					.navigate("?locale=en_GB#starts-within/1200")
					.pick('a.breadcrumb-item:contains(Starts within 20 hours)')
					.pick('li.event-list-item .participant:contains(LIF LINDESBERG):first');
			});
			chuckbob.addTest('Starting within, no match', function () {
				this.comment('(This test will fail 17.59 every day, otherwise run fine) ')
					.clearLocalStorage()
					.navigate("?locale=en_GB#starts-within/1")
					.pick('a.breadcrumb-item:contains(Starts within 1 minutes)')
					.sleep(300)
					.countNow('li.event-list-item .participant:contains(LIF LINDESBERG):first')
					.equals(0);
			});
		},
		clientDoesLoad = function () {
			var offerings = ['ub', '888', 'paf', 'pmes', 'iveria', 'eges', 'acres', 'sues', '32red', 'ngbe', 'naga', 'ubau', '888es'],
				addOperatorLoadTest = function (offering, auth) {
					chuckbob.addTest(offering + ' loads with auth set to ' + auth, function () {
						this.clearLocalStorage()
							.navigate('?locale=en_GB&api=prod&offering=' + offering + '&auth=' + auth)
							.sleep(1000)
							.count('#preloader')
							.equals(0)
							.count('#betslip')
							.equals(1);
					});
				},
				i, l;

			for (i = 0, l = offerings.length; i < l; i += 1) {
				addOperatorLoadTest(offerings[i], 'false');
			}
		},
		ufcBetAndWatchTests = function () {
			/*var	UFC_EVENT_GROUP_ID = 2000074522,
				UFC_COTE_BOUT_CRITERION_ID = 1001160027,
				UFC_HULK_HOGAN__THE_MAULER_PARTICIPANTS_IDS = [1002030207,1002030205];

			chuckbob.addTest('Bet and Watch', function (bob) {
				var options, ticket, url;

				ticket = bob.load('chuckbobBetAndWatchTicket');
				if (!ticket) { //for this test we need a new user each time
					ticket = 'chuckbob_betandwatch_' + Date.now() + '@unibet';
					bob.save('chuckbobBetAndWatchTicket', ticket);
				}
				url = '?api=test04&offering=ub&locale=en_GB&ticket=' + ticket + '&playerId=' + ticket;

				bob.runAsync(function (resolv, reject) {
					var	options;

					options = {
						eventGroupId: UFC_EVENT_GROUP_ID,
						criterionId: UFC_COTE_BOUT_CRITERION_ID,
						participantsIdList: UFC_HULK_HOGAN__THE_MAULER_PARTICIPANTS_IDS,
						liveBetOffer: true,
						betAndWatch: true
					};

					Sportsbook.setOptions(options)
						.then(Sportsbook.createEventInEventGroup)
						.then(Sportsbook.createLiveEventFromPreMatchEvent)
						.then(Sportsbook.createThreeWayBetOfferForEvent)
						.then(Sportsbook.createStreamForLiveEvent)
						.done(function (resultOptions) {
							bob.save('chuckbobBetAndWatchOptions', resultOptions);
							console.log('setup for tests done');
							resolve();
						})
						.fail(function () {
							console.log('setup for tests failed');
							reject();
						});
				});

				//TODO waiting for possibility to do multiple navigate
				options = bob.load('chuckbobBetAndWatchOptions');
				bob.navigate(url + "#group/" + options.eventGroupId)
					.comment('Enter event')
					.pick('a[data-id=' + options.eventId + ']')
					.click()

					.comment('Check that we can not play')
					.countNow('.stream-player-msg-not-enough-stake')
					.equals(1)

					.comment('Add outcome to betslip')
					.pick('a.outcome:first')
					.click()

					.comment('Set a stake for outcome')
					.pick('input.outcome-item__stake__input')
					.run(function ($element) {
						$element.val('10').trigger('input');
					})

					.comment('Place bet')
					.pick('#place-bet')
					.click()
					.sleep(8000)

					.comment('Check if we can play')
					.countNow('.stream-player-msg-play')
					.equals(1)

					.comment('Check if we still can play after changed page')
					.navigate(url + "#home")
					.navigate(url + "#event/live" + options.eventId)
					.countNow('.stream-player-msg-play')
					.equals(1)

					.comment('Cash-in placed bet')
					.pick('.cash-in-btn:first')
					.click()
					.pick('.btn--action[data-actions=cash_in]')
					.sleep(8000)

					.comment('Make sure we can still play')
					.countNow('.stream-player-msg-play')
					.equals(1);

				bob.afterAsync(function (resolv, reject) {
					var	options = bob.load('chuckbobBetAndWatchOptions');

					Sportsbook.setOptions(options)
						.then(Sportsbook.removeStreamFromLiveEvent)
						.then(Sportsbook.closeEvent)
						.then(Sportsbook.settleBetOffersWithMatchResult)
						.done(function () {
							console.log('tear down for tests done');
							resolve();
						})
						.fail(function () {
							console.log('tear down for tests failed');
							reject();
						});
				});
			});
			*/
		},
		racingTodayTests = function () {
			/*
			chuckbob.addTest('Todays Racing is rendered when clicking on the Today tab', function () {
				this.comment('specified api must have open races today for this to work')
					.navigate("?api=test06#group/2000065773/filter/races-next-off")
					.pick('a[data-filter-id="races-today"]')
					.click()
					.pick('.racing-today-widgets');
			});
			chuckbob.addTest('Todays Racing is rendered when deep-linking to Today tab', function () {
				this.comment('specified api must have open races today for this to work')
					.navigate("?api=test06#group/2000065773/filter/races-today")
					.pick('.racing-today-widgets');
			});
			*/
		};

		clientDoesLoad();
		ufcBetAndWatchTests();
		kambiSmokeTests();
		startingWithinTests();
		racingTodayTests();
	};

	if (window.chuckbob) {
		addTests(window.chuckbob);
	} else {
		window.afterChuckbob = addTests;
	};

}());
