<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Renders the tasks x days checklist grid. Shared by the admin overview
 * page and the frontend shortcode so both look and behave the same way.
 */
class PMT_Grid {

	public static function render_week_nav( $week_start, $base_url, $week_param = 'week' ) {
		$today_week_start = PMT_Helpers::week_start();
		$prev_week        = PMT_Helpers::adjacent_week( $week_start, 'prev' );
		$next_week        = PMT_Helpers::adjacent_week( $week_start, 'next' );
		$week_end         = PMT_Helpers::week_end( $week_start );

		$prev_url = add_query_arg( $week_param, $prev_week, $base_url );
		$next_url = add_query_arg( $week_param, $next_week, $base_url );

		$label = sprintf(
			'%s - %s',
			date_i18n( 'j M', strtotime( $week_start ) ),
			date_i18n( 'j M Y', strtotime( $week_end ) )
		);

		echo '<div class="pmt-week-nav">';
		echo '<a class="pmt-week-nav__link" href="' . esc_url( $prev_url ) . '">&larr; ' . esc_html__( 'Previous week', 'pocket-money-tracker' ) . '</a>';
		echo '<span class="pmt-week-nav__label">' . esc_html( $label ) . '</span>';
		echo '<a class="pmt-week-nav__link" href="' . esc_url( $next_url ) . '">' . esc_html__( 'Next week', 'pocket-money-tracker' ) . ' &rarr;</a>';
		if ( $week_start !== $today_week_start ) {
			$this_week_url = add_query_arg( $week_param, $today_week_start, $base_url );
			echo ' <a class="pmt-week-nav__today" href="' . esc_url( $this_week_url ) . '">' . esc_html__( 'This week', 'pocket-money-tracker' ) . '</a>';
		}
		echo '</div>';
	}

	public static function render_table( $week_data ) {
		$tasks = $week_data['tasks'];
		$days  = $week_data['days'];
		$child = $week_data['child'];
		$map   = $week_data['completions_map'];
		$today = current_time( 'Y-m-d' );

		if ( empty( $tasks ) ) {
			echo '<p class="pmt-empty">' . esc_html__( 'No tasks set up for this child yet.', 'pocket-money-tracker' ) . '</p>';
			return;
		}

		echo '<div class="pmt-grid-block" data-child-id="' . esc_attr( $child->id ) . '">';

		echo '<div class="pmt-grid-wrap"><table class="pmt-grid">';
		echo '<thead><tr><th class="pmt-grid__task-col">' . esc_html__( 'Task', 'pocket-money-tracker' ) . '</th>';
		foreach ( $days as $day ) {
			$is_today = ( $day === $today );
			echo '<th class="pmt-grid__day' . ( $is_today ? ' pmt-grid__day--today' : '' ) . '">';
			echo esc_html( date_i18n( 'D', strtotime( $day ) ) ) . '<span class="pmt-grid__date">' . esc_html( date_i18n( 'j', strtotime( $day ) ) ) . '</span>';
			if ( $is_today ) {
				echo '<span class="pmt-grid__today-badge">' . esc_html__( 'Today', 'pocket-money-tracker' ) . '</span>';
			}
			echo '</th>';
		}
		echo '</tr></thead><tbody>';

		foreach ( $tasks as $task ) {
			echo '<tr><td class="pmt-grid__task-col">' . esc_html( $task->name ) . '</td>';
			foreach ( $days as $day ) {
				$key       = $task->id . '|' . $day;
				$completed = ! empty( $map[ $key ] );
				$is_future = $day > $today;
				$is_today  = ( $day === $today ) ? ' pmt-grid__day--today' : '';
				$aria      = sprintf(
					/* translators: 1: task name, 2: date */
					__( '%1$s — %2$s', 'pocket-money-tracker' ),
					$task->name,
					date_i18n( 'l j F', strtotime( $day ) )
				);

				echo '<td class="pmt-grid__day' . esc_attr( $is_today ) . '">';
				printf(
					'<input type="checkbox" class="pmt-check" data-child-id="%1$d" data-task-id="%2$d" data-date="%3$s" aria-label="%4$s" %5$s %6$s />',
					(int) $child->id,
					(int) $task->id,
					esc_attr( $day ),
					esc_attr( $aria ),
					checked( $completed, true, false ),
					disabled( $is_future, true, false )
				);
				echo '</td>';
			}
			echo '</tr>';
		}

		echo '</tbody></table></div>';

		self::render_reward( $week_data );

		echo '</div>';
	}

	private static function render_reward( $week_data ) {
		$cap     = (int) $week_data['weekly_cap_pence'];
		$earned  = (int) $week_data['total_earned'];
		$percent = $cap > 0 ? min( 100, (int) round( ( $earned / $cap ) * 100 ) ) : 0;

		echo '<div class="pmt-reward">';
		printf(
			'<div class="pmt-reward__row"><span class="pmt-reward__label">%1$s</span><span class="pmt-reward__amount"><strong class="pmt-total__amount">%2$s</strong> <span class="pmt-reward__cap">%3$s %4$s</span></span></div>',
			esc_html__( 'Earned this week', 'pocket-money-tracker' ),
			esc_html( PMT_Helpers::format_money( $earned ) ),
			esc_html__( 'of', 'pocket-money-tracker' ),
			esc_html( PMT_Helpers::format_money( $cap ) )
		);
		printf(
			'<div class="pmt-progress" role="progressbar" aria-valuenow="%1$d" aria-valuemin="0" aria-valuemax="100" aria-label="%2$s"><div class="pmt-progress__bar" style="width:%1$d%%"></div></div>',
			(int) $percent,
			esc_attr__( 'Weekly pocket money progress', 'pocket-money-tracker' )
		);
		echo '</div>';
	}
}
