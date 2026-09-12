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
	 * Pence value of one completion of this task: a fixed percentage of the
	 * child's weekly amount (5/10/15%), independent of how many other tasks
	 * exist. Floored so a single completion never rounds up past its tier.
	 */
	public static function task_value_pence( $task, $weekly_amount_pence ) {
		return (int) floor( $weekly_amount_pence * ( (int) $task->value_percent ) / 100 );
	}

	/**
	 * Pence earned from one task this week: a daily task can be ticked on up
	 * to 7 days (each worth its full value_percent), a weekly task once,
	 * keyed on the week's Monday date since it isn't tied to any single day.
	 */
	public static function earned_pence_for_task( $task, $days, $week_start, $completions_map, $weekly_amount_pence ) {
		$value = self::task_value_pence( $task, $weekly_amount_pence );

		if ( 'weekly' === $task->frequency ) {
			$key = $task->id . '|' . $week_start;
			return empty( $completions_map[ $key ] ) ? 0 : $value;
		}

		$count = 0;
		foreach ( $days as $day ) {
			$key = $task->id . '|' . $day;
			if ( ! empty( $completions_map[ $key ] ) ) {
				$count++;
			}
		}
		return $value * $count;
	}

	/**
	 * Build the full data structure needed to render one child's week:
	 * tasks, days, completion state, and total earned. Since each task now
	 * carries its own fixed percentage rather than an auto-balanced share,
	 * tasks can add up to more than 100% by design (that's what gives "bonus"
	 * tasks room to make up for a missed day) — so the running total is
	 * explicitly capped at the weekly amount here.
	 */
	public static function calculate_week( $child, $week_start ) {
		$tasks    = PMT_DB::get_tasks( $child->id, true );
		$days     = self::week_days( $week_start );
		$week_end = self::week_end( $week_start );
		$cap      = (int) $child->weekly_amount_pence;

		$completions_map = PMT_DB::get_completions_map( $child->id, $week_start, $week_end );

		$raw_earned = 0;
		foreach ( $tasks as $task ) {
			$raw_earned += self::earned_pence_for_task( $task, $days, $week_start, $completions_map, $cap );
		}

		return array(
			'child'            => $child,
			'tasks'            => $tasks,
			'days'             => $days,
			'week_start'       => $week_start,
			'week_end'         => $week_end,
			'completions_map'  => $completions_map,
			'total_earned'     => min( $raw_earned, $cap ),
			'weekly_cap_pence' => $cap,
		);
	}
}
