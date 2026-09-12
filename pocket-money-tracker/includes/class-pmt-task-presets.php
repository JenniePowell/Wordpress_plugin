<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * A curated list of screen-free chores parents can tick to quickly build a
 * child's task list, instead of typing every task out by hand. Custom tasks
 * are still free text — this is just a shortcut, not the only option.
 *
 * Each entry carries a suggested frequency and value tier (5/10/15%), which
 * the parent can still change per-task afterwards; these are just sensible
 * starting points, not fixed rules.
 */
class PMT_Task_Presets {

	public static function all() {
		return array(
			// 5% — small, everyday-expected habits.
			array( 'name' => __( 'Make your bed', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 5 ),
			array( 'name' => __( 'Put dirty clothes in the laundry basket', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 5 ),
			array( 'name' => __( 'Put shoes and coats away', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 5 ),
			array( 'name' => __( 'Close your wardrobe doors', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 5 ),
			array( 'name' => __( 'Close your drawers', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 5 ),
			array( 'name' => __( 'Put clean washing away', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 5 ),

			// 10% — a bit more effort, still usually daily.
			array( 'name' => __( 'Lay the table', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Feed a pet', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Read for 20 minutes', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Clear the table after dinner', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Wash up after a meal', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Load or unload the dishwasher', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Pair and put away socks', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Sweep the kitchen floor', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Pet care (fresh water, grooming, feeding bowls)', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Water the plants', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Help prepare lunch/dinner', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Help put the shopping away', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Get school bag/kit ready for the next day', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Clean their own shoes/trainers', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Take clean washing upstairs', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Walk the dog', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Take the bins out', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Say something kind to a sibling', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),
			array( 'name' => __( 'Help a family member with something', 'pocket-money-tracker' ), 'frequency' => 'daily', 'value_percent' => 10 ),

			// 15% — bigger jobs, usually weekly.
			array( 'name' => __( 'Wipe the table/worktops', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
			array( 'name' => __( 'Change their bed sheets (with help at first)', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
			array( 'name' => __( 'Tidy their own bedroom', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
			array( 'name' => __( 'Tidy a shared room', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
			array( 'name' => __( 'Dust a room', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
			array( 'name' => __( 'Vacuum a room', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
			array( 'name' => __( 'Empty a bin', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
			array( 'name' => __( 'Sort/take out the recycling', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
			array( 'name' => __( 'Clean the bathroom', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
			array( 'name' => __( 'Clean the bathroom sink', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
			array( 'name' => __( 'Wash the car', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
			array( 'name' => __( 'Mow the lawn', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
			array( 'name' => __( 'Tidy the garage', 'pocket-money-tracker' ), 'frequency' => 'weekly', 'value_percent' => 15 ),
		);
	}
}
