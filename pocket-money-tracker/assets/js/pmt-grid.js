( function () {
	'use strict';

	function onToggle( checkbox ) {
		var table = checkbox.closest( 'table.pmt-grid' );
		var totalAmountEl = table && table.nextElementSibling && table.nextElementSibling.classList.contains( 'pmt-total' )
			? table.nextElementSibling.querySelector( '.pmt-total__amount' )
			: null;

		var completed = checkbox.checked ? 1 : 0;
		checkbox.disabled = true;

		var body = new URLSearchParams();
		body.append( 'action', 'pmt_toggle_task' );
		body.append( 'nonce', window.pmtData.nonce );
		body.append( 'child_id', checkbox.getAttribute( 'data-child-id' ) );
		body.append( 'task_id', checkbox.getAttribute( 'data-task-id' ) );
		body.append( 'date', checkbox.getAttribute( 'data-date' ) );
		body.append( 'completed', completed );

		fetch( window.pmtData.ajaxUrl, {
			method: 'POST',
			credentials: 'same-origin',
			body: body,
		} )
			.then( function ( response ) {
				return response.json();
			} )
			.then( function ( data ) {
				checkbox.disabled = false;
				if ( ! data.success ) {
					checkbox.checked = ! checkbox.checked;
					window.alert( ( data.data && data.data.message ) || 'Something went wrong. Please try again.' );
					return;
				}
				if ( totalAmountEl ) {
					totalAmountEl.textContent = data.data.total_earned_formatted;
				}
			} )
			.catch( function () {
				checkbox.disabled = false;
				checkbox.checked = ! checkbox.checked;
				window.alert( 'Network error — please try again.' );
			} );
	}

	document.addEventListener( 'DOMContentLoaded', function () {
		document.querySelectorAll( '.pmt-check' ).forEach( function ( checkbox ) {
			checkbox.addEventListener( 'change', function () {
				onToggle( checkbox );
			} );
		} );
	} );
}() );
