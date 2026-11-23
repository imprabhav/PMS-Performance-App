function get_cached_pms_context() {
	if (window._pms_user_context) return window._pms_user_context;
	try {
		let stored = sessionStorage.getItem("pms_user_context_" + (frappe.session.user || "default"));
		if (stored) {
			window._pms_user_context = JSON.parse(stored);
			return window._pms_user_context;
		}
	} catch(e) {}
	return null;
}

function set_cached_pms_context(data) {
	if (!data) return;
	window._pms_user_context = data;
	try {
		sessionStorage.setItem("pms_user_context_" + (frappe.session.user || "default"), JSON.stringify(data));
	} catch(e) {}
}

function sync_pms_standard_filters(listview) {
	if (!listview || !listview.page || !listview.page.fields_dict) return;
	let is_appraisal = (listview._current_view_mode === "appraisal");

	// Always hide amendment_window_open if present in filter bar
	if (listview.page.fields_dict.amendment_window_open && listview.page.fields_dict.amendment_window_open.$wrapper) {
		listview.page.fields_dict.amendment_window_open.$wrapper.hide();
	}

	// Mute refresh triggers on standard filter changes only during mode sync
	if (listview.filter_area) {
		listview.filter_area.trigger_refresh = false;
	}

	if (is_appraisal) {
		listview.$page && listview.$page.removeClass("pms-mode-plan").addClass("pms-mode-appraisal");
		$(listview.wrapper).removeClass("pms-mode-plan").addClass("pms-mode-appraisal");
		if (listview.page.fields_dict.plan_status && listview.page.fields_dict.plan_status.$wrapper) {
			listview.page.fields_dict.plan_status.$wrapper.hide();
			if (listview.page.fields_dict.plan_status.get_value()) {
				listview.page.fields_dict.plan_status.set_value("");
			}
		}
		if (listview.page.fields_dict.appraisal_status && listview.page.fields_dict.appraisal_status.$wrapper) {
			listview.page.fields_dict.appraisal_status.$wrapper.show();
			listview.page.fields_dict.appraisal_status.$wrapper.find('option[value="Not Activated"]').remove();
		}
	} else {
		listview.$page && listview.$page.removeClass("pms-mode-appraisal").addClass("pms-mode-plan");
		$(listview.wrapper).removeClass("pms-mode-appraisal").addClass("pms-mode-plan");
		if (listview.page.fields_dict.appraisal_status && listview.page.fields_dict.appraisal_status.$wrapper) {
			listview.page.fields_dict.appraisal_status.$wrapper.hide();
			if (listview.page.fields_dict.appraisal_status.get_value()) {
				listview.page.fields_dict.appraisal_status.set_value("");
			}
		}
		if (listview.page.fields_dict.plan_status && listview.page.fields_dict.plan_status.$wrapper) {
			listview.page.fields_dict.plan_status.$wrapper.show();
			listview.page.fields_dict.plan_status.$wrapper.find('option[value="Returned"]').remove();
			listview.page.fields_dict.plan_status.$wrapper.find('option[value="Rejected"]').remove();
			listview.page.fields_dict.plan_status.$wrapper.find('option[value="Monitoring"]').remove();
		}
	}

	// Always restore trigger_refresh so standard filter selections instantly filter the list
	if (listview.filter_area) {
		listview.filter_area.trigger_refresh = true;
	}

	// Explicitly bind change handlers on standard filters to ensure immediate refresh on user selection
	['plan_status', 'appraisal_status', 'calendar_year', 'employee_name', 'name'].forEach(fn => {
		let fld = listview.page && listview.page.fields_dict && listview.page.fields_dict[fn];
		if (fld && !fld._pms_change_bound) {
			fld._pms_change_bound = true;
			if (fld.$input) {
				fld.$input.on('change', function() {
					if (listview.filter_area) {
						listview.filter_area.trigger_refresh = true;
					}
					listview.start = 0;
					listview.refresh();
				});
			}
		}
	});
}

function update_pms_sidebar_active(mode) {
	if (typeof window.sync_pms_sidebar_active_item === "function") {
		window.sync_pms_sidebar_active_item(mode);
	} else {
		setTimeout(function() {
			var $sidebar = $('.body-sidebar, .desk-sidebar');
			if (!$sidebar.length) return;
			$sidebar.find('.sidebar-item-container').removeClass('is-selected active-sidebar selected');
			$sidebar.find('.standard-sidebar-item').removeClass('active-sidebar is-selected selected');
			var targetName = (mode === "appraisal") ? "PMS Appraisal Form" : "PMS Performance Plan";
			var $target = $sidebar.find('.sidebar-item-container[item-name="' + targetName + '"]');
			$target.addClass('is-selected');
			$target.find('.standard-sidebar-item').addClass('active-sidebar selected');
		}, 50);
	}
}


