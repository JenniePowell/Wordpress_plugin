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

		add_option( 'pmt_db_version', PMT_VERSION );
	}
}
