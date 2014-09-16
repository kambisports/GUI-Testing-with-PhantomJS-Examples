(function () {

	function addTests(chuckbob) {

		chuckbob.integrationApi.setJQuery($);

		var pressKey = function ($element) {
			$element.trigger('mousedown');
			console.log($element);
		};

		chuckbob.XaddTest('Open keyboard view', function () {
			this
				.pick('#open-keyboard-btn')
				.click();
		});

		chuckbob.XaddTest("Clear display", function () {
			this
				.pick('button.delete')
				.run(pressKey);
		});

		chuckbob.addTest('Open keyboard', function () {
			this
				.gosub('Open keyboard view')
				.comment('We should now have keyboard visible')
				.countNow('#numeric-keyboard-view:visible')
				.equals(1);
		});

		chuckbob.addTest('Press the keyboard buttons to test max 2 decimals', function () {
			this
				.gosub('Open keyboard view')

				.comment("We press 12.345")

				.pick('button.one')
				.run(pressKey)
				.sleep(500)

				.pick('button.two')
				.run(pressKey)
				.sleep(500)

				.pick('button.dot')
				.run(pressKey)
				.sleep(500)

				.pick('button.three')
				.run(pressKey)
				.sleep(500)

				.pick('button.four')
				.run(pressKey)
				.sleep(500)

				.pick('button.five')
				.run(pressKey)
				.sleep(500)

				.comment('It should display maximum 2 decimals')

				.pick('label.stake-display')
				.check(function ($element) {
					return $element.text() === '12.34';
				});
		});

		chuckbob.addTest('Press the keyboard buttons to test max 7 digits', function () {
			this
				.gosub('Open keyboard view')
				.gosub('Clear display')

				.comment("We press 123456789")

				.pick('button.one')
				.run(pressKey)
				.sleep(500)

				.pick('button.two')
				.run(pressKey)
				.sleep(500)
				
				.pick('button.three')
				.run(pressKey)
				.sleep(500)

				.pick('button.four')
				.run(pressKey)
				.sleep(500)

				.pick('button.five')
				.run(pressKey)
				.sleep(500)

				.pick('button.six')
				.run(pressKey)
				.sleep(500)

				.pick('button.seven')
				.run(pressKey)
				.sleep(500)

				.pick('button.eight')
				.run(pressKey)
				.sleep(500)

				.pick('button.nine')
				.run(pressKey)
				.sleep(500)

				.comment('It should display maximum 7 digits')

				.pick('label.stake-display')
				.check(function ($element) {
					return $element.text().length === 7;
				});
		});

		chuckbob.addTest('Press the keyboard buttons to test max 1 separator', function () {
			this
				.gosub('Open keyboard view')
				.gosub('Clear display')

				.comment("We press 12..45")

				.pick('button.one')
				.run(pressKey)
				.sleep(500)

				.pick('button.two')
				.run(pressKey)
				.sleep(500)
				
				.pick('button.dot')
				.run(pressKey)
				.sleep(500)

				.pick('button.dot')
				.run(pressKey)
				.sleep(500)

				.pick('button.four')
				.run(pressKey)
				.sleep(500)

				.pick('button.five')
				.run(pressKey)
				.sleep(500)

				.comment('It should display maximum 1 separator')

				.pick('label.stake-display')
				.check(function ($element) {
					return $element.text() === '12.45';
				});
		});

		chuckbob.addTest('Press the keyboard buttons to test if 7 digits fit on the display', function () {
			var keyboardWidth,
				saveWidth = function ($element) {
					keyboardWidth = $element.width();
				}

			this
				.gosub('Open keyboard view')
				.gosub('Clear display')

				.comment("Save keyboard element width")
				.pick('.numeric-keyboard')
				.run(saveWidth)

				.comment("We press 1234567")

				.pick('button.one')
				.run(pressKey)
				.sleep(500)

				.pick('button.two')
				.run(pressKey)
				.sleep(500)
				
				.pick('button.three')
				.run(pressKey)
				.sleep(500)

				.pick('button.four')
				.run(pressKey)
				.sleep(500)

				.pick('button.five')
				.run(pressKey)
				.sleep(500)

				.pick('button.six')
				.run(pressKey)
				.sleep(500)

				.pick('button.seven')
				.run(pressKey)
				.sleep(500)

				.pick('button.seven')

				.comment('It should fit 7 digits on the display')

				.pick('label.stake-display')
				.check(function ($element) {
					$element.css('display', 'inline');
					var elWidth = $element.width();
					$element.css('display', 'block');
					return elWidth < keyboardWidth;
				});
		});

		chuckbob.addTest('Press the keyboard C button to test clearing', function () {
			this
				.gosub('Open keyboard view')
				.gosub('Clear display')

				.comment("We press 12C")

				.pick('button.one')
				.run(pressKey)
				.sleep(500)

				.pick('button.two')
				.run(pressKey)
				.sleep(500)
				
				.pick('label.stake-display')
				.check(function ($element) {
					return $element.text() === '12';
				})

				.pick('button.delete')
				.run(pressKey)
				.sleep(500)			

				.comment('The display should be empty')

				.pick('label.stake-display')
				.check(function ($element) {
					return $element.text() === '';
				});
		});

		chuckbob.addTest('Test clicking on keyboard view', function () {
			this
				.gosub('Open keyboard view')
				.gosub('Clear display')

				.comment('We should now have keyboard visible')
				.countNow('#numeric-keyboard-view:visible')
				.equals(1)

				.comment('Click on the overlay')
				.pick('.numeric-keyboard-inner-wrapper')
				.click()

				.comment('We should now have keyboard hidden')
				.countNow('#numeric-keyboard-view:visible')
				.equals(0)

				.gosub('Open keyboard view')	

				.comment('We should now have keyboard visible')
				.countNow('#numeric-keyboard-view:visible')
				.equals(1)		

				.comment('Click on a button')
				.pick('button.one')
				.run(pressKey)
				.sleep(500)

				.comment('The keyboard should be still visible')
				.countNow('#numeric-keyboard-view:visible')
				.equals(1)
		});

		chuckbob.initialize();
	}

	if (window.chuckbob) {
		addTests(window.chuckbob);
	} else {
		window.afterChuckbob = addTests;
	};

})();