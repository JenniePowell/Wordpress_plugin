<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class PMT_Activator {

	public static function activate() {
		global $wpdb;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset_collate = $wpdb->get_charset_collate();

		$children_table    = $wpdb->prefix . 'pmt_children';
		$tasks_table       = $wpdb->prefix . 'pmt_tasks';
		$completions_table = $wpdb->prefix . 'pmt_completions';

		$sql = "CREATE TABLE {$children_table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			name varchar(100) NOT NULL,
			weekly_amount_pence int(10) unsigned NOT NULL DEFAULT 500,
			sort_order int(10) unsigned NOT NULL DEFAULT 0,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id)
		) {$charset_collate};

		CREATE TABLE {$tasks_table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			child_id bigint(20) unsigned NOT NULL,
			name varchar(150) NOT NULL,
			frequency varchar(10) NOT NULL DEFAULT 'daily',
			value_percent tinyint(3) unsigned NOT NULL DEFAULT 5,
			is_bonus tinyint(1) NOT NULL DEFAULT 0,
			sort_order int(10) unsigned NOT NULL DEFAULT 0,
			active tinyint(1) NOT NULL DEFAULT 1,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY child_id (child_id)
		) {$charset_collate};

		CREATE TABLE {$completions_table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			task_id bigint(20) unsigned NOT NULL,
			child_id bigint(20) unsigned NOT NULL,
			task_date date NOT NULL,
			completed tinyint(1) NOT NULL DEFAULT 0,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			UNIQUE KEY task_date (task_id, task_date),
			KEY child_id (child_id)
		) {$charset_collate};";

		dbDelta( $sql );

		self::backfill_value_tiers( $tasks_table );

		update_option( 'pmt_db_version', PMT_DB_VERSION );
	}

	/**
	 * Tasks created before value_percent existed all land on the column
	 * default (5%). Give known task names a more sensible tier, and bump any
	 * still-default weekly task to the "bigger job" tier — a one-off nudge
	 * for existing installs, not a rule that runs again afterwards (this
	 * whole method only executes once, from activate(), when the stored
	 * schema version is behind).
	 */
	private static function backfill_value_tiers( $tasks_table ) {
		global $wpdb;

		// Includes both current preset names and a few names used by earlier
		// versions of the preset list, so real pre-existing tasks (not just
		// fresh preset picks) get a sensible tier too.
		$tier_10 = array( 'Lay the table', 'Feed a pet', 'Read for 20 minutes', 'Clear the table after dinner', 'Clear the table', 'Wash up after a meal', 'Load or unload the dishwasher', 'Pair and put away socks', 'Sweep the kitchen floor', 'Pet care (fresh water, grooming, feeding bowls)', 'Water the plants', 'Help prepare lunch/dinner', 'Help make dinner', 'Help put the shopping away', 'Get school bag/kit ready for the next day', 'Clean their own shoes/trainers', 'Take clean washing upstairs', 'Walk the dog', 'Take the bins out', 'Say something kind to a sibling', 'Help a family member with something' );
		$tier_15 = array( 'Wipe the table/worktops', 'Wipe down the kitchen surfaces', 'Change their bed sheets (with help at first)', 'Tidy their own bedroom', 'Tidy your room', 'Tidy a shared room', 'Dust a room', 'Sweep or vacuum a room', 'Vacuum a room', 'Empty a bin', 'Sort/take out the recycling', 'Clean the bathroom', 'Clean the bathroom sink', 'Wash the car', 'Mow the lawn', 'Tidy the garage' );

		foreach ( $tier_10 as $name ) {
			$wpdb->query( $wpdb->prepare( "UPDATE {$tasks_table} SET value_percent = 10 WHERE name = %s AND value_percent = 5", $name ) );
		}
		foreach ( $tier_15 as $name ) {
			$wpdb->query( $wpdb->prepare( "UPDATE {$tasks_table} SET value_percent = 15 WHERE name = %s AND value_percent = 5", $name ) );
		}
		// Anything else still at the default that's a weekly task is more likely a bigger job than a 5% daily habit.
		$wpdb->query( "UPDATE {$tasks_table} SET value_percent = 15 WHERE frequency = 'weekly' AND value_percent = 5" );
	}

	/**
	 * Re-runs dbDelta (safe/idempotent — it only adds what's missing) when an
	 * already-active install's schema is behind, e.g. after a plugin update
	 * that added a column. dbDelta itself requires wp-admin/includes/upgrade.php,
	 * which activate() already loads.
	 */
	public static function maybe_upgrade() {
		if ( get_option( 'pmt_db_version' ) !== PMT_DB_VERSION ) {
			self::activate();
		}
	}
}
