<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Week math and money calculations. All money is handled in integer pence
 * internally so totals never drift and a child's weekly total can never
 * exceed their weekly cap.
 */
class PMT_Helpers {

	const DAYS_IN_WEEK = 7;

	/**
	 * Monday date (Y-m-d) of the week containing $date.
	 */
	public static function week_start( $date = null ) {
		if ( null === $date ) {
			$date = current_time( 'Y-m-d' );
		}
		$timestamp = strtotime( $date );
		$day_of_week = (int) gmdate( 'N', $timestamp ); // 1 (Mon) - 7 (Sun)
		$monday_timestamp = strtotime( '-' . ( $day_of_week - 1 ) . ' days', $timestamp );
		return gmdate( 'Y-m-d', $monday_timestamp );
	}

	/**
	 * Array of 7 Y-m-d date strings starting at $week_start (Monday).
	 */
	public static function week_days( $week_start ) {
		$days      = array();
		$timestamp = strtotime( $week_start );
		for ( $i = 0; $i < self::DAYS_IN_WEEK; $i++ ) {
			$days[] = gmdate( 'Y-m-d', strtotime( "+{$i} days", $timestamp ) );
		}
		return $days;
	}

	public static function week_end( $week_start ) {
		return gmdate( 'Y-m-d', strtotime( '+6 days', strtotime( $week_start ) ) );
	}

	public static function adjacent_week( $week_start, $direction ) {
		$offset = ( $direction === 'next' ) ? '+7 days' : '-7 days';
		return gmdate( 'Y-m-d', strtotime( $offset, strtotime( $week_start ) ) );
	}

	public static function is_valid_date( $date ) {
		if ( empty( $date ) ) {
			return false;
		}
		$d = DateTime::createFromFormat( 'Y-m-d', $date );
		return $d && $d->format( 'Y-m-d' ) === $date;
	}

	public static function format_money( $pence ) {
		return '£' . number_format( $pence / 100, 2 );
	}

	/**
	 * Per-task pence value for a child, given their current active task count.
	 * Uses floor() so num_tasks * 7 * per_task_pence never exceeds the weekly cap.
	 */
	public static function per_task_pence( $weekly_amount_pence, $num_tasks ) {
		if ( $num_tasks <= 0 ) {
			return 0;
		}
		return (int) floor( $weekly_amount_pence / ( $num_tasks * self::DAYS_IN_WEEK ) );
	}

	/**
	 * Build the full data structure needed to render one child's week:
	 * tasks, days, completion state per task/day, per-task value, and total earned.
	 */
	public static function calculate_week( $child, $week_start ) {
		$tasks = PMT_DB::get_tasks( $child->id, true );
		$days  = self::week_days( $week_start );
		$week_end = self::week_end( $week_start );

		$num_tasks      = count( $tasks );
		$per_task_pence = self::per_task_pence( (int) $child->weekly_amount_pence, $num_tasks );

		$completions_map = PMT_DB::get_completions_map( $child->id, $week_start, $week_end );

		$completed_count = 0;
		foreach ( $tasks as $task ) {
			foreach ( $days as $day ) {
				$key = $task->id . '|' . $day;
				if ( ! empty( $completions_map[ $key ] ) ) {
					$completed_count++;
				}
			}
		}

		return array(
			'child'            => $child,
			'tasks'            => $tasks,
			'days'             => $days,
			'week_start'       => $week_start,
			'week_end'         => $week_end,
			'completions_map'  => $completions_map,
			'per_task_pence'   => $per_task_pence,
			'total_earned'     => $per_task_pence * $completed_count,
			'weekly_cap_pence' => (int) $child->weekly_amount_pence,
		);
	}
}
