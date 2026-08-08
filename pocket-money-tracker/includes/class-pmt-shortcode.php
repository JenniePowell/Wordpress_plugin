<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The kid-facing checklist: [pocket_money_tracker] or [pocket_money_tracker child="3"]
 * No login required — this is meant for a family, not a public multi-user site.
 */
class PMT_Shortcode {

	public function __construct() {
		add_shortcode( 'pocket_money_tracker', array( $this, 'render' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'maybe_enqueue_assets' ) );
	}

	public function maybe_enqueue_assets() {
		global $post;
		if ( ! ( $post instanceof WP_Post ) || ! has_shortcode( $post->post_content, 'pocket_money_tracker' ) ) {
			return;
		}
		wp_enqueue_style( 'pmt-frontend', PMT_PLUGIN_URL . 'assets/css/frontend.css', array(), PMT_VERSION );
		wp_enqueue_script( 'pmt-grid', PMT_PLUGIN_URL . 'assets/js/pmt-grid.js', array(), PMT_VERSION, true );
		wp_localize_script(
			'pmt-grid',
			'pmtData',
			array(
				'ajaxUrl' => admin_url( 'admin-ajax.php' ),
				'nonce'   => wp_create_nonce( PMT_Ajax::NONCE_ACTION ),
			)
		);
	}

	public function render( $atts ) {
		$atts = shortcode_atts( array( 'child' => '' ), $atts, 'pocket_money_tracker' );

		$all_children = PMT_DB::get_children();
		if ( empty( $all_children ) ) {
			return '<p class="pmt-empty">' . esc_html__( 'No children have been set up yet.', 'pocket-money-tracker' ) . '</p>';
		}

		if ( '' !== $atts['child'] && ctype_digit( (string) $atts['child'] ) ) {
			$fixed_child = PMT_DB::get_child( absint( $atts['child'] ) );
			if ( ! $fixed_child ) {
				return '<p class="pmt-empty">' . esc_html__( 'Child not found.', 'pocket-money-tracker' ) . '</p>';
			}
			$available_children = array( $fixed_child );
			$show_tabs           = false;
		} else {
			$available_children = $all_children;
			$show_tabs           = count( $all_children ) > 1;
		}

		$requested_child_id = isset( $_GET['pmt_child'] ) ? absint( $_GET['pmt_child'] ) : 0;
		$child               = null;
		foreach ( $available_children as $c ) {
			if ( (int) $c->id === $requested_child_id ) {
				$child = $c;
				break;
			}
		}
		if ( ! $child ) {
			$child = $available_children[0];
		}

		$requested_week = isset( $_GET['pmt_week'] ) ? sanitize_text_field( wp_unslash( $_GET['pmt_week'] ) ) : '';
		$week_start     = PMT_Helpers::is_valid_date( $requested_week ) ? PMT_Helpers::week_start( $requested_week ) : PMT_Helpers::week_start();

		$base_url = get_permalink();
		if ( ! $base_url ) {
			$base_url = home_url( '/' );
		}

		ob_start();
		echo '<div class="pmt-tracker">';

		if ( $show_tabs ) {
			echo '<div class="pmt-tabs pmt-tabs--frontend">';
			foreach ( $available_children as $c ) {
				$url   = add_query_arg(
					array(
						'pmt_child' => $c->id,
						'pmt_week'  => $week_start,
					),
					$base_url
				);
				$class   = ( (int) $c->id === (int) $child->id ) ? 'pmt-tab pmt-tab--active' : 'pmt-tab';
				$initial = function_exists( 'mb_substr' ) ? mb_strtoupper( mb_substr( $c->name, 0, 1 ) ) : strtoupper( substr( $c->name, 0, 1 ) );
				echo '<a class="' . esc_attr( $class ) . '" href="' . esc_url( $url ) . '" data-initial="' . esc_attr( $initial ) . '">' . esc_html( $c->name ) . '</a>';
			}
			echo '</div>';
		}

		$nav_base = add_query_arg( 'pmt_child', $child->id, $base_url );
		PMT_Grid::render_week_nav( $week_start, $nav_base, 'pmt_week' );

		$week_data = PMT_Helpers::calculate_week( $child, $week_start );
		PMT_Grid::render_table( $week_data );

		echo '</div>';

		return ob_get_clean();
	}
}
