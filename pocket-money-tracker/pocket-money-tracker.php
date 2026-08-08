<?php
/**
 * Plugin Name: Pocket Money Tracker
 * Description: A weekly, chore-based pocket money tracker. Kids tick off screen-free tasks each day to earn their pocket money, capped at a set amount per week per child.
 * Version: 1.0.0
 * Author: Tree Duck Design
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: pocket-money-tracker
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'PMT_VERSION', '1.0.0' );
define( 'PMT_PLUGIN_FILE', __FILE__ );
define( 'PMT_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'PMT_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once PMT_PLUGIN_DIR . 'includes/class-pmt-activator.php';
require_once PMT_PLUGIN_DIR . 'includes/class-pmt-db.php';
require_once PMT_PLUGIN_DIR . 'includes/class-pmt-helpers.php';
require_once PMT_PLUGIN_DIR . 'includes/class-pmt-grid.php';
require_once PMT_PLUGIN_DIR . 'includes/class-pmt-admin.php';
require_once PMT_PLUGIN_DIR . 'includes/class-pmt-ajax.php';
require_once PMT_PLUGIN_DIR . 'includes/class-pmt-shortcode.php';

register_activation_hook( __FILE__, array( 'PMT_Activator', 'activate' ) );

function pmt_init_plugin() {
	new PMT_Admin();
	new PMT_Ajax();
	new PMT_Shortcode();
}
add_action( 'plugins_loaded', 'pmt_init_plugin' );
