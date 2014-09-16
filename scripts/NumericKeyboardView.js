(function (global) {
	'use strict';
	
	var NumericKeyboardView = Backbone.View.extend({

		id: 'numeric-keyboard-view',

		events: {
			'mousedown .keys button': '_onButtonClick',
			'touchstart .keys button': '_onButtonClick',
			'click': '_onClick'
		},

		// DOM refs
		$_display: null,
		$_defaultText: null,


		//---------------------------------------------------------------------
		//
		//	Public methods
		//
		//---------------------------------------------------------------------

		render: function () {
			var that = this;

			$.ajax({
  				url: 'templates/NumericKeyboard.html',
  				async: false,
  				success: function (data) {
					that.$el.html(data);
				}
			});

			this.$_display = this.$el.find('.stake-display');
			this.$_defaultText = this.$el.find('.default-text');

			return this;
		},

		show: function () {
			this.$_defaultText.show();
			this.$el.css('display', 'table');
		},

		hide: function () {
			this.$el.css('display', 'none');
			this._updateDisplayLabel('');
		},

		dispose: function () {
			this.off();
			this.remove();
		},


		//--------------------------------------
		//	Handlers
		//--------------------------------------

		/**
		 * Handler for the click event on the container (area around the keypad)
		 * It closes the keypad view.
		 * @author	filmic
		 * @param	{Event} evt Event object
		 * @private
		 */
		_onClick: function (evt) {
			evt.stopPropagation();
			evt.preventDefault();

			if (evt.target.className === NumericKeyboardView.CLASS_INNER_WRAPPER) {
				this.hide();
			}
		},


		/**
		 * Handler for touch start event on the keyboard button.
		 * Regarding the type of the button it triggers various action
		 * @author	filmic
		 * @param	{Event} evt Event object
		 * @return	{Boolean}
		 * @private
		 */
		_onButtonClick: function (evt) {
			var text, textLength, key, keyText, keyTextAsNumber, keyId, dotIndex;

			evt.stopPropagation();
			evt.preventDefault();

			text = this.$_display.text();
			textLength = text.length;
			key = $(evt.target);
			keyText = key.text();
			keyTextAsNumber = +keyText;
			keyId = key.data('id');
			this.$_defaultText.hide();

			// use class name instead of :active pseudo class
			// to avoid double effect on some devices (some devices
			// trigger both touchstart and mousedown events)
			key.addClass(NumericKeyboardView.CLASS_ACTIVE);
			setTimeout(function () {
				key.removeClass(NumericKeyboardView.CLASS_ACTIVE);
			}, 50);


			dotIndex = text.indexOf(NumericKeyboardView.CHAR_SEPARATOR);

			if (keyId === NumericKeyboardView.KEY_DELETE) {
				this._handleDeleteClick();
			} else if (keyId === NumericKeyboardView.KEY_OK) {
				this._handleOKClick(text);
			} else if (keyId === NumericKeyboardView.KEY_SEPARATOR &&
					textLength < NumericKeyboardView.MAX_DISPLAY_LENGTH && // Limit label to 7 digits
					dotIndex < 0) { // Allow one separator only
				this._handleSeparatorClick(text);
			} else if (!_.isNaN(keyTextAsNumber) &&
					textLength < NumericKeyboardView.MAX_DISPLAY_LENGTH && // Limit label to 7 digits
					(dotIndex < 0 || (dotIndex >= 0 && dotIndex > text.length - 3))) { // Allow one separator and 2 decimals only
				this._handleDigitClick(text, key);
			}
		},

		/**
		 * Handles C button click
		 * @author	filmic
		 * @private
		 */
		_handleDeleteClick: function () {
			this._updateDisplayLabel('');
		},

		/**
		 * Handles OK button click
		 * @author	filmic
		 * @param	{String} text Entered stake value
		 * @private
		 */
		_handleOKClick: function (value) {
			this.hide();
			
			this.trigger(NumericKeyboardView.EVENT_STAKE_ENTERED, value);
		},

		/**
		 * Handles Separator button click
		 * @author	filmic
		 * @param	{String} text Entered stake value
		 * @private
		 */
		_handleSeparatorClick: function (text) {
			this._updateDisplayLabel(text + NumericKeyboardView.CHAR_SEPARATOR);
		},

		/**
		 * Handles digit button click
		 * @author	filmic
		 * @param	{String} text Entered stake value
		 * @private
		 */
		_handleDigitClick: function (text, key) {
			this._updateDisplayLabel(text + key.text());
		},

		/**
		 * Updates the display label
		 * @author	filmic
		 * @param	{String} text Entered stake value
		 * @private
		 */
		_updateDisplayLabel: function (text) {
			this.$_display.text(text);
		}

	});

	NumericKeyboardView.EVENT_STAKE_ENTERED = 'eventStakeEntered';

	NumericKeyboardView.KEY_DELETE = 'delete';
	NumericKeyboardView.KEY_OK = 'ok';
	NumericKeyboardView.KEY_SEPARATOR = 'separator';
	
	NumericKeyboardView.CHAR_SEPARATOR = '.';
	NumericKeyboardView.MAX_DISPLAY_LENGTH = 7;

	NumericKeyboardView.CLASS_ACTIVE = 'active';
	NumericKeyboardView.CLASS_INNER_WRAPPER = 'numeric-keyboard-inner-wrapper';
	
	global.Kambi = global.Kambi || {};
	global.Kambi.NumericKeyboardView = NumericKeyboardView;	

})(this);