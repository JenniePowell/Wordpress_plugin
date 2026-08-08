<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * wp-admin side: menu, the weekly overview, and managing children/tasks.
 */
class PMT_Admin {

	const NONCE_ACTION = 'pmt_admin_action';
	const NONCE_FIELD   = 'pmt_admin_nonce';

	public function __construct() {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'handle_actions' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
	}

	public function register_menu() {
		add_menu_page(
			__( 'Pocket Money', 'pocket-money-tracker' ),
			__( 'Pocket Money', 'pocket-money-tracker' ),
			'manage_options',
			'pmt-overview',
			array( $this, 'render_overview' ),
			'dashicons-money-alt',
			26
		);
		add_submenu_page( 'pmt-overview', __( 'Overview', 'pocket-money-tracker' ), __( 'Overview', 'pocket-money-tracker' ), 'manage_options', 'pmt-overview', array( $this, 'render_overview' ) );
		add_submenu_page( 'pmt-overview', __( 'Children', 'pocket-money-tracker' ), __( 'Children', 'pocket-money-tracker' ), 'manage_options', 'pmt-children', array( $this, 'render_children' ) );
		add_submenu_page( 'pmt-overview', __( 'Tasks', 'pocket-money-tracker' ), __( 'Tasks', 'pocket-money-tracker' ), 'manage_options', 'pmt-tasks', array( $this, 'render_tasks' ) );
	}

