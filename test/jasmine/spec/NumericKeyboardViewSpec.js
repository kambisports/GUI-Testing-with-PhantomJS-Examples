(function (global) {
	'use strict';

	describe('NumericKeyboardView', function () {

		var numericKeyboard,
			$el;

		beforeEach(function () {
			numericKeyboard = new Kambi.NumericKeyboardView();
			numericKeyboard.render();

			$el = numericKeyboard.$el;
			$('body').append($el);
		});

		afterEach(function () {
			numericKeyboard.dispose();
			numericKeyboard = null;
		});

		describe('when pressing on the keypad buttons', function () {

			it('should display maximum 2 decimals', function () {

				$el.find('button.one').trigger('mousedown');
				$el.find('button.two').trigger('mousedown');
				$el.find('button.dot').trigger('mousedown');
				$el.find('button.three').trigger('mousedown');
				$el.find('button.four').trigger('mousedown');
				$el.find('button.five').trigger('mousedown');

				expect(numericKeyboard.$_display.text()).toEqual('12.34');
			});

			it('should display maximum 7 digits', function () {

				$el.find('button.one').trigger('mousedown');
				$el.find('button.two').trigger('mousedown');
				$el.find('button.three').trigger('mousedown');
				$el.find('button.four').trigger('mousedown');
				$el.find('button.five').trigger('mousedown');
				$el.find('button.six').trigger('mousedown');
				$el.find('button.seven').trigger('mousedown');
				$el.find('button.eight').trigger('mousedown');
				$el.find('button.nine').trigger('mousedown');

				expect(numericKeyboard.$_display.text().length).toEqual(7);
			});

			it('should display maximum 1 separator', function () {

				$el.find('button.one').trigger('mousedown');
				$el.find('button.two').trigger('mousedown');
				$el.find('button.dot').trigger('mousedown');
				$el.find('button.dot').trigger('mousedown');
				$el.find('button.four').trigger('mousedown');
				$el.find('button.five').trigger('mousedown');

				expect(numericKeyboard.$_display.text()).toEqual('12.45');
			});

			it('should fit 7 digits on the display', function () {

				var keyboardWidth = $el.find('.numeric-keyboard').width();

				$el.find('button.one').trigger('mousedown');
				$el.find('button.two').trigger('mousedown');
				$el.find('button.three').trigger('mousedown');
				$el.find('button.four').trigger('mousedown');
				$el.find('button.five').trigger('mousedown');
				$el.find('button.six').trigger('mousedown');
				$el.find('button.seven').trigger('mousedown');

				// change element to be displayed inline
				numericKeyboard.$_display.css('display', 'inline');

				// test width
				expect(numericKeyboard.$_display.width()).toBeLessThan(keyboardWidth);
			});

		});

		describe('when pressing on C button', function () {

			it('should clear display', function () {

				$el.find('button.one').trigger('mousedown');
				$el.find('button.two').trigger('mousedown');

				expect(numericKeyboard.$_display.text()).toEqual('12');

				$el.find('button.delete').trigger('mousedown');

				expect(numericKeyboard.$_display.text()).toEqual('');
			});

		});

		describe('when pressing on keyboard view', function () {

			it('should hide the view if pressing on the overlay', function () {

				expect(numericKeyboard.$el.is(':visible')).toBeTruthy();

				$el.find('.numeric-keyboard-inner-wrapper').trigger('click');
				
				expect(numericKeyboard.$el.is(':visible')).toBeFalsy();
			});

			it('should not hide the view if pressing on a button', function () {

				expect(numericKeyboard.$el.is(':visible')).toBeTruthy();

				$el.find('button.one').trigger('click');
				
				expect(numericKeyboard.$el.is(':visible')).toBeTruthy();
			});

		});

	});

})(this);
