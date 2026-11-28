// Copyright (c) 2026, GDL and contributors
// For license information, please see license.txt

function is_managerial_user() {
	let roles = frappe.user_roles || (frappe.boot && frappe.boot.user && frappe.boot.user.roles) || [];
	return roles.some(r => [
		"PMS HR Admin",
		"Administrator",
		"PMS Supervisor",
		"PMS Supervisor 2",
		"PMS Reviewer"
	].includes(r));
}

frappe.listview_settings['PMS Plan Amendment'] = {
	add_fields: [
		"employee",
		"employee_name",
		"grade_group",
		"performance_plan",
		"cycle",
		"calendar_year",
		"status",
		"amendment_number",
		"revision_date",
		"supervisor_snapshot",
		"reviewer_snapshot",
		"supervisor_2_snapshot"
	],

	get_indicator: function(doc) {
		let val = doc.status || "Draft";
		let color = "blue";
		if (val === "Approved") color = "green";
		else if (val === "Rejected") color = "red";
		else if (val === "Returned" || val.includes("Pending")) color = "orange";
		else if (val === "Draft") color = "gray";
		return [__(val), color, "status,=," + val];
	},

	formatters: {
		employee(val, df, doc) {
			if (doc && doc.employee_name) {
				return `<span style="font-weight: 600; color: var(--text-color);">${frappe.utils.escape_html(doc.employee_name)}</span> <span class="text-muted small">(${frappe.utils.escape_html(val)})</span>`;
			}
			return val || "--";
		},
		employee_name(val, df, doc) {
			if (val) {
				return `<span style="font-weight: 600; color: var(--text-color);">${frappe.utils.escape_html(val)}</span>`;
			}
			return val || "--";
		},
		grade_group(val, df, doc) {
			if (!val) return `<span class="text-muted small">--</span>`;
			return `<span class="badge badge-light" style="font-size: 11px; font-weight: 600; padding: 3px 7px;">${frappe.utils.escape_html(val)}</span>`;
		},
		amendment_number(val, df, doc) {
			if (val != null) {
				return `<span class="badge badge-light" style="font-size: 11px; font-weight: 600; padding: 3px 7px;">#${val}</span>`;
			}
			return "--";
		},
		revision_date(val, df, doc) {
			if (!val) return `<span class="text-muted small">--</span>`;
			let formatted = frappe.datetime && frappe.datetime.str_to_user ? frappe.datetime.str_to_user(val) : val;
			return `<span class="small" style="color: var(--text-muted); font-weight: 500;">${frappe.utils.escape_html(formatted)}</span>`;
		},
		status(val, df, doc) {
			if (!val) return "--";
			let color = "blue";
			if (val === "Approved") color = "green";
			else if (val === "Rejected") color = "red";
			else if (val === "Returned" || val.includes("Pending")) color = "orange";
			else if (val === "Draft") color = "gray";
			return `<span class="indicator-pill ${color} small">${frappe.utils.escape_html(val)}</span>`;
		}
	},

	onload: function(listview) {
		listview.setup_columns = function() {
			this.columns = [];
			const get_df = frappe.meta.get_docfield.bind(null, this.doctype);

			// 1st column: ID
			this.columns.push({
				type: "Subject",
				df: {
					label: __("ID"),
					fieldname: "name",
				},
			});

			let fieldnames = ["employee", "employee_name", "grade_group", "performance_plan", "cycle", "amendment_number", "revision_date", "status"];
			fieldnames.forEach((fn) => {
				let df = get_df(fn);
				if (df) {
					this.columns.push({
						type: "Field",
						df: df,
					});
				}
			});

			// 2nd column: tag
			this.columns.splice(1, 0, {
				type: "Tag",
			});
		};

		setup_pms_amendment_scope_system(listview);

		if (listview.setup_columns) {
			listview.setup_columns();
			if (listview.render_header) {
				listview.render_header(true);
			}
		}

		if (listview.render_pms_scope_bar) {
			listview.render_pms_scope_bar();
		}

		listview.apply_amendment_filters(false);
	},

	refresh: function(listview) {
		setup_pms_amendment_scope_system(listview);

		if (listview.render_pms_scope_bar) {
			listview.render_pms_scope_bar();
		}
	}
};

