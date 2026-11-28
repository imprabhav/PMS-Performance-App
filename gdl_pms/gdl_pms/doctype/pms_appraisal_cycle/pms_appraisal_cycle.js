// Copyright (c) 2026, GDL and contributors
// For license information, please see license.txt

frappe.ui.form.on("PMS Appraisal Cycle", {
	onload: function(frm) {
		load_grade_group_options(frm);
		frm.set_df_property("status", "read_only", 1);
		if (frm.is_new()) {
			let current_year = String(frappe.datetime.nowdate ? frappe.datetime.nowdate().split("-")[0] : (new Date()).getFullYear());
			let changed = false;
			if (!frm.doc.cycle_type) { frm.doc.cycle_type = "Annual"; changed = true; }
			if (!frm.doc.grade_group) { frm.doc.grade_group = "All"; changed = true; }
			if (!frm.doc.calendar_year) { frm.doc.calendar_year = current_year; changed = true; }
			if (!frm.doc.end_date) { frm.doc.end_date = current_year + "-12-31"; changed = true; }
			if (!frm.doc.status) { frm.doc.status = "Draft"; changed = true; }
			if (changed) {
				frm.refresh_fields(["cycle_type", "grade_group", "calendar_year", "end_date", "status"]);
			}
		}
		if (!is_hr_admin_user()) {
			hide_employee_hierarchy_section(frm);
			return;
		}
		show_employee_hierarchy_section(frm);
	},

	onload_post_render: function(frm) {
		if (!is_hr_admin_user()) return;
		show_employee_hierarchy_section(frm);
		setup_cycle_grid_formatters(frm);
		toggle_plan_and_status_columns(frm);
	},

	refresh: function(frm) {
		load_grade_group_options(frm);
		frm.set_df_property("status", "read_only", 1);
		if (frm.doc.cycle_type === "Probation") {
			frm.set_df_property("start_date", "label", __("Start Date (Joining Date)"));
		} else {
			frm.set_df_property("start_date", "label", __("Start Date"));
		}
		setup_cycle_action_buttons(frm);

		$(frm.wrapper).off("dirty.cycle_buttons").on("dirty.cycle_buttons", function() {
			setTimeout(() => {
				setup_cycle_action_buttons(frm);
			}, 60);
		});

		if (frm.is_new()) {
			let current_year = String(frappe.datetime.nowdate ? frappe.datetime.nowdate().split("-")[0] : (new Date()).getFullYear());
			if (!frm.doc.cycle_type) frm.doc.cycle_type = "Annual";
			if (!frm.doc.grade_group) frm.doc.grade_group = "All";
			if (!frm.doc.calendar_year) frm.doc.calendar_year = current_year;
			if (!frm.doc.end_date) frm.doc.end_date = current_year + "-12-31";
		}
		if (!is_hr_admin_user()) {
			hide_employee_hierarchy_section(frm);
			return;
		}

		// Register HR Actions reliably before grid/summary rendering
		frm.page.add_inner_button(__("Sync Employees List"), function() {
			frappe.confirm(__("This will refresh the applicable employees list with their current supervisor and reviewer details from Employee masters. Continue?"), function() {
				frappe.call({
					method: "gdl_pms.gdl_pms.doctype.pms_appraisal_cycle.pms_appraisal_cycle.sync_cycle_employees",
					args: {
						cycle_name: frm.doc.name
					},
					freeze: true,
					freeze_message: __("Updating employee hierarchy..."),
					callback: function(r) {
						if (r.message) {
							frm.reload_doc();
							frappe.show_alert({
								message: __("Applicable employees list updated successfully!"),
								indicator: "green"
							});
						}
					}
				});
			});
		}, __("Actions"));

		frm.page.add_inner_button(__("Notify Employees to Plan"), function() {
			frappe.confirm(__("Send in-app notification to all applicable employees in this cycle to create their Performance Plan?"), function() {
				frappe.call({
					method: "gdl_pms.gdl_pms.doctype.pms_appraisal_cycle.pms_appraisal_cycle.notify_cycle_employees",
					args: {
						cycle_name: frm.doc.name
					},
					freeze: true,
					freeze_message: __("Sending in-app notifications..."),
					callback: function(r) {
						if (r.message) {
							frappe.show_alert({
								message: __(r.message),
								indicator: "green"
							});
						}
					}
				});
			});
		}, __("Actions"));

		// HR Action to bulk activate Appraisal Phase (Self-Rating) for plans under this cycle
		if (!frm.is_new() && frm.doc.status !== "Draft" && frm.doc.status !== "Closed") {
			frm.page.add_inner_button(__("Activate Appraisal Phase"), function() {
				open_activate_appraisal_dialog(frm);
			}, __("Actions")).addClass("text-primary font-weight-bold");
		}

		if (!frm.is_new()) {
			frm.page.add_inner_button(__("Upload Evaluations to Employee Master"), function() {
				frappe.confirm(
					__("Upload/Sync all Finalized & Locked appraisals in this cycle into their respective Employee Masters?"),
					function() {
						frappe.call({
							method: "gdl_pms.gdl_pms.doctype.pms_appraisal_cycle.pms_appraisal_cycle.sync_cycle_evaluations_to_employee_master",
							args: { cycle_name: frm.doc.name },
							freeze: true,
							freeze_message: __("Uploading evaluations to Employee Masters..."),
							callback: function(r) {
								if (!r.exc && r.message) {
									frappe.msgprint({
										title: __("Employee Master Sync Result"),
										message: r.message.message || __("Sync completed."),
										indicator: r.message.synced_count > 0 ? "green" : "orange"
									});
								}
							}
						});
					}
				);
			}, __("Actions"));
		}

		// HR Quick Action Buttons to Open/Close Amendment Window
		if (!frm.doc.amendment_window_open) {
			frm.page.add_inner_button(__("Open Amendment Window"), function() {
				frm.set_value("amendment_window_open", 1).then(() => {
					frm.save().then(() => {
						frappe.show_alert({message: __("Amendment Window Opened for Employees."), indicator: "green"});
					});
				});
			}, __("Actions")).addClass("text-success font-weight-bold");
		} else {
			frm.page.add_inner_button(__("Close Amendment Window"), function() {
				frm.set_value("amendment_window_open", 0).then(() => {
					frm.save().then(() => {
						frappe.show_alert({message: __("Amendment Window Closed."), indicator: "red"});
					});
				});
			}, __("Actions")).addClass("text-danger font-weight-bold");
		}

		try {
			show_employee_hierarchy_section(frm);
			setup_cycle_grid_formatters(frm);
			toggle_plan_and_status_columns(frm);

			// Render employees and summary on refresh
			if (frm.is_new() || (!frm.doc.applicable_employees || !frm.doc.applicable_employees.length)) {
				fetch_and_render_employees(frm, true);
			} else {
				render_existing_summary(frm);
				toggle_plan_and_status_columns(frm);
			}
		} catch (e) {
			console.error("[GDL PMS] Cycle UI render error:", e);
		}
	},

	grade_group: function(frm) {
		if (!is_hr_admin_user()) return;
		// When creating or updating Grade Group, dynamically fetch and update employee list
		fetch_and_render_employees(frm, true);
	},

	calendar_year: function(frm) {
		sync_cycle_dates(frm, "calendar_year");
		if (is_hr_admin_user()) {
			fetch_and_render_employees(frm, true);
		}
	},

	start_date: function(frm) {
		sync_cycle_dates(frm, "start_date");
		if (is_hr_admin_user() && frm.doc.cycle_type === "Probation") {
			fetch_and_render_employees(frm, true);
		}
	},

	cycle_type: function(frm) {
		if (frm.doc.cycle_type === "Probation") {
			frm.set_df_property("start_date", "label", __("Start Date (Joining Date)"));
			if (frm.doc.end_date && frm.doc.end_date.endsWith("-12-31")) {
				frm.set_value("start_date", "");
				frm.set_value("end_date", "");
			}
		} else {
			frm.set_df_property("start_date", "label", __("Start Date"));
		}
		sync_cycle_dates(frm, "cycle_type");
		if (is_hr_admin_user()) {
			fetch_and_render_employees(frm, true);
		}
	},

	employee_submission_deadline: function(frm) {
		validate_plan_deadlines(frm);
	},

	supervisor_approval_deadline: function(frm) {
		validate_plan_deadlines(frm);
	},

	reviewer_approval_deadline: function(frm) {
		validate_plan_deadlines(frm);
	},

	self_scoring_start_date: function(frm) {
		validate_appraisal_deadlines(frm);
	},

	self_scoring_end_date: function(frm) {
		validate_appraisal_deadlines(frm);
	},

	supervisor_appraisal_end_date: function(frm) {
		validate_appraisal_deadlines(frm);
	},

	reviewer_appraisal_end_date: function(frm) {
		validate_appraisal_deadlines(frm);
	}
});

