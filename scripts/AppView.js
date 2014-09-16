(function (global) {
	'use strict';

	var AppView = Backbone.View.extend({

		id: 'app-view',

		events: {
			'click #open-keyboard-btn': "_onOpenKeyboardBtnClick"
		},

		
		_numericKeyboardView: undefined,

		//---------------------------------------------------------------------
		//
		//	Public methods
		//
		//---------------------------------------------------------------------
		
		render: function () {
			var that = this;

			$.ajax({
  				url: 'templates/AppView.html',
  				async: false,
  				success: function (data) {
					that.$el.html(data);
				}
			});

			$('body').append(this.$el);

			this._numericKeyboardView = new Kambi.NumericKeyboardView();
			this._numericKeyboardView.render();
			this._numericKeyboardView.hide();

			this.$el.after(this._numericKeyboardView.$el);

			return this;
		},

		//--------------------------------------
		//	Handlers
		//--------------------------------------

		/**
		 * Handler for the click event on the open keyboard button
		 * It opens the keypad view.
		 * @author	filmic
		 * @param	{Event} evt Event object
		 * @private
		 */
		_onOpenKeyboardBtnClick: function (evt) {
			evt.preventDefault();
			this._numericKeyboardView.show();
		}

	});

	global.Kambi = global.Kambi || {};
	global.Kambi.AppView = AppView;	

})(this);