function setup_pms_amendment_scope_system(listview) {
	let is_hr_admin = (frappe.user_roles || []).includes("PMS HR Admin");
	let can_team_initial = is_managerial_user();

	// 1. Fetch user performance context
	if (!listview._pms_context_loading) {
		listview._pms_context_loading = true;
		frappe.call({
			method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.get_user_performance_context",
			callback: function(r) {
				listview._pms_context_loading = false;
				if (r && r.message) {
					listview._pms_context = r.message;
					let can_see_team = r.message.can_see_team && is_managerial_user();
					if (!can_see_team) {
						listview._current_amendment_scope = "all";
						listview.$page.find('.pms-scope-bar').remove();
						listview.apply_amendment_filters(true);
					} else {
						if (listview.render_pms_scope_bar) {
							listview.render_pms_scope_bar();
						}
						if (listview._current_amendment_scope && listview._current_amendment_scope !== "all") {
							listview.apply_amendment_filters(true);
						}
					}
				}
			}
		});
	}

	// 2. Initialize scope: normal employees default to "all"; HR Admin defaults to "all" (with scope bar visible); managers default to "team"
	if (!can_team_initial) {
		listview._current_amendment_scope = "all";
		let user_key = "pms_amendment_scope_" + (frappe.session.user || "default");
		try { localStorage.removeItem(user_key); } catch(e) {}
	} else if (!listview._current_amendment_scope) {
		let initial_scope = is_hr_admin ? "all" : "team";
		let user_key = "pms_amendment_scope_" + (frappe.session.user || "default");
		if (frappe.route_options && frappe.route_options.scope) {
			initial_scope = frappe.route_options.scope;
			delete frappe.route_options.scope;
		} else if (localStorage.getItem(user_key)) {
			initial_scope = localStorage.getItem(user_key);
		}
		listview._current_amendment_scope = initial_scope;
	}

	// 3. Render Scope Bar UI
	listview.render_pms_scope_bar = function() {
		let ctx = listview._pms_context;
		let can_team = is_managerial_user() && (ctx ? ctx.can_see_team : true);
		if (!can_team) {
			listview.$page.find('.pms-scope-bar').remove();
			return;
		}

		let current_scope = listview._current_amendment_scope || "team";
		let label_my = __("My Amendments");
		let label_team = __("My Team Amendments");
		let label_pending = __("Pending Approval");
		let label_all = __("All Amendments");

		let pending_count = ctx ? (ctx.pending_amendment_count || 0) : 0;

		let $existing = listview.$page.find('.pms-scope-bar');
		if (!$existing.length) {
			let $scope_bar = $(`
				<div class="pms-scope-bar" style="margin: 8px 0 14px 0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: #ffffff; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
					<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
						<span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-right: 2px;">
							<i class="fa fa-filter" style="margin-right: 3px;"></i> ${__("Scope")}:
						</span>
						<div class="pms-scope-btn-group btn-group" role="group">
							<button type="button" class="btn btn-sm tab-scope-my" data-scope="my" style="font-weight: 600; padding: 5px 13px; font-size: 12px;">
								<i class="fa fa-user" style="margin-right: 5px;"></i> <span class="label-text">${label_my}</span>
							</button>
							<button type="button" class="btn btn-sm tab-scope-team" data-scope="team" style="font-weight: 600; padding: 5px 13px; font-size: 12px;">
								<i class="fa fa-users" style="margin-right: 5px;"></i> <span class="label-text">${label_team}</span>
							</button>
							<button type="button" class="btn btn-sm tab-scope-pending" data-scope="pending" style="font-weight: 600; padding: 5px 13px; font-size: 12px;">
								<i class="fa fa-clock-o" style="margin-right: 5px;"></i> <span class="label-text">${label_pending}</span>
								<span class="badge badge-pill pms-pending-count-badge" style="margin-left: 6px; font-size: 11px; background: #ea580c; color: #fff; padding: 2px 7px; border-radius: 10px;">${pending_count}</span>
							</button>
							<button type="button" class="btn btn-sm tab-scope-all" data-scope="all" style="font-weight: 600; padding: 5px 13px; font-size: 12px;">
								<i class="fa fa-th-list" style="margin-right: 5px;"></i> <span class="label-text">${label_all}</span>
							</button>
						</div>
					</div>
					<div class="pms-scope-hint text-muted" style="font-size: 12px; font-style: italic;"></div>
				</div>
			`);

			let $target = listview.$page.find('.frappe-list');
			if ($target.length) {
				$target.before($scope_bar);
			} else {
				listview.$page.find('.layout-main-section').prepend($scope_bar);
			}

			$scope_bar.find('.pms-scope-btn-group button').on('click', function() {
				let selected_scope = $(this).attr('data-scope');
				listview._current_amendment_scope = selected_scope;
				let user_key = "pms_amendment_scope_" + (frappe.session.user || "default");
				localStorage.setItem(user_key, selected_scope);
				listview.render_pms_scope_bar();
				listview.apply_amendment_filters(true);
			});
		}

		let $bar = listview.$page.find('.pms-scope-bar');
		$bar.find('.tab-scope-my .label-text').text(label_my);
		$bar.find('.tab-scope-team .label-text').text(label_team);
		$bar.find('.tab-scope-pending .label-text').text(label_pending);
		$bar.find('.tab-scope-all .label-text').text(label_all);

		let $badge = $bar.find('.pms-pending-count-badge');
		$badge.text(pending_count);
		if (pending_count > 0) {
			$badge.show();
		} else {
			$badge.hide();
		}

		$bar.find('.pms-scope-btn-group button').each(function() {
			let sc = $(this).attr('data-scope');
			if (sc === current_scope) {
				$(this).css({
					"background-color": "#1b4486",
					"color": "#ffffff",
					"border-color": "#1b4486",
					"box-shadow": "inset 0 1px 2px rgba(0,0,0,0.15)"
				}).removeClass('btn-default').addClass('btn-primary active');
			} else {
				$(this).css({
					"background-color": "#ffffff",
					"color": "#334155",
					"border-color": "#cbd5e1",
					"box-shadow": "none"
				}).removeClass('btn-primary active').addClass('btn-default');
			}
		});

		let hint_text = "";
		if (current_scope === "my") {
			hint_text = __("Viewing your own plan amendments");
		} else if (current_scope === "team") {
			hint_text = __("Viewing team plan amendments reporting to you");
		} else if (current_scope === "pending") {
			hint_text = __("Showing team plan amendments awaiting your approval");
		} else {
			hint_text = __("Showing all accessible amendments");
		}
		$bar.find('.pms-scope-hint').text(hint_text);
	};

	// 4. Combined Filter Functionality
	listview.apply_amendment_filters = function(force_reload) {
		if (!listview.filter_area) {
			if (force_reload) listview.refresh();
			return;
		}

		let ctx = listview._pms_context || {};
		let can_team = is_managerial_user() && (ctx.can_see_team !== false);

		// If user is a normal employee or HR Admin, do NOT activate any restrictive filters!
		if (!can_team) {
			listview._current_amendment_scope = "all";
			let clear_p = (listview.filter_area.clear) ? listview.filter_area.clear(false) : Promise.resolve();
			if (clear_p && clear_p.then) {
				clear_p.then(() => {
					listview.refresh();
				});
			} else {
				listview.refresh();
			}
			return;
		}

		let scope = listview._current_amendment_scope || "team";
		let filters_to_add = [];

		if (scope === "my") {
			if (ctx.employee_id) {
				filters_to_add.push(["PMS Plan Amendment", "employee", "=", ctx.employee_id, false]);
			} else {
				filters_to_add.push(["PMS Plan Amendment", "employee", "=", "__NONE__", false]);
			}
		} else if (scope === "team") {
			if (ctx.employee_id) {
				filters_to_add.push(["PMS Plan Amendment", "employee", "!=", ctx.employee_id, false]);
			}
		} else if (scope === "pending") {
			if (ctx.employee_id) {
				filters_to_add.push(["PMS Plan Amendment", "employee", "!=", ctx.employee_id, false]);
			}
			if (ctx.is_supervisor && !ctx.is_reviewer && !ctx.is_admin && !ctx.is_supervisor_2) {
				filters_to_add.push(["PMS Plan Amendment", "status", "=", "Pending Supervisor Approval", false]);
			} else if (ctx.is_reviewer && !ctx.is_supervisor && !ctx.is_admin && !ctx.is_supervisor_2) {
				filters_to_add.push(["PMS Plan Amendment", "status", "=", "Pending Reviewer Approval", false]);
			} else {
				filters_to_add.push(["PMS Plan Amendment", "status", "in", ["Pending Supervisor Approval", "Pending Reviewer Approval"], false]);
			}
		}

		let clear_p = (listview.filter_area.clear) ? listview.filter_area.clear(false) : Promise.resolve();
		if (clear_p && clear_p.then) {
			clear_p.then(() => {
				if (filters_to_add.length) {
					listview.filter_area.add(filters_to_add, true);
				} else {
					listview.refresh();
				}
			});
		} else {
			if (filters_to_add.length) {
				listview.filter_area.add(filters_to_add, true);
			} else {
				listview.refresh();
			}
		}
	};
}
