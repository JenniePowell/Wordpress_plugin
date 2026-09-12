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
	 * How many "shares" of the weekly pot one task is worth: its value tier
	 * (5/10/15) times how many times it can be completed in a week — 7 for
	 * daily, 1 for weekly. E.g. a 15% weekly task is 15 shares; a 5% daily
	 * task is 35 shares (5 x 7), since it can earn its 5% on any of 7 days.
	 * Total shares across a pool of tasks is what the weekly pot gets split
	 * over, so adding or removing tasks reshapes everyone's cut rather than
	 * changing what a full week is worth.
	 */
	public static function task_shares( $task ) {
		$instances = ( 'weekly' === $task->frequency ) ? 1 : self::DAYS_IN_WEEK;
		return ( (int) $task->value_percent ) * $instances;
	}

	/**
	 * Pence value of one share, given the total shares across a pool of
	 * tasks. This is only ever used for *display* (the admin Value column)
	 * and for bonus tasks — the core weekly total is worked out a different,
	 * more precise way (see calculate_week) that doesn't compound this
	 * rounding per completion, since flooring a per-share rate this way and
	 * then multiplying it back up can lose a large chunk of the pot once
	 * there are enough tasks (e.g. 18 tasks on a £5 pot floors 500/430 down
	 * to £0.01/share, discarding a genuine 14% of the total).
	 */
	public static function per_share_pence( $weekly_amount_pence, $total_shares ) {
		if ( $total_shares <= 0 ) {
			return 0;
		}
		return (int) floor( $weekly_amount_pence / $total_shares );
	}

	/**
	 * What a task is worth if fully completed this week (every day for a
	 * daily task, the once for a weekly one) — the same single-division
	 * calculation calculate_week uses for the real total, just isolated to
	 * one task's shares, so it's an exact figure rather than an estimate.
	 */
	public static function task_full_completion_pence( $task, $total_shares, $weekly_amount_pence ) {
		if ( $total_shares <= 0 ) {
			return 0;
		}
		return (int) floor( $weekly_amount_pence * self::task_shares( $task ) / $total_shares );
	}

	/**
	 * Splits a child's active tasks into the "core" pool that gets
	 * normalised to 100% (every non-bonus task) and the bonus tasks that sit
	 * outside it. If every active task happens to be flagged bonus, there's
	 * no core pool to scale from, so all of them fall back into the pool
	 * rather than being worth nothing.
	 */
	public static function split_core_and_bonus_tasks( $tasks ) {
		$core = array_values(
			array_filter(
				$tasks,
				function ( $task ) {
					return empty( $task->is_bonus );
				}
			)
		);
		if ( ! empty( $core ) ) {
			$bonus = array_values(
				array_filter(
					$tasks,
					function ( $task ) {
						return ! empty( $task->is_bonus );
					}
				)
			);
			return array( $core, $bonus );
		}
		return array( $tasks, array() );
	}

	/**
	 * How many times this task was completed this week: 0-7 for a daily
	 * task (one per completed day), 0 or 1 for a weekly task (keyed on the
	 * week's Monday date since it isn't tied to any single day).
	 */
	public static function completed_instances( $task, $days, $week_start, $completions_map ) {
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
	 * tasks, days, completion state, and total earned.
	 *
	 * Core (non-bonus) tasks are normalised so completing all of them earns
	 * exactly the full weekly amount, regardless of how many tasks exist or
	 * how their weights are split — done by summing the *shares actually
	 * completed* across the whole pool and dividing by total shares in one
	 * go (floor(cap * completed_shares / total_shares)), rather than
	 * flooring a per-share rate up front and multiplying it back out, which
	 * would throw away a large chunk of the pot once there are many tasks.
	 * When every core task is completed, completed_shares == total_shares,
	 * so this is exactly the weekly cap with zero rounding loss.
	 *
	 * Bonus tasks earn on top of that at a per-share rate (a small, one-off
	 * rounding loss there is fine — they're extras, not part of the 100%
	 * guarantee), and the running total is still capped at the weekly
	 * amount as a hard ceiling either way.
	 */
	public static function calculate_week( $child, $week_start ) {
		$tasks    = PMT_DB::get_tasks( $child->id, true );
		$days     = self::week_days( $week_start );
		$week_end = self::week_end( $week_start );
		$cap      = (int) $child->weekly_amount_pence;

		$completions_map = PMT_DB::get_completions_map( $child->id, $week_start, $week_end );

		list( $core_tasks, $bonus_tasks ) = self::split_core_and_bonus_tasks( $tasks );

		$total_shares     = 0;
		$completed_shares = 0;
		foreach ( $core_tasks as $task ) {
			$shares            = self::task_shares( $task );
			$total_shares     += $shares;
			$completed_shares += self::completed_instances( $task, $days, $week_start, $completions_map ) * ( (int) $task->value_percent );
		}
		$core_earned = ( $total_shares > 0 ) ? (int) floor( $cap * $completed_shares / $total_shares ) : 0;

		$per_share_pence = self::per_share_pence( $cap, $total_shares );
		$bonus_earned    = 0;
		foreach ( $bonus_tasks as $task ) {
			$instances     = self::completed_instances( $task, $days, $week_start, $completions_map );
			$bonus_earned += $instances * $per_share_pence * ( (int) $task->value_percent );
		}

		return array(
			'child'            => $child,
			'tasks'            => $tasks,
			'days'             => $days,
			'week_start'       => $week_start,
			'week_end'         => $week_end,
			'completions_map'  => $completions_map,
			'per_share_pence'  => $per_share_pence,
			'total_earned'     => min( $core_earned + $bonus_earned, $cap ),
			'weekly_cap_pence' => $cap,
		);
	}
}