function get_pms_plan_display_status(doc) {
	if (!doc) return "Draft";
	let ps = doc.plan_status || "Draft";
	if (ps === "Draft") return "Draft";
	if (ps === "Pending Supervisor Approval") return "Pending Supervisor Approval";
	if (ps === "Returned by Supervisor") return "Returned by Supervisor";
	if (ps === "Pending Reviewer Approval") return "Pending Reviewer Approval";
	if (ps === "Returned by Reviewer") return "Returned by Reviewer";
	if (ps === "Returned" || ps === "Rejected") {
		return (doc.revised_by_role === "Reviewer") ? "Returned by Reviewer" : "Returned by Supervisor";
	}
	if (doc.locked || doc.appraisal_status === "Finalized & Locked" || doc.workflow_state === "Appraisal Completed" || ps === "Finalized & Locked") {
		return "Finalized & Locked";
	}
	if (doc.workflow_state === "Appraisal Open" || (doc.appraisal_status && doc.appraisal_status !== "Not Activated") || ps === "Appraisal Open") {
		return "Appraisal Open";
	}
	if (doc.amendment_window_open || ps === "Amendment In Progress") {
		return "Amendment In Progress";
	}
	return ps || "Approved";
}

function get_pms_plan_status_color(status) {
	switch(status) {
		case "Approved": return "green";
		case "Finalized & Locked": return "green";
		case "Appraisal Open": return "orange";
		case "Amendment In Progress": return "blue";
		case "Pending Supervisor Approval": return "orange";
		case "Returned by Supervisor": return "orange";
		case "Pending Reviewer Approval": return "purple";
		case "Returned by Reviewer": return "red";
		case "Draft": return "gray";
		default: return "blue";
	}
}