	public function enqueue_assets() {
		$page = isset( $_GET['page'] ) ? sanitize_text_field( wp_unslash( $_GET['page'] ) ) : '';
		if ( 0 !== strpos( $page, 'pmt-' ) ) {
			return;
		}
		wp_enqueue_style( 'pmt-admin', PMT_PLUGIN_URL . 'assets/css/admin.css', array(), PMT_VERSION );
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

	/* ---------------- Form handling ---------------- */

	public function handle_actions() {
		if ( empty( $_POST[ self::NONCE_FIELD ] ) ) {
			return;
		}
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST[ self::NONCE_FIELD ] ) ), self::NONCE_ACTION ) ) {
			wp_die( esc_html__( 'Security check failed.', 'pocket-money-tracker' ) );
		}

		if ( isset( $_POST['pmt_add_child'] ) ) {
			$name   = sanitize_text_field( wp_unslash( $_POST['child_name'] ?? '' ) );
			$amount = isset( $_POST['weekly_amount'] ) ? (float) wp_unslash( $_POST['weekly_amount'] ) : 5;
			if ( '' !== $name && $amount >= 0 ) {
				PMT_DB::insert_child( $name, (int) round( $amount * 100 ) );
			}
			$this->redirect( 'pmt-children' );
		}

		if ( isset( $_POST['pmt_update_child'] ) ) {
			$child_id = absint( $_POST['child_id'] ?? 0 );
			$name     = sanitize_text_field( wp_unslash( $_POST['child_name'] ?? '' ) );
			$amount   = isset( $_POST['weekly_amount'] ) ? (float) wp_unslash( $_POST['weekly_amount'] ) : 0;
			if ( $child_id && '' !== $name && $amount >= 0 ) {
				PMT_DB::update_child( $child_id, $name, (int) round( $amount * 100 ) );
			}
			$this->redirect( 'pmt-children' );
		}

		if ( isset( $_POST['pmt_delete_child'] ) ) {
			$child_id = absint( $_POST['child_id'] ?? 0 );
			if ( $child_id ) {
				PMT_DB::delete_child( $child_id );
			}
			$this->redirect( 'pmt-children' );
		}

		if ( isset( $_POST['pmt_add_task'] ) ) {
			$child_id = absint( $_POST['child_id'] ?? 0 );
			$name     = sanitize_text_field( wp_unslash( $_POST['task_name'] ?? '' ) );
			if ( $child_id && '' !== $name ) {
				PMT_DB::insert_task( $child_id, $name );
			}
			$this->redirect( 'pmt-tasks', array( 'child_id' => $child_id ) );
		}

		if ( isset( $_POST['pmt_add_preset_tasks'] ) ) {
			$child_id = absint( $_POST['child_id'] ?? 0 );
			$selected = isset( $_POST['preset_tasks'] ) && is_array( $_POST['preset_tasks'] ) ? wp_unslash( $_POST['preset_tasks'] ) : array();

			if ( $child_id ) {
				$valid_presets       = PMT_Task_Presets::all();
				$existing_names_lower = array_map( 'strtolower', wp_list_pluck( PMT_DB::get_tasks( $child_id, false ), 'name' ) );

				foreach ( $selected as $raw ) {
					$submitted = sanitize_text_field( $raw );
					$match     = null;
					foreach ( $valid_presets as $preset ) {
						if ( 0 === strcasecmp( $preset, $submitted ) ) {
							$match = $preset;
							break;
						}
					}
					if ( $match && ! in_array( strtolower( $match ), $existing_names_lower, true ) ) {
						PMT_DB::insert_task( $child_id, $match );
						$existing_names_lower[] = strtolower( $match );
					}
				}
			}
			$this->redirect( 'pmt-tasks', array( 'child_id' => $child_id ) );
		}

		if ( isset( $_POST['pmt_update_task'] ) ) {
			$task_id  = absint( $_POST['task_id'] ?? 0 );
			$child_id = absint( $_POST['child_id'] ?? 0 );
			$name     = sanitize_text_field( wp_unslash( $_POST['task_name'] ?? '' ) );
			if ( $task_id && '' !== $name ) {
				PMT_DB::update_task_name( $task_id, $name );
			}
			$this->redirect( 'pmt-tasks', array( 'child_id' => $child_id ) );
		}

		if ( isset( $_POST['pmt_toggle_task_active'] ) ) {
			$task_id  = absint( $_POST['task_id'] ?? 0 );
			$child_id = absint( $_POST['child_id'] ?? 0 );
			$active   = ! empty( $_POST['active'] );
			if ( $task_id ) {
				PMT_DB::set_task_active( $task_id, $active );
			}
			$this->redirect( 'pmt-tasks', array( 'child_id' => $child_id ) );
		}

		if ( isset( $_POST['pmt_delete_task'] ) ) {
			$task_id  = absint( $_POST['task_id'] ?? 0 );
			$child_id = absint( $_POST['child_id'] ?? 0 );
			if ( $task_id ) {
				PMT_DB::delete_task( $task_id );
			}
			$this->redirect( 'pmt-tasks', array( 'child_id' => $child_id ) );
		}
	}

	private function redirect( $page, $extra_args = array() ) {
		$args = array_merge( array( 'page' => $page ), $extra_args );
		wp_safe_redirect( add_query_arg( $args, admin_url( 'admin.php' ) ) );
		exit;
	}

	private function nonce_field() {
		wp_nonce_field( self::NONCE_ACTION, self::NONCE_FIELD );
	}

	/* ---------------- Pages ---------------- */

	public function render_overview() {
		$requested_week = isset( $_GET['week'] ) ? sanitize_text_field( wp_unslash( $_GET['week'] ) ) : '';
		$week_start     = PMT_Helpers::is_valid_date( $requested_week ) ? PMT_Helpers::week_start( $requested_week ) : PMT_Helpers::week_start();
		$children       = PMT_DB::get_children();
		$base_url       = admin_url( 'admin.php?page=pmt-overview' );

		echo '<div class="wrap pmt-wrap">';
		echo '<h1>' . esc_html__( 'Pocket Money — Overview', 'pocket-money-tracker' ) . '</h1>';

		if ( empty( $children ) ) {
			echo '<p>' . esc_html__( 'No children set up yet.', 'pocket-money-tracker' ) . ' <a href="' . esc_url( admin_url( 'admin.php?page=pmt-children' ) ) . '">' . esc_html__( 'Add one', 'pocket-money-tracker' ) . '</a></p></div>';
			return;
		}

		echo '<p class="pmt-shortcode-hint">' . sprintf(
			/* translators: %s: shortcode */
			esc_html__( 'Kid-facing checklist: add %s to any page.', 'pocket-money-tracker' ),
			'<code>[pocket_money_tracker]</code>'
		) . '</p>';

		PMT_Grid::render_week_nav( $week_start, $base_url, 'week' );

		foreach ( $children as $child ) {
			$week_data = PMT_Helpers::calculate_week( $child, $week_start );
			echo '<h2>' . esc_html( $child->name ) . '</h2>';
			PMT_Grid::render_table( $week_data );
		}

		echo '</div>';
	}

	public function render_children() {
		$children = PMT_DB::get_children();

		echo '<div class="wrap pmt-wrap">';
		echo '<h1>' . esc_html__( 'Children', 'pocket-money-tracker' ) . '</h1>';

		if ( ! empty( $children ) ) {
			// Empty forms carrying only hidden fields, kept outside the table so
			// no <form> ends up nested directly inside a <tr> (invalid HTML).
			// Visible inputs/buttons in the table link back via the `form` attribute.
			foreach ( $children as $child ) {
				$form_id = 'pmt-child-' . (int) $child->id;
				echo '<form id="' . esc_attr( $form_id ) . '" method="post">';
				$this->nonce_field();
				echo '<input type="hidden" name="child_id" value="' . esc_attr( $child->id ) . '" />';
				echo '</form>';
			}

			echo '<table class="widefat pmt-table"><thead><tr>';
			echo '<th>' . esc_html__( 'Name', 'pocket-money-tracker' ) . '</th>';
			echo '<th>' . esc_html__( 'Weekly amount (£)', 'pocket-money-tracker' ) . '</th>';
			echo '<th></th></tr></thead><tbody>';

			foreach ( $children as $child ) {
				$form_id = 'pmt-child-' . (int) $child->id;
				echo '<tr>';
				echo '<td><input type="text" name="child_name" form="' . esc_attr( $form_id ) . '" value="' . esc_attr( $child->name ) . '" required /></td>';
				echo '<td><input type="number" step="0.01" min="0" name="weekly_amount" form="' . esc_attr( $form_id ) . '" value="' . esc_attr( number_format( $child->weekly_amount_pence / 100, 2, '.', '' ) ) . '" required /></td>';
				echo '<td>';
				echo '<button type="submit" name="pmt_update_child" value="1" form="' . esc_attr( $form_id ) . '" class="button">' . esc_html__( 'Save', 'pocket-money-tracker' ) . '</button> ';
				echo '<a class="button" href="' . esc_url( add_query_arg( 'child_id', $child->id, admin_url( 'admin.php?page=pmt-tasks' ) ) ) . '">' . esc_html__( 'Tasks', 'pocket-money-tracker' ) . '</a> ';
				echo '<button type="submit" name="pmt_delete_child" value="1" form="' . esc_attr( $form_id ) . '" class="button-link-delete" onclick="return confirm(\'' . esc_js( __( 'Delete this child and all their tasks/history?', 'pocket-money-tracker' ) ) . '\');">' . esc_html__( 'Delete', 'pocket-money-tracker' ) . '</button>';
				echo '</td>';
				echo '</tr>';
			}
			echo '</tbody></table>';
		} else {
			echo '<p>' . esc_html__( 'No children yet — add the first one below.', 'pocket-money-tracker' ) . '</p>';
		}

		echo '<h2>' . esc_html__( 'Add a child', 'pocket-money-tracker' ) . '</h2>';
		echo '<form method="post" class="pmt-form">';
		$this->nonce_field();
		echo '<p><label>' . esc_html__( 'Name', 'pocket-money-tracker' ) . '<br /><input type="text" name="child_name" required /></label></p>';
		echo '<p><label>' . esc_html__( 'Weekly amount (£)', 'pocket-money-tracker' ) . '<br /><input type="number" step="0.01" min="0" name="weekly_amount" value="5.00" required /></label></p>';
		echo '<p><button type="submit" name="pmt_add_child" value="1" class="button button-primary">' . esc_html__( 'Add child', 'pocket-money-tracker' ) . '</button></p>';
		echo '</form>';

		echo '</div>';
	}

	public function render_tasks() {
		$children = PMT_DB::get_children();

		echo '<div class="wrap pmt-wrap">';
		echo '<h1>' . esc_html__( 'Tasks', 'pocket-money-tracker' ) . '</h1>';

		if ( empty( $children ) ) {
			echo '<p>' . esc_html__( 'Add a child first.', 'pocket-money-tracker' ) . ' <a href="' . esc_url( admin_url( 'admin.php?page=pmt-children' ) ) . '">' . esc_html__( 'Add one', 'pocket-money-tracker' ) . '</a></p></div>';
			return;
		}

		$child_id = isset( $_GET['child_id'] ) ? absint( $_GET['child_id'] ) : (int) $children[0]->id;
		$child    = PMT_DB::get_child( $child_id );
		if ( ! $child ) {
			$child    = $children[0];
			$child_id = (int) $child->id;
		}

		echo '<h2 class="screen-reader-text">' . esc_html__( 'Choose child', 'pocket-money-tracker' ) . '</h2>';
		echo '<div class="pmt-tabs">';
		foreach ( $children as $c ) {
			$class = ( (int) $c->id === $child_id ) ? 'pmt-tab pmt-tab--active' : 'pmt-tab';
			echo '<a class="' . esc_attr( $class ) . '" href="' . esc_url( add_query_arg( array(
				'page'     => 'pmt-tasks',
				'child_id' => $c->id,
			), admin_url( 'admin.php' ) ) ) . '">' . esc_html( $c->name ) . '</a>';
		}
		echo '</div>';

		$tasks = PMT_DB::get_tasks( $child_id, false );

		echo '<p>' . sprintf(
			/* translators: %1$s: child name, %2$s: weekly amount */
			esc_html__( 'Tasks for %1$s. Weekly amount: %2$s.', 'pocket-money-tracker' ),
			esc_html( $child->name ),
			esc_html( PMT_Helpers::format_money( $child->weekly_amount_pence ) )
		) . '</p>';

		if ( ! empty( $tasks ) ) {
			$per_task = PMT_Helpers::per_task_pence( (int) $child->weekly_amount_pence, count( array_filter( $tasks, function ( $t ) {
				return (int) $t->active === 1;
			} ) ) );

			// As on the Children screen: empty forms (hidden fields only) live
			// outside the table; visible fields/buttons link back via `form=`
			// so no <form> is ever nested directly inside a <tr>.
			foreach ( $tasks as $task ) {
				$update_form_id = 'pmt-task-update-' . (int) $task->id;
				$toggle_form_id = 'pmt-task-toggle-' . (int) $task->id;
				$delete_form_id = 'pmt-task-delete-' . (int) $task->id;

				echo '<form id="' . esc_attr( $update_form_id ) . '" method="post">';
				$this->nonce_field();
				echo '<input type="hidden" name="task_id" value="' . esc_attr( $task->id ) . '" />';
				echo '<input type="hidden" name="child_id" value="' . esc_attr( $child_id ) . '" />';
				echo '</form>';

				echo '<form id="' . esc_attr( $toggle_form_id ) . '" method="post">';
				$this->nonce_field();
				echo '<input type="hidden" name="task_id" value="' . esc_attr( $task->id ) . '" />';
				echo '<input type="hidden" name="child_id" value="' . esc_attr( $child_id ) . '" />';
				echo '<input type="hidden" name="active" value="' . ( $task->active ? '0' : '1' ) . '" />';
				echo '</form>';

				echo '<form id="' . esc_attr( $delete_form_id ) . '" method="post">';
				$this->nonce_field();
				echo '<input type="hidden" name="task_id" value="' . esc_attr( $task->id ) . '" />';
				echo '<input type="hidden" name="child_id" value="' . esc_attr( $child_id ) . '" />';
				echo '</form>';
			}

			echo '<table class="widefat pmt-table"><thead><tr>';
			echo '<th>' . esc_html__( 'Task', 'pocket-money-tracker' ) . '</th>';
			echo '<th>' . esc_html__( 'Active', 'pocket-money-tracker' ) . '</th>';
			echo '<th>' . esc_html__( 'Value/day', 'pocket-money-tracker' ) . '</th>';
			echo '<th></th></tr></thead><tbody>';

			foreach ( $tasks as $task ) {
				$update_form_id = 'pmt-task-update-' . (int) $task->id;
				$toggle_form_id = 'pmt-task-toggle-' . (int) $task->id;
				$delete_form_id = 'pmt-task-delete-' . (int) $task->id;

				echo '<tr>';
				echo '<td><input type="text" name="task_name" form="' . esc_attr( $update_form_id ) . '" value="' . esc_attr( $task->name ) . '" required /></td>';
				echo '<td>' . ( $task->active ? esc_html__( 'Yes', 'pocket-money-tracker' ) : esc_html__( 'No', 'pocket-money-tracker' ) ) . '</td>';
				echo '<td>' . ( $task->active ? esc_html( PMT_Helpers::format_money( $per_task ) ) : '—' ) . '</td>';
				echo '<td>';
				echo '<button type="submit" name="pmt_update_task" value="1" form="' . esc_attr( $update_form_id ) . '" class="button">' . esc_html__( 'Save', 'pocket-money-tracker' ) . '</button> ';
				echo '<button type="submit" name="pmt_toggle_task_active" value="1" form="' . esc_attr( $toggle_form_id ) . '" class="button">' . ( $task->active ? esc_html__( 'Pause', 'pocket-money-tracker' ) : esc_html__( 'Resume', 'pocket-money-tracker' ) ) . '</button> ';
				echo '<button type="submit" name="pmt_delete_task" value="1" form="' . esc_attr( $delete_form_id ) . '" class="button-link-delete" onclick="return confirm(\'' . esc_js( __( 'Delete this task and its history?', 'pocket-money-tracker' ) ) . '\');">' . esc_html__( 'Delete', 'pocket-money-tracker' ) . '</button>';
				echo '</td>';
				echo '</tr>';
			}
			echo '</tbody></table>';
			echo '<p class="description">' . esc_html__( 'Paused tasks don\'t count towards the weekly split and won\'t show on the checklist.', 'pocket-money-tracker' ) . '</p>';
		} else {
			echo '<p>' . esc_html__( 'No tasks yet — add one from the suggestions below, or write your own.', 'pocket-money-tracker' ) . '</p>';
		}

		$existing_names_lower = array_map( 'strtolower', wp_list_pluck( $tasks, 'name' ) );
		$available_presets    = array_filter(
			PMT_Task_Presets::all(),
			function ( $preset ) use ( $existing_names_lower ) {
				return ! in_array( strtolower( $preset ), $existing_names_lower, true );
			}
		);

		if ( ! empty( $available_presets ) ) {
			echo '<h2>' . esc_html__( 'Suggested tasks', 'pocket-money-tracker' ) . '</h2>';
			echo '<p class="description">' . sprintf(
				/* translators: %s: child name */
				esc_html__( 'Tick any you\'d like to add for %s, then add them in one go.', 'pocket-money-tracker' ),
				esc_html( $child->name )
			) . '</p>';
			echo '<form method="post" class="pmt-form">';
			$this->nonce_field();
			echo '<input type="hidden" name="child_id" value="' . esc_attr( $child_id ) . '" />';
			echo '<div class="pmt-preset-grid">';
			foreach ( $available_presets as $preset ) {
				$checkbox_id = 'pmt-preset-' . sanitize_title( $preset );
				echo '<label class="pmt-preset-item" for="' . esc_attr( $checkbox_id ) . '">';
				echo '<input type="checkbox" id="' . esc_attr( $checkbox_id ) . '" name="preset_tasks[]" value="' . esc_attr( $preset ) . '" /> ' . esc_html( $preset );
				echo '</label>';
			}
			echo '</div>';
			echo '<p><button type="submit" name="pmt_add_preset_tasks" value="1" class="button button-primary">' . esc_html__( 'Add selected tasks', 'pocket-money-tracker' ) . '</button></p>';
			echo '</form>';
		}

		echo '<h2>' . esc_html__( 'Add a task', 'pocket-money-tracker' ) . '</h2>';
		echo '<form method="post" class="pmt-form">';
		$this->nonce_field();
		echo '<input type="hidden" name="child_id" value="' . esc_attr( $child_id ) . '" />';
		echo '<p><label>' . esc_html__( 'Task name', 'pocket-money-tracker' ) . '<br /><input type="text" name="task_name" placeholder="' . esc_attr__( 'e.g. Wash up after dinner', 'pocket-money-tracker' ) . '" required /></label></p>';
		echo '<p><button type="submit" name="pmt_add_task" value="1" class="button button-primary">' . esc_html__( 'Add task', 'pocket-money-tracker' ) . '</button></p>';
		echo '</form>';

		echo '</div>';
	}
}