function parse_date_to_moment(val) {
	if (!val) return null;
	if (val instanceof Date) return moment(val);
	let str_val = String(val).trim();
	// Check for DD-MM-YYYY format
	if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(str_val)) {
		let parts = str_val.split("-");
		return moment(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`, "YYYY-MM-DD");
	}
	let m = moment(str_val, ["YYYY-MM-DD", "YYYY/MM/DD", "DD-MM-YYYY", "MM-DD-YYYY"]);
	if (!m.isValid()) {
		m = moment(str_val);
	}
	return m.isValid() ? m : null;
}

function calculate_3_months_end(start_date_val) {
	let m = parse_date_to_moment(start_date_val);
	if (!m) return "";
	return m.clone().add(3, "months").subtract(1, "days").format("YYYY-MM-DD");
}

function sync_cycle_dates(frm, source_field) {
	let cycle_type = frm.doc.cycle_type || "Annual";

	let year = frm.doc.calendar_year;
	if (!year && frm.doc.start_date) {
		let m = parse_date_to_moment(frm.doc.start_date);
		if (m && m.isValid()) {
			year = String(m.year());
			frm.set_value("calendar_year", year);
		}
	}

	if (cycle_type === "Probation") {
		if (frm.doc.start_date) {
			let end_d = calculate_3_months_end(frm.doc.start_date);
			if (end_d && frm.doc.end_date !== end_d) {
				frm.set_value("end_date", end_d);
				frappe.show_alert({
					message: __("Probation Cycle: End Date set to 3 months ({0})", [end_d]),
					indicator: "blue"
				});
			}
		}
	} else {
		// Annual and other cycle types:
		// Start Date is entered manually by the user (do not overwrite).
		// End Date is automatically set to 31st December of that calendar year.
		if (year) {
			let end_d = year + "-12-31";
			if (frm.doc.end_date !== end_d) {
				frm.set_value("end_date", end_d);
			}
		}
	}
}

function validate_plan_deadlines(frm) {
	if (frm.doc.employee_submission_deadline && frm.doc.supervisor_approval_deadline) {
		if (frm.doc.employee_submission_deadline > frm.doc.supervisor_approval_deadline) {
			frappe.msgprint({
				title: __("Validation Warning"),
				indicator: "orange",
				message: __("Employee End Date for Submission cannot be after Supervisor End Date for Approval.")
			});
		}
	}
	if (frm.doc.supervisor_approval_deadline && frm.doc.reviewer_approval_deadline) {
		if (frm.doc.supervisor_approval_deadline > frm.doc.reviewer_approval_deadline) {
			frappe.msgprint({
				title: __("Validation Warning"),
				indicator: "orange",
				message: __("Supervisor End Date for Approval cannot be after Reviewer End Date for Approval for Performance Plan.")
			});
		}
	}
}

function validate_appraisal_deadlines(frm) {
	if (frm.doc.self_scoring_start_date && frm.doc.self_scoring_end_date) {
		if (frm.doc.self_scoring_start_date > frm.doc.self_scoring_end_date) {
			frappe.msgprint({
				title: __("Validation Warning"),
				indicator: "orange",
				message: __("Self-Scoring Start Date cannot be after Employee End Date for Self-Scoring.")
			});
		}
	}
	if (frm.doc.self_scoring_end_date && frm.doc.supervisor_appraisal_end_date) {
		if (frm.doc.self_scoring_end_date > frm.doc.supervisor_appraisal_end_date) {
			frappe.msgprint({
				title: __("Validation Warning"),
				indicator: "orange",
				message: __("Employee End Date for Self-Scoring cannot be after Supervisor End Date for Appraisal Review.")
			});
		}
	}
	if (frm.doc.supervisor_appraisal_end_date && frm.doc.reviewer_appraisal_end_date) {
		if (frm.doc.supervisor_appraisal_end_date > frm.doc.reviewer_appraisal_end_date) {
			frappe.msgprint({
				title: __("Validation Warning"),
				indicator: "orange",
				message: __("Supervisor End Date for Appraisal Review cannot be after Reviewer End Date for Appraisal Review.")
			});
		}
	}
}

function fetch_and_render_employees(frm, populate_table) {
	if (!is_hr_admin_user()) return;
	if (frm._is_fetching_cycle_employees) return;
	frm._is_fetching_cycle_employees = true;

	var grade_group = frm.doc.grade_group || "All";
	var is_new_doc = frm.is_new() || !frm.doc.name || String(frm.doc.name).startsWith("new-");
	var cycle_name = is_new_doc ? null : frm.doc.name;
	var cycle_type = frm.doc.cycle_type || "Annual";
	var start_date = (cycle_type === "Probation" && frm.doc.start_date) ? frm.doc.start_date : null;

	frappe.call({
		method: "gdl_pms.gdl_pms.doctype.pms_appraisal_cycle.pms_appraisal_cycle.get_applicable_employees_list",
		args: {
			grade_group: grade_group,
			cycle_name: cycle_name,
			cycle_type: cycle_type,
			start_date: start_date
		},
		callback: function(r) {
			frm._is_fetching_cycle_employees = false;
			if (r && r.message) {
				var data = r.message;
				var employees = data.employees || [];
				var stats = data.stats || {};

				show_employee_hierarchy_section(frm);

				// Populate child table if requested or if new document or if empty
				if (populate_table || is_new_doc || !frm.doc.applicable_employees || !frm.doc.applicable_employees.length) {
					frm.clear_table("applicable_employees");
					employees.forEach(function(emp) {
						let row = frm.add_child("applicable_employees");
						row.employee = emp.employee;
						row.employee_name = emp.employee_name;
						row.date_of_joining = emp.date_of_joining || "";
						row.employment_type = emp.employment_type || (cycle_type === "Probation" ? "Probation" : "Full time employee");
						row.grade_group = emp.grade_group;
						row.department = emp.department;
						row.designation = emp.designation;
						row.supervisor = emp.supervisor;
						row.supervisor_name = emp.supervisor_name;
						row.reviewer = emp.reviewer;
						row.reviewer_name = emp.reviewer_name;
						row.performance_plan = emp.performance_plan || "";
						row.appraisal_status = emp.appraisal_status || "Not Created";
					});
					frm.refresh_field("applicable_employees");
					setup_cycle_grid_formatters(frm);
				}

				// Render Summary Card Banner with employee chips
				render_summary_banner(frm, stats, grade_group, cycle_type, employees);
				toggle_plan_and_status_columns(frm);
			}
		},
		error: function() {
			frm._is_fetching_cycle_employees = false;
		}
	});
}

function render_existing_summary(frm) {
	var employees = frm.doc.applicable_employees || [];
	if (!employees.length) {
		fetch_and_render_employees(frm, true);
		return;
	}

	var total = employees.length;
	var with_sup = 0;
	var with_rev = 0;
	var missing_list = [];
	var joining_date_groups = {};

	employees.forEach(function(row) {
		var has_sup = row.supervisor && row.supervisor_name !== "Not Assigned";
		var has_rev = row.reviewer && row.reviewer_name !== "Not Assigned";

		if (has_sup) with_sup++;
		if (has_rev) with_rev++;

		if (frm.doc.cycle_type === "Probation") {
			var jd = row.date_of_joining || "Not Specified";
			if (!joining_date_groups[jd]) joining_date_groups[jd] = [];
			joining_date_groups[jd].push({
				employee: row.employee,
				employee_name: row.employee_name,
				date_of_joining: row.date_of_joining
			});
		}

		if (!has_sup || !has_rev) {
			var reasons = [];
			if (!has_sup) reasons.push("Supervisor");
			if (!has_rev) reasons.push("Reviewer");
			missing_list.push({
				employee: row.employee,
				employee_name: row.employee_name,
				missing: reasons.join(", ")
			});
		}
	});

	var stats = {
		total: total,
		with_supervisor: with_sup,
		with_reviewer: with_rev,
		missing_supervisor: total - with_sup,
		missing_reviewer: total - with_rev,
		missing_any_count: missing_list.length,
		missing_hierarchy_list: missing_list,
		joining_date_groups: joining_date_groups
	};

	render_summary_banner(frm, stats, frm.doc.grade_group || "All", frm.doc.cycle_type || "Annual", employees);
}

function format_to_standard_date(val) {
	if (!val) return "";
	let str = String(val).trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
	if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(str)) {
		let parts = str.split("-");
		return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
	}
	let m = moment(str);
	if (m && m.isValid()) return m.format("YYYY-MM-DD");
	return str;
}

function select_probation_cohort(frm, target_date, emp_name) {
	if (!target_date) return;
	target_date = format_to_standard_date(target_date);
	let end_d = calculate_3_months_end(target_date);
	let year = String(target_date).split("-")[0];

	frm._is_fetching_cycle_employees = false;

	frm.set_value("calendar_year", year).then(() => {
		return frm.set_value("start_date", target_date);
	}).then(() => {
		if (end_d) {
			return frm.set_value("end_date", end_d);
		}
	}).then(() => {
		if (frm.is_new() || !frm.doc.cycle_name || frm.doc.cycle_name.includes("Cycle") || String(frm.doc.cycle_name).startsWith("new-")) {
			let formatted_d = frappe.datetime.str_to_user ? frappe.datetime.str_to_user(target_date) : target_date;
			frm.set_value("cycle_name", `Probation Cycle - ${formatted_d}`);
		}
		frm.refresh_fields(["calendar_year", "start_date", "end_date", "cycle_name"]);

		let msg = emp_name
			? __("Selected employee <b>{0}</b>! Cycle Start Date set to <b>{1}</b>, End Date set to <b>{2}</b>.", [emp_name, target_date, end_d])
			: __("Probation cohort selected! Start Date: <b>{0}</b>, End Date: <b>{1}</b>.", [target_date, end_d]);

		frappe.show_alert({
			message: msg,
			indicator: "green"
		});

		fetch_and_render_employees(frm, true);
	});
}

function render_summary_banner(frm, stats, grade_group, cycle_type, employees_list) {
	cycle_type = cycle_type || frm.doc.cycle_type || "Annual";
	grade_group = grade_group || frm.doc.grade_group || "All";
	var total = stats.total || 0;
	var with_sup = stats.with_supervisor || 0;
	var with_rev = stats.with_reviewer || 0;
	var missing_count = stats.missing_any_count || 0;
	var missing_list = stats.missing_hierarchy_list || [];
	var joining_date_groups = stats.joining_date_groups || {};

	var is_probation = cycle_type === "Probation";
	var type_badge = is_probation
		? `<span style="background: #fef3c7; color: #b45309; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; border: 1px solid #fcd34d;">Probation Cycle (Probation Employees Only)</span>`
		: `<span style="background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; border: 1px solid #bae6fd;">Annual Cycle (Full Time & Contract)</span>`;

	var probation_cohort_html = '';
	if (is_probation) {
		if (frm.doc.start_date) {
			let formatted_start = frappe.datetime.str_to_user ? frappe.datetime.str_to_user(frm.doc.start_date) : frm.doc.start_date;
			probation_cohort_html = `
				<div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 10px 14px; margin-top: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
					<div style="display: flex; align-items: center; gap: 8px;">
						<span style="font-size: 16px;">🎯</span>
						<div>
							<strong style="color: #166534; font-size: 13px;">Probation Cohort Selected:</strong>
							<span style="color: #15803d; font-size: 12px; margin-left: 4px;">
								Date of Joining: <b>${formatted_start}</b> (${total} probation employee(s) with this joining date)
							</span>
						</div>
					</div>
					<button type="button" class="btn btn-xs btn-default pms-btn-show-all-probation" style="border-radius: 6px; font-weight: 600; color: #374151; background: #ffffff; border: 1px solid #d1d5db;">
						<i class="fa fa-refresh" style="margin-right: 4px;"></i> Show All Probation Employees / Change Date
					</button>
				</div>
			`;
		} else {
			var emp_options = [];
			var date_pills = [];
			var all_group_dates = Object.keys(joining_date_groups).sort();

			all_group_dates.forEach(function(d) {
				if (d && d !== "Not Specified") {
					var count = joining_date_groups[d].length;
					var user_d = frappe.datetime.str_to_user ? frappe.datetime.str_to_user(d) : d;
					date_pills.push(`
						<button type="button" class="btn btn-xs btn-default pms-btn-pick-cohort" data-date="${d}" style="border-radius: 14px; font-weight: 600; background: #ffffff; border: 1px solid #cbd5e1; color: #1e293b; padding: 3px 10px; cursor: pointer;">
							📅 <b>${user_d}</b> <span style="background: #e2e8f0; color: #334155; padding: 1px 6px; border-radius: 10px; font-size: 10px; margin-left: 4px;">${count}</span>
						</button>
					`);
					joining_date_groups[d].forEach(function(emp) {
						emp_options.push(`
							<option value="${d}" data-emp="${emp.employee}">
								${frappe.utils.escape_html(emp.employee_name)} (${emp.employee}) — Joining Date: ${user_d} (${count} on same date)
							</option>
						`);
					});
				}
			});

			probation_cohort_html = `
				<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 14px; margin-top: 12px;">
					<div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
						<div style="display: flex; align-items: center; gap: 6px;">
							<span style="font-size: 16px;">ℹ️</span>
							<strong style="color: #b45309; font-size: 13px;">Probation Cycle Cohort Selection (Same Joining Date Required)</strong>
						</div>
						<span style="background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; border: 1px solid #fcd34d;">
							Select employee or joining date to create cycle
						</span>
					</div>
					<div style="font-size: 12px; color: #92400e; margin-bottom: 10px; line-height: 1.4;">
						Probation cycle can only be created for employees sharing the <b>exact same Date of Joining</b>. Showing all <b>${total}</b> probation employees below. Pick an employee or click a joining date cohort to filter:
					</div>
					<div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px;">
						<label style="font-size: 12px; font-weight: 600; color: #475569; margin: 0; white-space: nowrap;">Select Employee:</label>
						<select class="form-control input-sm pms-select-probation-emp" style="max-width: 440px; border-radius: 6px; font-size: 12px; background: #ffffff;">
							<option value="">-- Choose Employee to set Probation Cycle --</option>
							${emp_options.join('')}
						</select>
					</div>
					${date_pills.length ? `
					<div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
						<span style="font-size: 11px; font-weight: 600; color: #64748b;">Or quick-select cohort:</span>
						${date_pills.join('')}
					</div>` : ''}
				</div>
			`;
		}
	}

	var missing_alert_html = '';
	if (missing_count > 0) {
		var names_preview = missing_list.slice(0, 3).map(function(m) {
			return `${frappe.utils.escape_html(m.employee_name)} (Missing: ${m.missing})`;
		}).join("; ");

		if (missing_list.length > 3) {
			names_preview += ` +${missing_list.length - 3} more`;
		}

		missing_alert_html = `
			<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
				<div style="display: flex; align-items: center; gap: 8px;">
					<div>
						<strong style="color: #b45309; font-size: 13px;">Reporting Hierarchy Incomplete:</strong>
						<span style="color: #92400e; font-size: 12px; margin-left: 4px;">${names_preview}</span>
					</div>
				</div>
				<span style="background: #fef3c7; color: #b45309; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 12px; white-space: nowrap; border: 1px solid #fcd34d;">
					${missing_count} Action Needed
				</span>
			</div>
		`;
	} else if (total > 0) {
		missing_alert_html = `
			<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 8px 12px; margin-top: 10px; display: flex; align-items: center; gap: 8px;">
				<span style="font-size: 15px;">✅</span>
				<span style="color: #15803d; font-size: 12px; font-weight: 600;">All ${total} eligible employees have Supervisor & Reviewer assigned. Ready for appraisal rollout.</span>
			</div>
		`;
	}

	var employee_chips_html = '';
	if (employees_list && employees_list.length) {
		employee_chips_html = employees_list.map(function(e) {
			var emp_name = e.employee_name || e.employee;
			var emp_t = e.employment_type || (is_probation ? 'Probation' : 'Full time employee');
			var badge_color = emp_t === 'Probation' ? '#b45309' : (emp_t === 'Contract' ? '#6b21a8' : '#15803d');
			var badge_bg = emp_t === 'Probation' ? '#fef3c7' : (emp_t === 'Contract' ? '#f3e8ff' : '#dcfce7');
			var sup_text = e.supervisor_name && e.supervisor_name !== 'Not Assigned' ? ` • Sup: ${frappe.utils.escape_html(e.supervisor_name)}` : ' • <span style="color:#dc2626;">No Sup</span>';
			var jd_text = (is_probation && e.date_of_joining) ? ` • Joined: <b style="color:#0f172a;">${frappe.datetime.str_to_user ? frappe.datetime.str_to_user(e.date_of_joining) : e.date_of_joining}</b>` : '';
			return `
				<div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
					<span style="font-weight: 600; color: #1e293b;">${frappe.utils.escape_html(emp_name)}</span>
					<span style="background: ${badge_bg}; color: ${badge_color}; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px;">${emp_t}</span>
					${jd_text}
					<span style="color: #64748b; font-size: 10px;">${sup_text}</span>
				</div>
			`;
		}).join('');
	} else {
		employee_chips_html = `<span style="font-size: 12px; color: #94a3b8; font-style: italic;">No active employees found matching criteria.</span>`;
	}

	var html = `
		<div class="pms-cycle-emp-summary-box" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
			<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
				<div style="font-weight: 700; font-size: 14px; color: #0f172a; display: flex; align-items: center; gap: 6px;">
					<span></span> Cycle Coverage & Reporting Hierarchy
				</div>
				<div style="display: flex; gap: 8px; align-items: center;">
					${type_badge}
					<span style="background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px;">
						Grade Group: ${frappe.utils.escape_html(grade_group)}
					</span>
				</div>
			</div>
			<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
				<!-- Card 1 -->
				<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; border-left: 4px solid #15803d;">
					<div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Total Eligible</div>
					<div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 2px;">${total}</div>
					<div style="font-size: 11px; color: #15803d;">${is_probation ? "Probation Employees" : "Full Time & Contract"}</div>
				</div>
				<!-- Card 2 -->
				<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; border-left: 4px solid #2563eb;">
					<div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">With Supervisor</div>
					<div style="font-size: 22px; font-weight: 700; color: #1e40af; margin-top: 2px;">${with_sup} <span style="font-size: 13px; font-weight: 500; color: #64748b;">/ ${total}</span></div>
					<div style="font-size: 11px; color: #2563eb;">Supervisor Assigned</div>
				</div>
				<!-- Card 3 -->
				<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; border-left: 4px solid #7c3aed;">
					<div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">With Reviewer</div>
					<div style="font-size: 22px; font-weight: 700; color: #6b21a8; margin-top: 2px;">${with_rev} <span style="font-size: 13px; font-weight: 500; color: #64748b;">/ ${total}</span></div>
					<div style="font-size: 11px; color: #7c3aed;">Reviewer Assigned</div>
				</div>
			</div>
			${probation_cohort_html}
			${missing_alert_html}

			<!-- Eligible Employees Chips Preview -->
			<div style="margin-top: 14px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
				<div style="font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
					<span>${is_probation ? "Probation Employees Included in this Cycle" : "Full Time & Contract Employees Included in this Cycle"} (${total}):</span>
					<span style="font-size: 11px; color: #64748b; font-weight: normal;">(Edit reporting details in table below)</span>
				</div>
				<div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 120px; overflow-y: auto; padding: 4px 2px;">
					${employee_chips_html}
				</div>
			</div>
		</div>
	`;

	function set_banner_html() {
		frm.set_df_property("employee_summary_html", "options", html);
		let html_field = frm.get_field("employee_summary_html") || frm.fields_dict.employee_summary_html;
		if (html_field && html_field.$wrapper && html_field.$wrapper.length) {
			let $content = html_field.$wrapper.find(".control-value, .html-content");
			let $target = $content.length ? $content : html_field.$wrapper.find(".control-input");
			if (!$target.length) $target = html_field.$wrapper;
			$target.html(html);

			// Attach event handlers for probation cohort selection
			$target.off("click.probation_cohort").on("click.probation_cohort", ".pms-btn-pick-cohort", function(e) {
				e.preventDefault();
				let target_date = $(this).attr("data-date");
				if (target_date) {
					select_probation_cohort(frm, target_date);
				}
			});

			$target.off("change.probation_emp").on("change.probation_emp", ".pms-select-probation-emp", function(e) {
				let target_date = $(this).val();
				if (target_date) {
					select_probation_cohort(frm, target_date);
				}
			});

			$target.off("click.probation_reset").on("click.probation_reset", ".pms-btn-show-all-probation", function(e) {
				e.preventDefault();
				frm.set_value("start_date", "").then(() => {
					frm.set_value("end_date", "");
					fetch_and_render_employees(frm, true);
				});
			});

			return true;
		}
		return false;
	}

	if (!set_banner_html()) {
		setTimeout(set_banner_html, 100);
		setTimeout(set_banner_html, 300);
	}
	render_table_status_filter_bar(frm);
}

function render_table_status_filter_bar(frm) {
	let field = frm.fields_dict.applicable_employees;
	if (!field || (!field.$wrapper && !field.wrapper)) return;
	let $w = $(field.wrapper || field.$wrapper);
	$w.find(".pms-status-filter-toolbar").remove();

	let employees = frm.doc.applicable_employees || [];
	let counts = {
		All: employees.length,
		Draft: 0,
		Pending: 0,
		Approved: 0,
		Active: 0
	};

	employees.forEach(function(row) {
		let s = (row.appraisal_status || "").toLowerCase();
		if (s === "draft" || s.includes("not created") || s.includes("not activated")) counts.Draft++;
		else if (s.includes("pending") && !s.includes("assessment")) counts.Pending++;
		else if (s.includes("approved")) counts.Approved++;
		else if (s.includes("assessment") || s.includes("appraisal")) counts.Active++;
	});

	let filter_html = `
		<div class="pms-status-filter-toolbar" style="display: flex; gap: 6px; margin: 8px 0 12px 0; align-items: center; flex-wrap: wrap;">
			<span style="font-size: 12px; font-weight: 700; color: #475569; display: inline-flex; align-items: center; gap: 4px; margin-right: 4px;">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
				Filter Table by Status:
			</span>
			<button type="button" class="btn btn-xs btn-primary pms-status-filter-btn" data-status="All" style="border-radius: 6px; font-weight: 600;">All (${counts.All})</button>
			<button type="button" class="btn btn-xs btn-default pms-status-filter-btn" data-status="Draft" style="border-radius: 6px;">Draft (${counts.Draft})</button>
			<button type="button" class="btn btn-xs btn-default pms-status-filter-btn" data-status="Pending" style="border-radius: 6px;">Pending Approval (${counts.Pending})</button>
			<button type="button" class="btn btn-xs btn-default pms-status-filter-btn" data-status="Approved" style="border-radius: 6px;">Approved (${counts.Approved})</button>
			<button type="button" class="btn btn-xs btn-default pms-status-filter-btn" data-status="Active" style="border-radius: 6px;">Appraisal Open (${counts.Active})</button>
		</div>
	`;

	$w.find(".grid-header-row, .form-grid").first().before(filter_html);

	$w.find(".pms-status-filter-btn").on("click", function(e) {
		e.preventDefault();
		$w.find(".pms-status-filter-btn").removeClass("active btn-primary").addClass("btn-default");
		$(this).addClass("active btn-primary").removeClass("btn-default");
		let selected_status = $(this).attr("data-status");

		let grid = frm.fields_dict.applicable_employees ? frm.fields_dict.applicable_employees.grid : null;
		if (!grid || !grid.grid_rows) return;

		grid.grid_rows.forEach(function(row) {
			if (!row.doc) return;
			let s = (row.doc.appraisal_status || "").toLowerCase();
			let show = true;
			if (selected_status === "Draft") {
				show = s === "draft" || s.includes("not created") || s.includes("not activated");
			} else if (selected_status === "Pending") {
				show = s.includes("pending") && !s.includes("assessment");
			} else if (selected_status === "Approved") {
				show = s.includes("approved");
			} else if (selected_status === "Active") {
				show = s.includes("assessment") || s.includes("appraisal");
			}
			$(row.row).toggle(show);
		});
	});
}

function open_activate_appraisal_dialog(frm) {
	frappe.call({
		method: "gdl_pms.gdl_pms.doctype.pms_appraisal_cycle.pms_appraisal_cycle.get_cycle_plans_for_appraisal_activation",
		args: { cycle_name: frm.doc.name },
		freeze: true,
		freeze_message: __("Loading performance plans..."),
		callback: function(r) {
			if (!r || !r.message) return;
			let all_plans = r.message || [];
			if (!all_plans.length) {
				frappe.msgprint(__("No performance plans found under this cycle."));
				return;
			}

			let d = new frappe.ui.Dialog({
				title: __("Activate Appraisal Phase (Self-Rating)"),
				size: "large",
				fields: [
					{
						fieldtype: "Section Break",
						label: __("Filter Plans")
					},
					{
						fieldname: "status_filter",
						label: __("Filter by Status"),
						fieldtype: "Select",
						options: [
							"Eligible (Approved & Monitoring)",
							"All Plans",
							"Approved Plans Only",
							"Draft Plans",
							"Already Active (Appraisal Open)"
						],
						default: "Eligible (Approved & Monitoring)"
					},
					{
						fieldtype: "Column Break"
					},
					{
						fieldname: "grade_group_filter",
						label: __("Filter by Grade Group"),
						fieldtype: "Select",
						options: ["All", "PS_CS", "OS_ESP"],
						default: "All"
					},
					{
						fieldtype: "Section Break",
						label: __("Select Plans to Activate")
					},
					{
						fieldname: "plans_table_html",
						fieldtype: "HTML"
					}
				],
				primary_action_label: __("Activate Selected Plans"),
				primary_action: function() {
					let selected = [];
					d.$wrapper.find(".plan-select-chk:checked").each(function() {
						selected.push($(this).data("plan"));
					});

					if (!selected.length) {
						frappe.msgprint({
							title: __("No Plans Selected"),
							message: __("Please select at least one performance plan to activate."),
							indicator: "orange"
						});
						return;
					}

					frappe.confirm(
						__("Activate Appraisal Phase for <b>{0} selected plan(s)</b>?<br><br>This will map competencies and notify employees to submit self-ratings.", [selected.length]),
						function() {
							d.hide();
							frappe.call({
								method: "gdl_pms.gdl_pms.doctype.pms_appraisal_cycle.pms_appraisal_cycle.activate_cycle_appraisals",
								args: {
									cycle_name: frm.doc.name,
									selected_plans: selected
								},
								freeze: true,
								freeze_message: __("Activating Appraisal Phase..."),
								callback: function(res) {
									if (res && res.message) {
										frappe.msgprint({
											title: __("Appraisal Phase Activation"),
											indicator: res.message.activated_count > 0 ? "green" : "blue",
											message: __(res.message.message)
										});
										frm.reload_doc();
									}
								}
							});
						}
					);
				}
			});

			function render_plans_table() {
				let status_val = d.get_value("status_filter") || "Eligible (Approved & Monitoring)";
				let gg_val = d.get_value("grade_group_filter") || "All";

				let filtered = all_plans.filter(function(p) {
					if (gg_val !== "All" && p.grade_group !== gg_val) return false;
					if (status_val.includes("Eligible")) return p.is_eligible;
					if (status_val.includes("Approved")) return p.plan_status === "Approved";
					if (status_val.includes("Draft")) return p.plan_status === "Draft";
					if (status_val.includes("Already Active") || status_val.includes("Appraisal Open")) return p.is_already_active;
					return true;
				});

				let rows_html = "";
				if (!filtered.length) {
					rows_html = `<tr><td colspan="6" class="text-center text-muted" style="padding: 16px;">No plans matching current filter.</td></tr>`;
				} else {
					filtered.forEach(function(p) {
						let is_checked = p.is_eligible ? "checked" : "";
						let disabled = p.is_already_active ? "disabled" : "";
						let status_badge = `<span class="badge" style="background:#e0f2fe; color:#0369a1; padding:3px 6px;">${frappe.utils.escape_html(p.plan_status || 'Draft')}</span>`;
						if (p.plan_status === "Approved") {
							status_badge = `<span class="badge" style="background:#dcfce7; color:#15803d; padding:3px 6px;">Approved</span>`;
						}
						let app_status_badge = `<span class="badge" style="background:#f1f5f9; color:#475569; padding:3px 6px;">${frappe.utils.escape_html(p.appraisal_status || 'Not Activated')}</span>`;
						if (p.is_already_active) {
							app_status_badge = `<span class="badge" style="background:#e0e7ff; color:#4338ca; padding:3px 6px;">Active / In Progress</span>`;
						}

						rows_html += `
							<tr style="border-bottom: 1px solid #f1f5f9;">
								<td style="width: 40px; text-align: center; padding: 8px;">
									<input type="checkbox" class="plan-select-chk" data-plan="${frappe.utils.escape_html(p.name)}" ${is_checked} ${disabled}>
								</td>
								<td style="padding: 8px; font-weight: 600; color: #1e293b;">
									${frappe.utils.escape_html(p.employee_name || p.employee)}
									<div style="font-size: 11px; font-weight: normal; color: #64748b;">${frappe.utils.escape_html(p.name)} (${frappe.utils.escape_html(p.employee)})</div>
								</td>
								<td style="padding: 8px; font-size: 12px;">${frappe.utils.escape_html(p.grade_group || '-')}</td>
								<td style="padding: 8px;">${status_badge}</td>
								<td style="padding: 8px; font-size: 12px; color: #475569;">${frappe.utils.escape_html(p.workflow_state || '-')}</td>
								<td style="padding: 8px;">${app_status_badge}</td>
							</tr>
						`;
					});
				}

				let total_matching = filtered.length;
				let eligible_matching = filtered.filter(p => p.is_eligible).length;

				let html = `
					<div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
						<div style="font-size: 12px; color: #475569;">
							Showing <b>${total_matching}</b> plan(s) (${eligible_matching} eligible for activation)
						</div>
						<div>
							<button type="button" class="btn btn-xs btn-default btn-select-all" style="margin-right: 4px;">Select All</button>
							<button type="button" class="btn btn-xs btn-default btn-unselect-all">Unselect All</button>
						</div>
					</div>
					<div style="max-height: 320px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
						<table class="table table-condensed" style="margin: 0; font-size: 13px;">
							<thead style="background: #f8fafc; position: sticky; top: 0; z-index: 1;">
								<tr style="border-bottom: 2px solid #e2e8f0;">
									<th style="width: 40px; text-align: center;"><input type="checkbox" class="plan-master-chk"></th>
									<th>Employee</th>
									<th>Grade Group</th>
									<th>Plan Status</th>
									<th>Workflow State</th>
									<th>Appraisal Status</th>
								</tr>
							</thead>
							<tbody>
								${rows_html}
							</tbody>
						</table>
					</div>
				`;

				let $wrapper = d.fields_dict.plans_table_html.$wrapper;
				$wrapper.html(html);

				function update_counter() {
					let cnt = $wrapper.find(".plan-select-chk:checked").length;
					d.set_primary_action_label(__(`Activate Selected Plans (${cnt})`));
				}
				update_counter();

				$wrapper.find(".plan-master-chk").on("change", function() {
					let checked = $(this).is(":checked");
					$wrapper.find(".plan-select-chk:not(:disabled)").prop("checked", checked);
					update_counter();
				});

				$wrapper.find(".btn-select-all").on("click", function() {
					$wrapper.find(".plan-select-chk:not(:disabled)").prop("checked", true);
					$wrapper.find(".plan-master-chk").prop("checked", true);
					update_counter();
				});

				$wrapper.find(".btn-unselect-all").on("click", function() {
					$wrapper.find(".plan-select-chk:not(:disabled)").prop("checked", false);
					$wrapper.find(".plan-master-chk").prop("checked", false);
					update_counter();
				});

				$wrapper.find(".plan-select-chk").on("change", function() {
					update_counter();
				});
			}

			d.fields_dict.status_filter.$input.on("change", render_plans_table);
			d.fields_dict.grade_group_filter.$input.on("change", render_plans_table);

			d.show();
			render_plans_table();
		}
	});
}

function is_hr_admin_user() {
	if (frappe.session && (frappe.session.user === "Administrator" || frappe.session.user === "hr.admin@gdl.bt")) return true;
	var allowed_roles = ["PMS HR Admin", "Administrator"];
	return allowed_roles.some(function(r) {
		return (frappe.user && typeof frappe.user.has_role === "function" && frappe.user.has_role(r))
			|| (frappe.boot && frappe.boot.user && frappe.boot.user.roles && frappe.boot.user.roles.includes(r))
			|| (frappe.user_roles && frappe.user_roles.includes(r));
	});
}

function show_employee_hierarchy_section(frm) {
	frm.toggle_display("applicable_employees_section", true);
	frm.toggle_display("employee_summary_html", true);
	frm.toggle_display("applicable_employees", true);
	frm.set_df_property("applicable_employees_section", "hidden", 0);
	frm.set_df_property("employee_summary_html", "hidden", 0);
	frm.set_df_property("applicable_employees", "hidden", 0);
}

function hide_employee_hierarchy_section(frm) {
	frm.toggle_display("applicable_employees_section", false);
	frm.toggle_display("employee_summary_html", false);
	frm.toggle_display("applicable_employees", false);
	frm.set_df_property("applicable_employees_section", "hidden", 1);
	frm.set_df_property("employee_summary_html", "hidden", 1);
	frm.set_df_property("applicable_employees", "hidden", 1);
	if (frm.fields_dict.employee_summary_html && frm.fields_dict.employee_summary_html.$wrapper) {
		frm.fields_dict.employee_summary_html.$wrapper.empty();
	}
}

function setup_cycle_action_buttons(frm) {
	if (!is_hr_admin_user()) return;

	frm.set_df_property("status", "read_only", 1);

	// Update clean badge description on status field
	let status_val = frm.doc.status || "Draft";
	if (status_val === "Active") {
		frm.set_df_property("status", "description", `<span style="color: #15803d; font-weight: 600;"><i class="fa fa-circle" style="font-size: 8px;"></i> Live & Active Cycle</span>`);
	} else if (status_val === "Self-Rating Open") {
		frm.set_df_property("status", "description", `<span style="color: #2563eb; font-weight: 600;"><i class="fa fa-play-circle" style="font-size: 9px;"></i> Appraisal Phase Active (Self-Rating Open)</span>`);
	} else if (status_val === "Closed") {
		frm.set_df_property("status", "description", `<span style="color: #dc2626; font-weight: 600;"><i class="fa fa-lock" style="font-size: 9px;"></i> Cycle Closed</span>`);
	} else {
		frm.set_df_property("status", "description", `<span style="color: #64748b; font-weight: 600;"><i class="fa fa-circle-o" style="font-size: 8px;"></i> Draft (Click "Save & Activate Cycle" to publish)</span>`);
	}

	// Handle Closed Status
	if (frm.doc.status === "Closed") {
		frm.disable_form();
		if (frm.page && frm.page.clear_secondary_action) {
			frm.page.clear_secondary_action();
		}
		if (frm.page && frm.page.clear_primary_action) {
			frm.page.clear_primary_action();
		}
		frm.page.add_inner_button(__("Reopen Cycle"), function() {
			frappe.confirm(__("Reopen this Appraisal Cycle and set status back to Active?"), function() {
				frm.set_value("status", "Active").then(() => {
					frm.save().then(() => {
						frappe.show_alert({
							message: __("Appraisal Cycle reopened."),
							indicator: "green"
						});
					});
				});
			});
		}, __("Actions"));
		return;
	}

	// Handle New or Draft Status
	if (frm.is_new() || frm.doc.status === "Draft") {
		let primary_label = frm.is_new() ? __("Save & Activate Cycle") : __("Activate Cycle");

		frm.page.set_primary_action(primary_label, function() {
			save_and_activate_cycle(frm);
		}, "check");

		frm.page.set_secondary_action(__("Save as Draft"), function() {
			save_as_draft_cycle(frm);
		});
	} else if (frm.doc.status !== "Closed") {
		// Active, Self-Rating Open, or other active status
		frm.page.set_primary_action(__("Save"), function() {
			frm.save();
		});

		if (frm.page && frm.page.clear_secondary_action) {
			frm.page.clear_secondary_action();
		}

		frm.page.add_inner_button(__("Close Cycle"), function() {
			frappe.confirm(
				__("Are you sure you want to <b>Close</b> this Appraisal Cycle? Once closed, planning and amendments will no longer be available."),
				function() {
					frm.set_value("status", "Closed").then(() => {
						frm.save().then(() => {
							frappe.show_alert({
								message: __("Appraisal Cycle marked as Closed."),
								indicator: "red"
							});
						});
					});
				}
			);
		}, __("Actions")).addClass("text-danger font-weight-bold");
	}
}

function save_and_activate_cycle(frm) {
	if (!frm.doc.cycle_name || !frm.doc.cycle_name.trim()) {
		frappe.msgprint({
			title: __("Validation Required"),
			message: __("Please enter <b>Cycle Name</b> before activating."),
			indicator: "orange"
		});
		return;
	}
	if (!frm.doc.start_date || !frm.doc.end_date) {
		frappe.msgprint({
			title: __("Validation Required"),
			message: __("Please ensure <b>Start Date</b> and <b>End Date</b> are set."),
			indicator: "orange"
		});
		return;
	}

	frappe.confirm(
		__("Are you sure you want to <b>Activate and Launch</b> this Appraisal Cycle? Performance Plans will automatically be created in Draft for all eligible employees."),
		function() {
			frm.set_value("status", "Active").then(() => {
				frm.save().then(() => {
					frappe.show_alert({
						message: __("Appraisal Cycle activated and launched successfully!"),
						indicator: "green"
					});
				});
			});
		}
	);
}

function save_as_draft_cycle(frm) {
	if (!frm.doc.cycle_name || !frm.doc.cycle_name.trim()) {
		frappe.msgprint({
			title: __("Validation Required"),
			message: __("Please enter <b>Cycle Name</b> before saving."),
			indicator: "orange"
		});
		return;
	}
	frm.set_value("status", "Draft").then(() => {
		frm.save().then(() => {
			frappe.show_alert({
				message: __("Appraisal Cycle saved as Draft."),
				indicator: "blue"
			});
		});
	});
}

function setup_cycle_grid_formatters(frm) {
	let field = frm.fields_dict.applicable_employees;
	if (!field || !field.grid) return;

	let grid = field.grid;

	grid.formatters.date_of_joining = function(val, df, doc) {
		if (val) {
			let formatted = frappe.datetime.str_to_user ? frappe.datetime.str_to_user(val) : val;
			if (frm.doc.cycle_type === "Probation") {
				return `<span class="pms-pick-cohort-badge" data-date="${frappe.utils.escape_html(val)}" title="${__('Click to set cycle Start Date to this Joining Date')}" style="font-weight: 700; color: #1e40af; background: #eff6ff; border: 1px solid #bfdbfe; padding: 2px 8px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
					<i class="fa fa-calendar" style="font-size: 10px;"></i> ${frappe.utils.escape_html(formatted)}
				</span>`;
			}
			return `<span style="font-weight: 600; color: #0f172a;">${frappe.utils.escape_html(formatted)}</span>`;
		}
		return `<span class="text-muted" style="font-size: 11px;">-</span>`;
	};

	grid.formatters.performance_plan = function(val, df, doc) {
		if (val) {
			return `<a class="pms-plan-link text-primary" href="/app/pms-appraisal/${frappe.utils.escape_html(val)}" data-plan="${frappe.utils.escape_html(val)}" style="font-weight: 600; text-decoration: underline; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
				${frappe.utils.escape_html(val)}
			</a>`;
		}
		return `<span class="text-muted" style="font-size: 11px;">Not Created</span>`;
	};

	grid.formatters.appraisal_status = function(val, df, doc) {
		let status = val || "Not Created";
		let bg = "#f1f3f5";
		let color = "#495057";

		if (status === "Draft") {
			bg = "#e3f2fd";
			color = "#1976d2";
		} else if (status.includes("Pending") || status.includes("Submitted")) {
			bg = "#fff3e0";
			color = "#f57c00";
		} else if (status === "Approved") {
			bg = "#e8f5e9";
			color = "#2e7d32";
		} else if (status === "Rejected") {
			bg = "#ffebee";
			color = "#c62828";
		}

		let badge = `<span class="badge" style="background: ${bg}; color: ${color}; font-weight: 600; padding: 3px 7px; border-radius: 4px; font-size: 11px;">${frappe.utils.escape_html(status)}</span>`;

		if (doc && doc.performance_plan) {
			return `<a class="pms-plan-link" href="/app/pms-appraisal/${frappe.utils.escape_html(doc.performance_plan)}" data-plan="${frappe.utils.escape_html(doc.performance_plan)}" style="cursor: pointer; text-decoration: none;">${badge}</a>`;
		}
		return badge;
	};

	let $w = $(field.wrapper || field.$wrapper);
	if ($w.length && !field._plan_link_attached) {
		field._plan_link_attached = true;
		$w.on("click", ".pms-plan-link", function(e) {
			e.preventDefault();
			e.stopPropagation();
			let plan = $(this).attr("data-plan");
			if (plan) {
				frappe.set_route("Form", "PMS Appraisal", plan);
			}
		});
	}

	attach_probation_grid_listeners();
	toggle_plan_and_status_columns(frm);
}

function attach_probation_grid_listeners() {
	if (window._pms_probation_listeners_attached) return;
	window._pms_probation_listeners_attached = true;

	// 1. Checkbox click / change on grid row
	$(document).off("click.probation_check change.probation_check", ".grid-row-check").on("click.probation_check change.probation_check", ".grid-row-check", function(e) {
		let frm = cur_frm;
		if (!frm || frm.doctype !== "PMS Appraisal Cycle" || frm.doc.cycle_type !== "Probation") return;

		let $check = $(this);
		setTimeout(() => {
			if (!$check.is(":checked")) return;

			let $row = $check.closest(".grid-row");
			let docname = $check.attr("data-name") || $row.attr("data-name");
			let row_doc = (frm.doc.applicable_employees || []).find(r => r.name === docname);

			if (!row_doc) {
				let idx_str = $row.attr("data-idx");
				let idx = idx_str ? (parseInt(idx_str, 10) - 1) : $row.index();
				if (frm.doc.applicable_employees && frm.doc.applicable_employees[idx]) {
					row_doc = frm.doc.applicable_employees[idx];
				}
			}

			if (row_doc && row_doc.date_of_joining) {
				select_probation_cohort(frm, row_doc.date_of_joining, row_doc.employee_name);
			}
		}, 30);
	});

	// 2. Joining date pill button click in table
	$(document).off("click.probation_badge", ".pms-pick-cohort-badge").on("click.probation_badge", ".pms-pick-cohort-badge", function(e) {
		e.preventDefault();
		e.stopPropagation();
		let frm = cur_frm;
		if (!frm || frm.doctype !== "PMS Appraisal Cycle" || frm.doc.cycle_type !== "Probation") return;
		let target_date = $(this).attr("data-date");
		let $row = $(this).closest(".grid-row");
		let docname = $row.attr("data-name");
		let row_doc = (frm.doc.applicable_employees || []).find(r => r.name === docname);
		let emp_name = row_doc ? row_doc.employee_name : "";
		if (target_date) {
			select_probation_cohort(frm, target_date, emp_name);
		}
	});

	// 3. Row click anywhere in Probation cycle table
	$(document).off("click.probation_row", ".grid-body .grid-row").on("click.probation_row", ".grid-body .grid-row", function(e) {
		let frm = cur_frm;
		if (!frm || frm.doctype !== "PMS Appraisal Cycle" || frm.doc.cycle_type !== "Probation") return;
		if ($(e.target).closest(".grid-row-check, .btn-open-row, input, a, button, select").length) return;

		let $row = $(this);
		let docname = $row.attr("data-name");
		let row_doc = (frm.doc.applicable_employees || []).find(r => r.name === docname);

		if (!row_doc) {
			let idx_str = $row.attr("data-idx");
			let idx = idx_str ? (parseInt(idx_str, 10) - 1) : $row.index();
			if (frm.doc.applicable_employees && frm.doc.applicable_employees[idx]) {
				row_doc = frm.doc.applicable_employees[idx];
			}
		}

		if (row_doc && row_doc.date_of_joining) {
			select_probation_cohort(frm, row_doc.date_of_joining, row_doc.employee_name);
		}
	});
}

function toggle_plan_and_status_columns(frm) {
	let is_activated = Boolean(!frm.is_new() && frm.doc.status && frm.doc.status !== "Draft");
	let field = frm.fields_dict.applicable_employees;
	if (!field) return;

	// 1. Grid docfields visibility
	if (field.grid && field.grid.docfields) {
		let fields_to_toggle = ["performance_plan", "appraisal_status"];
		let changed = false;
		fields_to_toggle.forEach(function(fname) {
			let df = field.grid.docfields.find(d => d.fieldname === fname);
			if (df) {
				let target_in_list = is_activated ? 1 : 0;
				let target_hidden = is_activated ? 0 : 1;
				if (df.in_list_view !== target_in_list || df.hidden !== target_hidden) {
					df.in_list_view = target_in_list;
					df.hidden = target_hidden;
					changed = true;
				}
			}
		});
		if (changed) {
			field.grid.visible_columns = null;
			if (field.grid.setup_visible_columns) {
				field.grid.setup_visible_columns();
			}
		}
	}

	// 2. DOM / CSS toggle
	let $w = $(field.wrapper || field.$wrapper);
	if ($w.length) {
		if (!is_activated) {
			$w.addClass("gdl-pms-draft-cycle");
		} else {
			$w.removeClass("gdl-pms-draft-cycle");
		}
	}
	if (frm.page && frm.page.wrapper) {
		if (!is_activated) {
			frm.page.wrapper.addClass("gdl-pms-draft-cycle");
		} else {
			frm.page.wrapper.removeClass("gdl-pms-draft-cycle");
		}
	}
}

frappe.ui.form.on("PMS Appraisal Cycle Employee", {
	employee: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row && row.employee) {
			frappe.db.get_value("Employee", row.employee, ["employee_name", "date_of_joining", "employment_type", "grade_group", "department", "designation", "reports_to", "reviewer"], function(val) {
				if (val) {
					frappe.model.set_value(cdt, cdn, "employee_name", val.employee_name || "");
					frappe.model.set_value(cdt, cdn, "date_of_joining", val.date_of_joining || "");
					frappe.model.set_value(cdt, cdn, "employment_type", val.employment_type || (frm.doc.cycle_type === "Probation" ? "Probation" : "Full time employee"));
					frappe.model.set_value(cdt, cdn, "grade_group", val.grade_group || "");
					frappe.model.set_value(cdt, cdn, "department", val.department || "");
					frappe.model.set_value(cdt, cdn, "designation", val.designation || "");
					frappe.model.set_value(cdt, cdn, "supervisor", val.reports_to || "");
					frappe.model.set_value(cdt, cdn, "reviewer", val.reviewer || "");
					if (val.reports_to) {
						frappe.db.get_value("Employee", val.reports_to, "employee_name", function(s) {
							if (s && s.employee_name) frappe.model.set_value(cdt, cdn, "supervisor_name", s.employee_name);
						});
					}
					if (val.reviewer) {
						frappe.db.get_value("Employee", val.reviewer, "employee_name", function(r) {
							if (r && r.employee_name) frappe.model.set_value(cdt, cdn, "reviewer_name", r.employee_name);
						});
					}
					if (frm.doc.cycle_type === "Probation" && frm.doc.start_date && val.date_of_joining && val.date_of_joining !== frm.doc.start_date) {
						frappe.msgprint({
							title: __("Joining Date Mismatch"),
							indicator: "orange",
							message: __("Selected employee <b>{0}</b> has Joining Date <b>{1}</b>, which does not match Cycle Start Date <b>{2}</b>. Probation cycles require all employees to have the same Joining Date.", [val.employee_name, val.date_of_joining, frm.doc.start_date])
						});
					}
				}
			});
		}
	},
	form_render: function(frm, cdt, cdn) {
		toggle_plan_and_status_columns(frm);
	}
});

function load_grade_group_options(frm) {
	frappe.db.get_list('PMS Grade Group', { pluck: 'name', order_by: 'name asc' }).then(groups => {
		let opts = ['All'];
		if (groups && groups.length > 0) {
			opts = opts.concat(groups);
		} else {
			opts = ['All', 'PS_CS', 'OS_ESP'];
		}
		frm.set_df_property('grade_group', 'options', opts);
	});
}

attach_probation_grid_listeners();