frappe.listview_settings['PMS Appraisal'] = {
	add_fields: [
		"employee",
		"employee_name",
		"cycle",
		"calendar_year",
		"cycle_end_date",
		"supervisor_name",
		"supervisor_snapshot",
		"reviewer_name",
		"reviewer_snapshot",
		"plan_status",
		"workflow_state",
		"appraisal_status",
		"total_score",
		"rating_band",
		"locked",
		"amendment_window_open",
		"revised_by_role"
	],
	
	get_indicator: function(doc) {
		let mode = localStorage.getItem("pms_view_mode") || "plan";
		if (mode === "appraisal") {
			let val = doc.appraisal_status || "Not Activated";
			let color = "blue";
			if (val === "Appraisal Accepted" || val === "Finalized & Locked") color = "green";
			else if (val.includes("Dispute") || val.includes("PERC")) color = "orange";
			else if (val.includes("Supervisor")) color = "purple";
			else if (val === "Not Activated") color = "gray";
			return [__(val), color, "appraisal_status,=," + val];
		} else {
			let val = get_pms_plan_display_status(doc);
			let color = get_pms_plan_status_color(val);
			return [__(val), color, "plan_status,=," + (doc.plan_status || "Draft")];
		}
	},

	formatters: {
		employee_name(val, df, doc) {
			if (val) {
				return `<span style="font-weight: 600; color: var(--text-color);">${frappe.utils.escape_html(val)}</span>`;
			}
			return val || "--";
		},
		plan_status(val, df, doc) {
			let status = get_pms_plan_display_status(doc);
			let color = get_pms_plan_status_color(status);
			return `<span class="indicator-pill ${color} small">${frappe.utils.escape_html(status)}</span>`;
		},
		workflow_state(val, df, doc) {
			if (!val) return "--";
			return `<span class="text-muted small">${frappe.utils.escape_html(val)}</span>`;
		},
		appraisal_status(val, df, doc) {
			if (!val || val === "Not Activated") {
				return `<span class="text-muted small">Not Activated</span>`;
			}
			let color = "blue";
			if (val === "Appraisal Accepted" || val === "Finalized & Locked") color = "green";
			else if (val.includes("Dispute") || val.includes("PERC")) color = "orange";
			else if (val.includes("Supervisor")) color = "purple";
			return `<span class="indicator-pill ${color} small">${frappe.utils.escape_html(val)}</span>`;
		},
		total_score(val, df, doc) {
			if (val != null && doc.appraisal_status && doc.appraisal_status !== "Not Activated") {
				return `<strong style="color: #15803d;">${flt(val, 2)}</strong>`;
			}
			return "--";
		},
		rating_band(val, df, doc) {
			if (val && doc.appraisal_status && doc.appraisal_status !== "Not Activated") {
				return `<span style="font-weight: 600;">${frappe.utils.escape_html(val)}</span>`;
			}
			return "--";
		},
		supervisor_name(val, df, doc) {
			if (!val || val === "Not Assigned") return `<span class="text-muted small">Not Assigned</span>`;
			return `<span class="small font-weight-bold" style="color: var(--text-color);">${frappe.utils.escape_html(val)}</span>`;
		},
		reviewer_name(val, df, doc) {
			if (!val || val === "Not Assigned") return `<span class="text-muted small">Not Assigned</span>`;
			return `<span class="small font-weight-bold" style="color: var(--text-color);">${frappe.utils.escape_html(val)}</span>`;
		},
		cycle_end_date(val, df, doc) {
			if (!val) return `<span class="text-muted small">--</span>`;
			let formatted = frappe.datetime && frappe.datetime.str_to_user ? frappe.datetime.str_to_user(val) : val;
			return `<span class="small" style="color: var(--text-muted); font-weight: 500;">${frappe.utils.escape_html(formatted)}</span>`;
		}
	},

	onload: function(listview) {
		listview.$page && listview.$page.addClass("pms-appraisal-list-view");
		listview.$result && listview.$result.addClass("pms-appraisal-list-view");
		$(listview.wrapper).addClass("pms-appraisal-list-view");

		listview.apply_column_widths = function() {
			const widths = {
				name: 160,
				employee: 120,
				employee_name: 135,
				cycle: 165,
				plan_status: 210,
				appraisal_status: 210,
				supervisor_name: 145,
				reviewer_name: 145,
				total_score: 110,
				rating_band: 170
			};
			Object.entries(widths).forEach(([fn, w]) => {
				$(listview.wrapper).find(`.list-row-col[data-fieldname="${fn}"]`).css({
					"width": `${w}px`,
					"min-width": `${w}px`,
					"max-width": `${w}px`,
					"flex": `0 0 ${w}px`
				});
			});
		};

		if (listview.render_list) {
			const orig_render_list = listview.render_list.bind(listview);
			listview.render_list = function() {
				orig_render_list();
				listview.apply_column_widths && listview.apply_column_widths();
			};
		}

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

			let is_appraisal = (this._current_view_mode === "appraisal");
			let fieldnames = is_appraisal
				? ["employee", "employee_name", "cycle", "appraisal_status", "supervisor_name", "reviewer_name", "total_score", "rating_band"]
				: ["employee", "employee_name", "cycle", "plan_status", "supervisor_name", "reviewer_name"];

			fieldnames.forEach((fn) => {
				let orig_df = get_df(fn);
				if (orig_df) {
					let df = Object.assign({}, orig_df);
					if (fn === "plan_status" || fn === "appraisal_status") {
						df.label = __("Status");
					}
					this.columns.push({
						type: "Field",
						df: df,
					});
				}
			});

			// 2nd column: tag (normally hidden in Frappe)
			this.columns.splice(1, 0, {
				type: "Tag",
			});
		};

		attach_pms_view_mode_methods(listview);
		setup_pms_scope_system(listview);

		let view_mode = "plan";
		if (frappe.route_options && frappe.route_options.view_mode) {
			view_mode = frappe.route_options.view_mode;
			delete frappe.route_options.view_mode;
			localStorage.setItem("pms_view_mode", view_mode);
		} else if (localStorage.getItem("pms_view_mode")) {
			view_mode = localStorage.getItem("pms_view_mode");
		}

		let extra_filters = [];
		if (frappe.route_options && typeof frappe.route_options.plan_status === "string" && frappe.route_options.plan_status.includes('["in"')) {
			try {
				let parsed = JSON.parse(frappe.route_options.plan_status);
				delete frappe.route_options.plan_status;
				extra_filters.push(["PMS Appraisal", "plan_status", "in", parsed[1], false]);
				view_mode = "plan";
				localStorage.setItem("pms_view_mode", "plan");
				listview._current_plan_scope = "pending";
			} catch(e) {}
		} else if (frappe.route_options && Array.isArray(frappe.route_options.plan_status)) {
			let cond = frappe.route_options.plan_status;
			delete frappe.route_options.plan_status;
			extra_filters.push(["PMS Appraisal", "plan_status", cond[0], cond[1], false]);
			view_mode = "plan";
			localStorage.setItem("pms_view_mode", "plan");
			listview._current_plan_scope = "pending";
		}

		listview.apply_pms_view_mode(view_mode, true, extra_filters);

		// Ensure row clicks remember the current view mode
		$(listview.wrapper).on('click', '.list-row, .list-subject a, .list-row-container', function() {
			localStorage.setItem("pms_view_mode", listview._current_view_mode || "plan");
		});
	},

	refresh: function(listview) {
		attach_pms_view_mode_methods(listview);
		setup_pms_scope_system(listview);

		listview.$page && listview.$page.addClass("pms-appraisal-list-view");
		listview.$result && listview.$result.addClass("pms-appraisal-list-view");
		$(listview.wrapper).addClass("pms-appraisal-list-view");

		if (listview.setup_columns) {
			listview.setup_columns();
			if (listview.render_header) {
				listview.render_header(true);
			}
			if (listview.apply_column_widths) {
				listview.apply_column_widths();
			}
		}

		// Render Tab Switcher (Performance Plans vs Appraisals)
		if (!listview.$page.find('.pms-view-mode-tabs').length) {
			let $tabs = $(`
				<div class="pms-view-mode-tabs btn-group" style="margin-right: 12px; display: inline-flex;">
					<button class="btn btn-sm btn-default tab-plans font-weight-bold" type="button">
						<i class="fa fa-clipboard" style="margin-right: 4px;"></i> ${__("Performance Plans")}
					</button>
					<button class="btn btn-sm btn-default tab-appraisals font-weight-bold" type="button">
						<i class="fa fa-check-circle" style="margin-right: 4px;"></i> ${__("Appraisals")}
					</button>
				</div>
			`);

			listview.page.page_actions.prepend($tabs);

			$tabs.find('.tab-plans').on('click', function() {
				listview.apply_pms_view_mode("plan", true);
			});

			$tabs.find('.tab-appraisals').on('click', function() {
				listview.apply_pms_view_mode("appraisal", true);
			});
		}

		// Check if a specific view mode was requested via route_options or localStorage
		let target_mode = null;
		if (frappe.route_options && frappe.route_options.view_mode) {
			target_mode = frappe.route_options.view_mode;
			delete frappe.route_options.view_mode;
		} else if (localStorage.getItem("pms_view_mode")) {
			target_mode = localStorage.getItem("pms_view_mode");
		} else {
			target_mode = listview._current_view_mode || "plan";
		}

		if (target_mode !== listview._current_view_mode) {
			listview.apply_pms_view_mode(target_mode, true);
			return;
		}

		let is_appraisal_mode = (listview._current_view_mode === "appraisal");

		// Set title based on current view mode
		listview.page.set_title(is_appraisal_mode ? __("PMS Appraisal Form") : __("PMS Performance Plan"));

		// Update tab active classes
		let $tabs = listview.$page.find('.pms-view-mode-tabs');
		if ($tabs.length) {
			if (is_appraisal_mode) {
				$tabs.find('.tab-plans').removeClass('btn-primary text-white').addClass('btn-default');
				$tabs.find('.tab-appraisals').removeClass('btn-default').addClass('btn-primary text-white');
			} else {
				$tabs.find('.tab-plans').removeClass('btn-default').addClass('btn-primary text-white');
				$tabs.find('.tab-appraisals').removeClass('btn-primary text-white').addClass('btn-default');
			}
		}

		// Primary Action Button
		let is_supervisor_2_only = frappe.user_roles && frappe.user_roles.includes("Supervisor 2") &&
			!frappe.user_roles.includes("System Manager") &&
			!frappe.user_roles.includes("HR Admin") &&
			!frappe.user_roles.includes("HR Manager") &&
			!frappe.user_roles.includes("Employee") &&
			!frappe.user_roles.includes("Supervisor") &&
			!frappe.user_roles.includes("Reviewer");

		if (listview.page.btn_primary) {
			if (is_appraisal_mode || is_supervisor_2_only) {
				listview.page.btn_primary.hide();
			} else {
				listview.page.btn_primary.show();
				listview.page.set_primary_action(__("Add PMS Performance Plan"), function() {
					frappe.new_doc("PMS Appraisal");
				});
			}
		}

		update_pms_sidebar_active(listview._current_view_mode || "plan");

		if (listview.render_pms_scope_bar) {
			listview.render_pms_scope_bar();
		}

		sync_pms_standard_filters(listview);

		// Bulk Approve & Reject Actions for Supervisors/Reviewers on Plans
		let can_approve = frappe.user_roles && (frappe.user_roles.includes("Supervisor") ||
			frappe.user_roles.includes("Supervisor 2") ||
			frappe.user_roles.includes("Reviewer") ||
			frappe.user_roles.includes("System Manager") ||
			frappe.user_roles.includes("HR Admin") ||
			frappe.user_roles.includes("HR Manager"));

		if (can_approve && !is_appraisal_mode) {
			if (!listview._bulk_actions_added) {
				listview._bulk_actions_added = true;
				listview.page.add_actions_menu_item(__("Approve Selected Plans"), () => {
					let valid_docnames = validate_plan_bulk_action(listview, __("Approve"));
					if (!valid_docnames || valid_docnames.length === 0) return;

					frappe.confirm(
						__("Are you sure you want to approve {0} selected Performance Plan(s)?", [valid_docnames.length]),
						function() {
							frappe.call({
								method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.bulk_approve_plan",
								args: { docnames: valid_docnames },
								freeze: true,
								freeze_message: __("Approving selected plans..."),
								callback: function(r) {
									if (!r.exc) {
										frappe.show_alert({message: __('Successfully Approved'), indicator: 'green'});
										listview.refresh();
									}
								}
							});
						}
					);
				});

				listview.page.add_actions_menu_item(__("Return Selected Plans"), () => {
					let valid_docnames = validate_plan_bulk_action(listview, __("Return"));
					if (!valid_docnames || valid_docnames.length === 0) return;

					frappe.prompt(
						{ fieldtype: "Small Text", fieldname: "remark", label: __("Return Remark"), reqd: 1 },
						function(values) {
							frappe.call({
								method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.bulk_reject_plan",
								args: { docnames: valid_docnames, remark: values.remark },
								freeze: true,
								freeze_message: __("Returning selected plans..."),
								callback: function(res) {
									if (!res.exc) {
										frappe.show_alert({message: __('Successfully Returned'), indicator: 'orange'});
										listview.refresh();
									}
								}
							});
						},
						__("Return Plans"),
						__("Return")
					);
				});
			}
		}
	}
};

