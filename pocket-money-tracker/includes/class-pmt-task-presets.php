<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * A curated list of screen-free chores parents can tick to quickly build a
 * child's task list, instead of typing every task out by hand. Custom tasks
 * are still free text — this is just a shortcut, not the only option.
 */
class PMT_Task_Presets {

	public static function all() {
		return array(
			__( 'Make your bed', 'pocket-money-tracker' ),
			__( 'Tidy your room', 'pocket-money-tracker' ),
			__( 'Wash up after a meal', 'pocket-money-tracker' ),
			__( 'Lay the table', 'pocket-money-tracker' ),
			__( 'Clear the table', 'pocket-money-tracker' ),
			__( 'Put dirty clothes in the laundry basket', 'pocket-money-tracker' ),
			__( 'Put clean washing away', 'pocket-money-tracker' ),
			__( 'Feed a pet', 'pocket-money-tracker' ),
			__( 'Walk the dog', 'pocket-money-tracker' ),
			__( 'Water the plants', 'pocket-money-tracker' ),
			__( 'Take the bins out', 'pocket-money-tracker' ),
			__( 'Wipe down the kitchen surfaces', 'pocket-money-tracker' ),
			__( 'Sweep or vacuum a room', 'pocket-money-tracker' ),
			__( 'Dust a room', 'pocket-money-tracker' ),
			__( 'Put shoes and coats away', 'pocket-money-tracker' ),
			__( 'Help make dinner', 'pocket-money-tracker' ),
			__( 'Read for 20 minutes', 'pocket-money-tracker' ),
			__( 'Say something kind to a sibling', 'pocket-money-tracker' ),
			__( 'Help a family member with something', 'pocket-money-tracker' ),
			__( 'Clean the bathroom', 'pocket-money-tracker' ),
			__( 'Wash the car', 'pocket-money-tracker' ),
			__( 'Mow the lawn', 'pocket-money-tracker' ),
		);
	}
}
