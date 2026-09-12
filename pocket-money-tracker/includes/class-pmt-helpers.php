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
	 * How many "shares" of the weekly pot one task is worth: a daily task can
	 * be done on up to 7 days, a weekly task only once — so daily tasks are
	 * worth 7x as much per completion as weekly ones, spread across the week.
	 */
	public static function task_shares( $task ) {
		return ( 'weekly' === $task->frequency ) ? 1 : self::DAYS_IN_WEEK;
	}

	/**
	 * Pence value of a single share, given the total shares across a child's
	 * active tasks. Uses floor() so total_shares * per_share_pence never
	 * exceeds the weekly cap.
	 */
	public static function per_share_pence( $weekly_amount_pence, $total_shares ) {
		if ( $total_shares <= 0 ) {
			return 0;
		}
		return (int) floor( $weekly_amount_pence / $total_shares );
	}

	/**
	 * How many of a task's shares were actually earned this week: for a daily
	 * task, one per completed day (0-7); for a weekly task, 0 or 1, keyed on
	 * the week's Monday date since it isn't tied to any single day.
	 */
	public static function completed_units_for_task( $task, $days, $week_start, $completions_map ) {
		if ( 'weekly' === $task->frequency ) {
			$key = $task->id . '|' . $week_start;
			return empty( $completions_map[ $key ] ) ? 0 : 1;
		}
		$count = 0;
		foreach ( $days as $day ) {
			$key = $task->id . '|' . $day;
			if ( ! empty( $completions_map[ $key ] ) ) {
				$count++;
			}
		}
		return $count;
	}

	/**
	 * Build the full data structure needed to render one child's week:
	 * tasks, days, completion state, per-share value, and total earned.
	 */
	public static function calculate_week( $child, $week_start ) {
		$tasks    = PMT_DB::get_tasks( $child->id, true );
		$days     = self::week_days( $week_start );
		$week_end = self::week_end( $week_start );

		$total_shares = 0;
		foreach ( $tasks as $task ) {
			$total_shares += self::task_shares( $task );
		}
		$per_share_pence = self::per_share_pence( (int) $child->weekly_amount_pence, $total_shares );

		$completions_map = PMT_DB::get_completions_map( $child->id, $week_start, $week_end );

		$completed_units = 0;
		foreach ( $tasks as $task ) {
			$completed_units += self::completed_units_for_task( $task, $days, $week_start, $completions_map );
		}

		return array(
			'child'            => $child,
			'tasks'            => $tasks,
			'days'             => $days,
			'week_start'       => $week_start,
			'week_end'         => $week_end,
			'completions_map'  => $completions_map,
			'per_share_pence'  => $per_share_pence,
			'total_earned'     => $per_share_pence * $completed_units,
			'weekly_cap_pence' => (int) $child->weekly_amount_pence,
		);
	}
}