function validate_plan_bulk_action(listview, action_label) {
	let checked_items = listview.get_checked_items();
	if (!checked_items || checked_items.length === 0) {
		frappe.msgprint(__('Please select at least one Performance Plan.'));
		return null;
	}

	let user_roles = frappe.user_roles || (frappe.boot && frappe.boot.user && frappe.boot.user.roles) || [];
	let is_admin = user_roles.includes("System Manager") || user_roles.includes("Administrator") || user_roles.includes("HR Admin") || user_roles.includes("HR Manager");
	let is_sup = user_roles.includes("Supervisor") || user_roles.includes("Supervisor 2");
	let is_rev = user_roles.includes("Reviewer");

	let invalid_items = [];
	let valid_docnames = [];

	for (let item of checked_items) {
		let status = item.plan_status || "Draft";
		let label = item.employee_name ? `${item.employee_name} (${item.name})` : item.name;

		if (is_admin) {
			if (status === "Pending Supervisor Approval" || status === "Pending Reviewer Approval") {
				valid_docnames.push(item.name);
			} else {
				invalid_items.push({ name: label, status: status, reason: __("Not pending approval (Current Status: {0})", [status]) });
			}
		} else if (is_sup && !is_rev) {
			if (status === "Pending Supervisor Approval") {
				valid_docnames.push(item.name);
			} else {
				invalid_items.push({ name: label, status: status, reason: __("Supervisor can only process 'Pending Supervisor Approval' plans (Current Status: {0})", [status]) });
			}
		} else if (is_rev && !is_sup) {
			if (status === "Pending Reviewer Approval") {
				valid_docnames.push(item.name);
			} else {
				invalid_items.push({ name: label, status: status, reason: __("Reviewer can only process 'Pending Reviewer Approval' plans (Current Status: {0})", [status]) });
			}
		} else {
			// Both supervisor and reviewer roles
			if (status === "Pending Supervisor Approval" || status === "Pending Reviewer Approval") {
				valid_docnames.push(item.name);
			} else {
				invalid_items.push({ name: label, status: status, reason: __("Not pending approval (Current Status: {0})", [status]) });
			}
		}
	}

	if (invalid_items.length > 0) {
		let details = invalid_items.map(i => `• <b>${frappe.utils.escape_html(i.name)}</b>: <span class="text-muted">${frappe.utils.escape_html(i.reason)}</span>`).join("<br>");
		let role_req = (is_sup && !is_rev)
			? __("As a Supervisor, you can only {0} plans in <b>'Pending Supervisor Approval'</b> status.", [action_label.toLowerCase()])
			: (is_rev && !is_sup)
			? __("As a Reviewer, you can only {0} plans in <b>'Pending Reviewer Approval'</b> status.", [action_label.toLowerCase()])
			: __("You can only {0} plans in <b>'Pending Supervisor Approval'</b> or <b>'Pending Reviewer Approval'</b> status.", [action_label.toLowerCase()]);

		frappe.msgprint({
			title: __("Cannot {0} Selected Plans", [action_label]),
			message: `<div style="font-size: 13px; line-height: 1.6;">
				<p>${role_req}</p>
				<p><b>Draft, Returned, or Approved plans cannot be ${action_label.toLowerCase()}ed.</b></p>
				<p style="margin-top: 8px;"><b>Invalid Plans Selected:</b></p>
				<div>${details}</div>
			</div>`,
			indicator: "orange"
		});
		return null;
	}

	return valid_docnames;
}


