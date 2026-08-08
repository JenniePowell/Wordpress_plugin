( function () {
	'use strict';

	function onToggle( checkbox ) {
		var block = checkbox.closest( '.pmt-grid-block' );
		var totalAmountEl = block ? block.querySelector( '.pmt-total__amount' ) : null;
		var progressBarEl = block ? block.querySelector( '.pmt-progress__bar' ) : null;
		var progressWrapEl = block ? block.querySelector( '.pmt-progress' ) : null;

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
				if ( progressBarEl && typeof data.data.percent !== 'undefined' ) {
					progressBarEl.style.width = data.data.percent + '%';
				}
				if ( progressWrapEl && typeof data.data.percent !== 'undefined' ) {
					progressWrapEl.setAttribute( 'aria-valuenow', data.data.percent );
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
