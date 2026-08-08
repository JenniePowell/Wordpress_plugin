<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Handles the AJAX call that ticks/unticks a task for a given date.
 * Registered for both logged-in and logged-out users, since kids using
 * the frontend checklist don't have their own WordPress accounts.
 */
class PMT_Ajax {

	const NONCE_ACTION = 'pmt_toggle_task';

	public function __construct() {
		add_action( 'wp_ajax_pmt_toggle_task', array( $this, 'toggle_task' ) );
		add_action( 'wp_ajax_nopriv_pmt_toggle_task', array( $this, 'toggle_task' ) );
	}

	public function toggle_task() {
		check_ajax_referer( self::NONCE_ACTION, 'nonce' );

		$child_id = isset( $_POST['child_id'] ) ? absint( $_POST['child_id'] ) : 0;
		$task_id  = isset( $_POST['task_id'] ) ? absint( $_POST['task_id'] ) : 0;
		$date     = isset( $_POST['date'] ) ? sanitize_text_field( wp_unslash( $_POST['date'] ) ) : '';
		$completed = isset( $_POST['completed'] ) ? (int) $_POST['completed'] : 0;

		if ( ! $child_id || ! $task_id || ! PMT_Helpers::is_valid_date( $date ) ) {
			wp_send_json_error( array( 'message' => __( 'Invalid request.', 'pocket-money-tracker' ) ), 400 );
		}

		if ( $date > current_time( 'Y-m-d' ) ) {
			wp_send_json_error( array( 'message' => __( 'You can only tick off today or earlier.', 'pocket-money-tracker' ) ), 400 );
		}

		$task = PMT_DB::get_task( $task_id );
		if ( ! $task || (int) $task->child_id !== $child_id ) {
			wp_send_json_error( array( 'message' => __( 'Task not found.', 'pocket-money-tracker' ) ), 404 );
		}

		$child = PMT_DB::get_child( $child_id );
		if ( ! $child ) {
			wp_send_json_error( array( 'message' => __( 'Child not found.', 'pocket-money-tracker' ) ), 404 );
		}

		$new_state = PMT_DB::set_completion( $task_id, $child_id, $date, $completed ? 1 : 0 );

		$week_start = PMT_Helpers::week_start( $date );
		$week_data  = PMT_Helpers::calculate_week( $child, $week_start );
		$cap        = (int) $week_data['weekly_cap_pence'];
		$percent    = $cap > 0 ? min( 100, (int) round( ( $week_data['total_earned'] / $cap ) * 100 ) ) : 0;

		wp_send_json_success(
			array(
				'completed'              => $new_state,
				'total_earned_pence'     => $week_data['total_earned'],
				'total_earned_formatted' => PMT_Helpers::format_money( $week_data['total_earned'] ),
				'weekly_cap_formatted'   => PMT_Helpers::format_money( $week_data['weekly_cap_pence'] ),
				'percent'                => $percent,
			)
		);
	}

}