function is_managerial_user() {
	let roles = frappe.user_roles || (frappe.boot && frappe.boot.user && frappe.boot.user.roles) || [];
	if (roles.includes("HR Admin") || roles.includes("HR Manager")) {
		return false;
	}
	return roles.some(r => [
		"Supervisor",
		"Supervisor 2",
		"Reviewer"
	].includes(r));
}

function attach_pms_view_mode_methods(listview) {
	if (listview._pms_methods_attached) return;
	listview._pms_methods_attached = true;

	listview.set_pms_filters_and_refresh = function(filters_to_add) {
		if (!listview.filter_area) {
			listview.refresh();
			return Promise.resolve();
		}

		listview._is_applying_pms_filters = true;
		listview.filter_area.trigger_refresh = false;

		if (listview.filter_area.filter_list) {
			listview.filter_area.filter_list.clear_filters();
		}

		let promise = (filters_to_add && filters_to_add.length && listview.filter_area.filter_list)
			? listview.filter_area.filter_list.add_filters(filters_to_add)
			: Promise.resolve();

		return promise.then(() => {
			listview.filter_area.trigger_refresh = true;
			if (listview.filter_area.filter_list) {
				listview.filter_area.filter_list.update_filter_button();
			}
			listview.start = 0;
			listview.refresh();
			setTimeout(() => {
				listview._is_applying_pms_filters = false;
			}, 150);
		}).catch(err => {
			console.error("Error setting PMS filters:", err);
			listview.filter_area.trigger_refresh = true;
			listview._is_applying_pms_filters = false;
			listview.refresh();
		});
	};

	listview.apply_pms_view_mode = function(mode, force_reload, extra_filters) {
		if (!mode) mode = "plan";
		listview._current_view_mode = mode;
		localStorage.setItem("pms_view_mode", mode);
		let is_appraisal = (mode === "appraisal");

		// 1. Update Title
		if (listview.page && listview.page.set_title) {
			listview.page.set_title(is_appraisal ? __("PMS Appraisal Form") : __("PMS Performance Plan"));
		}

		// 2. Update In-page Tab Buttons
		let $tabs = listview.$page.find('.pms-view-mode-tabs');
		if ($tabs.length) {
			if (is_appraisal) {
				$tabs.find('.tab-plans').removeClass('btn-primary text-white').addClass('btn-default');
				$tabs.find('.tab-appraisals').removeClass('btn-default').addClass('btn-primary text-white');
			} else {
				$tabs.find('.tab-plans').removeClass('btn-default').addClass('btn-primary text-white');
				$tabs.find('.tab-appraisals').removeClass('btn-primary text-white').addClass('btn-default');
			}
		}

		// 3. Update Primary Action Button
		let is_supervisor_2_only = frappe.user_roles && frappe.user_roles.includes("Supervisor 2") &&
			!frappe.user_roles.includes("System Manager") &&
			!frappe.user_roles.includes("HR Admin") &&
			!frappe.user_roles.includes("HR Manager") &&
			!frappe.user_roles.includes("Employee") &&
			!frappe.user_roles.includes("Supervisor") &&
			!frappe.user_roles.includes("Reviewer");

		if (listview.page && listview.page.btn_primary) {
			if (is_appraisal || is_supervisor_2_only) {
				listview.page.btn_primary.hide();
			} else {
				listview.page.btn_primary.show();
				listview.page.set_primary_action(__("Add PMS Performance Plan"), function() {
					frappe.new_doc("PMS Appraisal");
				});
			}
		}

		// 4. Update Sidebar Active Item
		update_pms_sidebar_active(mode);

		// 5. Update Columns & Re-render Header
		if (listview.setup_columns) {
			listview.setup_columns();
			if (listview.render_header) {
				listview.render_header(true);
			}
			if (listview.apply_column_widths) {
				listview.apply_column_widths();
			}
		}

		// 6. Update Scope Bar UI
		if (listview.render_pms_scope_bar) {
			listview.render_pms_scope_bar();
		}

		// 7. Toggle Status Standard Filter (plan_status in Plan mode, appraisal_status in Appraisal mode)
		sync_pms_standard_filters(listview);

		// 8. Update Combined Filters and refresh list atomically
		listview.apply_combined_filters(force_reload !== false, extra_filters);
	};
}

