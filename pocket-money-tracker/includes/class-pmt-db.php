<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Thin data-access layer over the plugin's three tables.
 */
class PMT_DB {

	public static function children_table() {
		global $wpdb;
		return $wpdb->prefix . 'pmt_children';
	}

	public static function tasks_table() {
		global $wpdb;
		return $wpdb->prefix . 'pmt_tasks';
	}

	public static function completions_table() {
		global $wpdb;
		return $wpdb->prefix . 'pmt_completions';
	}

	/* ---------------- Children ---------------- */

	public static function get_children() {
		global $wpdb;
		$table = self::children_table();
		return $wpdb->get_results( "SELECT * FROM {$table} ORDER BY sort_order ASC, id ASC" );
	}

	public static function get_child( $child_id ) {
		global $wpdb;
		$table = self::children_table();
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $child_id ) );
	}

	public static function insert_child( $name, $weekly_amount_pence ) {
		global $wpdb;
		$table = self::children_table();
		$next_order = (int) $wpdb->get_var( "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM {$table}" );
		$wpdb->insert(
			$table,
			array(
				'name'                => $name,
				'weekly_amount_pence' => $weekly_amount_pence,
				'sort_order'          => $next_order,
			),
			array( '%s', '%d', '%d' )
		);
		return (int) $wpdb->insert_id;
	}

	public static function update_child( $child_id, $name, $weekly_amount_pence ) {
		global $wpdb;
		$table = self::children_table();
		return $wpdb->update(
			$table,
			array(
				'name'                => $name,
				'weekly_amount_pence' => $weekly_amount_pence,
			),
			array( 'id' => $child_id ),
			array( '%s', '%d' ),
			array( '%d' )
		);
	}

	public static function delete_child( $child_id ) {
		global $wpdb;
		$tasks_table       = self::tasks_table();
		$completions_table = self::completions_table();
		$children_table    = self::children_table();

		$task_ids = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$tasks_table} WHERE child_id = %d", $child_id ) );
		if ( ! empty( $task_ids ) ) {
			$placeholders = implode( ',', array_fill( 0, count( $task_ids ), '%d' ) );
			$wpdb->query( $wpdb->prepare( "DELETE FROM {$completions_table} WHERE task_id IN ({$placeholders})", $task_ids ) ); // phpcs:ignore
		}
		$wpdb->delete( $tasks_table, array( 'child_id' => $child_id ), array( '%d' ) );
		$wpdb->delete( $completions_table, array( 'child_id' => $child_id ), array( '%d' ) );
		$wpdb->delete( $children_table, array( 'id' => $child_id ), array( '%d' ) );
	}

	/* ---------------- Tasks ---------------- */

	public static function get_tasks( $child_id, $active_only = true ) {
		global $wpdb;
		$table = self::tasks_table();
		if ( $active_only ) {
			return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE child_id = %d AND active = 1 ORDER BY sort_order ASC, id ASC", $child_id ) );
		}
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE child_id = %d ORDER BY sort_order ASC, id ASC", $child_id ) );
	}

	public static function get_task( $task_id ) {
		global $wpdb;
		$table = self::tasks_table();
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $task_id ) );
	}

	public static function insert_task( $child_id, $name ) {
		global $wpdb;
		$table = self::tasks_table();
		$next_order = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM {$table} WHERE child_id = %d", $child_id ) );
		$wpdb->insert(
			$table,
			array(
				'child_id'   => $child_id,
				'name'       => $name,
				'sort_order' => $next_order,
				'active'     => 1,
			),
			array( '%d', '%s', '%d', '%d' )
		);
		return (int) $wpdb->insert_id;
	}

	public static function update_task_name( $task_id, $name ) {
		global $wpdb;
		$table = self::tasks_table();
		return $wpdb->update( $table, array( 'name' => $name ), array( 'id' => $task_id ), array( '%s' ), array( '%d' ) );
	}

	public static function set_task_active( $task_id, $active ) {
		global $wpdb;
		$table = self::tasks_table();
		return $wpdb->update( $table, array( 'active' => $active ? 1 : 0 ), array( 'id' => $task_id ), array( '%d' ), array( '%d' ) );
	}

	public static function delete_task( $task_id ) {
		global $wpdb;
		$tasks_table       = self::tasks_table();
		$completions_table = self::completions_table();
		$wpdb->delete( $completions_table, array( 'task_id' => $task_id ), array( '%d' ) );
		$wpdb->delete( $tasks_table, array( 'id' => $task_id ), array( '%d' ) );
	}

	/* ---------------- Completions ---------------- */

	/**
	 * Get completions for a child within a date range, keyed "task_id|Y-m-d".
	 */
	public static function get_completions_map( $child_id, $start_date, $end_date ) {
		global $wpdb;
		$table = self::completions_table();
		$rows  = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT task_id, task_date, completed FROM {$table} WHERE child_id = %d AND task_date BETWEEN %s AND %s",
				$child_id,
				$start_date,
				$end_date
			)
		);
		$map = array();
		foreach ( $rows as $row ) {
			$map[ $row->task_id . '|' . $row->task_date ] = (int) $row->completed;
		}
		return $map;
	}

	/**
	 * Toggle (or explicitly set) a task's completion state for a given date.
	 * Returns the resulting 0/1 state.
	 */
	public static function set_completion( $task_id, $child_id, $date, $completed ) {
		global $wpdb;
		$table = self::completions_table();

		$existing_id = $wpdb->get_var(
			$wpdb->prepare( "SELECT id FROM {$table} WHERE task_id = %d AND task_date = %s", $task_id, $date )
		);

		if ( $existing_id ) {
			$wpdb->update(
				$table,
				array(
					'completed'  => $completed ? 1 : 0,
					'updated_at' => current_time( 'mysql' ),
				),
				array( 'id' => $existing_id ),
				array( '%d', '%s' ),
				array( '%d' )
			);
		} else {
			$wpdb->insert(
				$table,
				array(
					'task_id'    => $task_id,
					'child_id'   => $child_id,
					'task_date'  => $date,
					'completed'  => $completed ? 1 : 0,
					'updated_at' => current_time( 'mysql' ),
				),
				array( '%d', '%d', '%s', '%d', '%s' )
			);
		}

		return $completed ? 1 : 0;
	}
}