function setup_pms_scope_system(listview) {
	let is_hr_admin = (frappe.user_roles || []).some(r => ["HR Admin", "HR Manager"].includes(r));
	let can_team_initial = !is_hr_admin && is_managerial_user();

	// 1. Immediately initialize context synchronously from cache
	let cached_ctx = get_cached_pms_context();
	if (cached_ctx) {
		listview._pms_context = cached_ctx;
	}

	// 2. Fetch / refresh user performance context
	if (!listview._pms_context_loading) {
		listview._pms_context_loading = true;
		frappe.call({
			method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.get_user_performance_context",
			callback: function(r) {
				listview._pms_context_loading = false;
				if (r && r.message) {
					let had_cached = !!listview._pms_context;
					listview._pms_context = r.message;
					set_cached_pms_context(r.message);

					let can_see_team = !is_hr_admin && (r.message.can_see_team && is_managerial_user());
					if (!can_see_team) {
						listview._current_plan_scope = "all";
						listview.$page.find('.pms-scope-bar').remove();
					} else {
						if (listview.render_pms_scope_bar) {
							listview.render_pms_scope_bar();
						}
						if (!had_cached && listview._current_plan_scope && listview._current_plan_scope !== "all") {
							listview.apply_combined_filters(true);
						}
					}
				}
			}
		});
	}

	// 3. Initialize scope: normal employees and HR Admin must ALWAYS default to "all" with no scope filters
	if (is_hr_admin || !can_team_initial) {
		listview._current_plan_scope = "all";
		let user_key = "pms_plan_scope_" + (frappe.session.user || "default");
		try { localStorage.removeItem(user_key); } catch(e) {}
	} else if (!listview._current_plan_scope) {
		let initial_scope = "team";
		let user_key = "pms_plan_scope_" + (frappe.session.user || "default");
		if (frappe.route_options && frappe.route_options.scope) {
			initial_scope = frappe.route_options.scope;
			delete frappe.route_options.scope;
		} else if (frappe.route_options && frappe.route_options.plan_status) {
			let ps = String(frappe.route_options.plan_status);
			if (ps.includes("Pending")) {
				initial_scope = "pending";
			}
		} else if (localStorage.getItem(user_key)) {
			initial_scope = localStorage.getItem(user_key);
		}
		listview._current_plan_scope = initial_scope;
	}

	// 4. Render Scope Bar UI
	listview.render_pms_scope_bar = function() {
		let is_hr_admin = (frappe.user_roles || []).some(r => ["HR Admin", "HR Manager"].includes(r));
		if (is_hr_admin) {
			listview.$page.find('.pms-scope-bar').remove();
			return;
		}

		let ctx = listview._pms_context || get_cached_pms_context();
		let can_team = is_managerial_user() && (ctx ? ctx.can_see_team : true);
		if (!can_team) {
			listview.$page.find('.pms-scope-bar').remove();
			return;
		}

		let is_appraisal = (listview._current_view_mode === "appraisal");
		let current_scope = listview._current_plan_scope || "team";

		let label_my = is_appraisal ? __("My Appraisal") : __("My Performance Plan");
		let label_team = is_appraisal ? __("My Team Appraisals") : __("My Team Performance");
		let label_pending = is_appraisal ? __("Pending Evaluation") : __("Pending Approval");
		let label_all = is_appraisal ? __("All Appraisals") : __("All Plans");

		let pending_count = is_appraisal ? (ctx ? (ctx.pending_appraisal_count || 0) : 0) : (ctx ? (ctx.pending_plan_count || 0) : 0);

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
				listview._current_plan_scope = selected_scope;
				let user_key = "pms_plan_scope_" + (frappe.session.user || "default");
				localStorage.setItem(user_key, selected_scope);
				listview.render_pms_scope_bar();
				listview.apply_combined_filters(true);
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
			hint_text = is_appraisal ? __("Viewing your own appraisal form") : __("Viewing your own individual performance plan");
		} else if (current_scope === "team") {
			hint_text = is_appraisal ? __("Viewing team appraisals for your direct reports") : __("Viewing all team performance plans reporting to you");
		} else if (current_scope === "pending") {
			hint_text = is_appraisal ? __("Showing team appraisals awaiting your evaluation/review") : __("Showing team performance plans awaiting your approval");
		} else {
			hint_text = __("Showing all accessible records");
		}
		$bar.find('.pms-scope-hint').text(hint_text);
	};

	// 5. Combined Filter Functionality (Atomic, Single-Click)
	listview.apply_combined_filters = function(force_reload, extra_filters) {
		let is_hr_admin = (frappe.user_roles || []).some(r => ["HR Admin", "HR Manager"].includes(r));
		let ctx = listview._pms_context || get_cached_pms_context() || {};
		let is_appraisal = (listview._current_view_mode === "appraisal");
		let can_team = !is_hr_admin && is_managerial_user() && (ctx.can_see_team !== false);

		// If user is a normal employee or HR Admin, do NOT activate any team/my filters!
		if (!can_team) {
			listview._current_plan_scope = "all";
			let filters_to_add = [];
			if (is_appraisal) {
				let has_selected_status = listview.page && listview.page.fields_dict && listview.page.fields_dict.appraisal_status && listview.page.fields_dict.appraisal_status.get_value();
				if (!has_selected_status) {
					filters_to_add.push(["PMS Appraisal", "appraisal_status", "!=", "Not Activated", false]);
				}
			}
			if (extra_filters && Array.isArray(extra_filters)) {
				filters_to_add = filters_to_add.concat(extra_filters);
			}
			return listview.set_pms_filters_and_refresh(filters_to_add);
		}

		let scope = listview._current_plan_scope || "team";
		let filters_to_add = [];

		if (scope === "my") {
			if (ctx.employee_id) {
				filters_to_add.push(["PMS Appraisal", "employee", "=", ctx.employee_id, false]);
			} else if (frappe.session.user && frappe.session.user !== "Administrator") {
				filters_to_add.push(["PMS Appraisal", "owner", "=", frappe.session.user, false]);
			}
			if (is_appraisal) {
				let has_selected_status = listview.page && listview.page.fields_dict && listview.page.fields_dict.appraisal_status && listview.page.fields_dict.appraisal_status.get_value();
				if (!has_selected_status) {
					filters_to_add.push(["PMS Appraisal", "appraisal_status", "!=", "Not Activated", false]);
				}
			}
		} else if (scope === "team") {
			if (ctx.employee_id) {
				filters_to_add.push(["PMS Appraisal", "employee", "!=", ctx.employee_id, false]);
			}
			if (is_appraisal) {
				let has_selected_status = listview.page && listview.page.fields_dict && listview.page.fields_dict.appraisal_status && listview.page.fields_dict.appraisal_status.get_value();
				if (!has_selected_status) {
					filters_to_add.push(["PMS Appraisal", "appraisal_status", "!=", "Not Activated", false]);
				}
			}
		} else if (scope === "pending") {
			if (ctx.employee_id) {
				filters_to_add.push(["PMS Appraisal", "employee", "!=", ctx.employee_id, false]);
			}
			if (is_appraisal) {
				if (ctx.is_supervisor && !ctx.is_reviewer && !ctx.is_admin && !ctx.is_supervisor_2) {
					filters_to_add.push(["PMS Appraisal", "appraisal_status", "in", ["Pending Supervisor Evaluation", "Pending Supervisor Review"], false]);
				} else if (ctx.is_reviewer && !ctx.is_supervisor && !ctx.is_admin && !ctx.is_supervisor_2) {
					filters_to_add.push(["PMS Appraisal", "appraisal_status", "in", ["Pending Reviewer Review", "Pending Reviewer Evaluation"], false]);
				} else {
					filters_to_add.push(["PMS Appraisal", "appraisal_status", "in", ["Pending Supervisor Evaluation", "Pending Supervisor Review", "Pending Reviewer Review", "Pending Reviewer Evaluation"], false]);
				}
			} else {
				if (ctx.is_supervisor && !ctx.is_reviewer && !ctx.is_admin && !ctx.is_supervisor_2) {
					filters_to_add.push(["PMS Appraisal", "plan_status", "=", "Pending Supervisor Approval", false]);
				} else if (ctx.is_reviewer && !ctx.is_supervisor && !ctx.is_admin && !ctx.is_supervisor_2) {
					filters_to_add.push(["PMS Appraisal", "plan_status", "=", "Pending Reviewer Approval", false]);
				} else {
					filters_to_add.push(["PMS Appraisal", "plan_status", "in", ["Pending Supervisor Approval", "Pending Reviewer Approval"], false]);
				}
			}
		} else if (scope === "all") {
			if (is_appraisal) {
				let has_selected_status = listview.page && listview.page.fields_dict && listview.page.fields_dict.appraisal_status && listview.page.fields_dict.appraisal_status.get_value();
				if (!has_selected_status) {
					filters_to_add.push(["PMS Appraisal", "appraisal_status", "!=", "Not Activated", false]);
				}
			}
		}

		if (extra_filters && Array.isArray(extra_filters)) {
			filters_to_add = filters_to_add.concat(extra_filters);
		}

		return listview.set_pms_filters_and_refresh(filters_to_add);
	};
}
