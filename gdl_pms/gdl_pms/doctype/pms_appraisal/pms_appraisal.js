function update_grade_group_display(frm, emp_info) {
	let grade = frm.doc.grade_group || (emp_info && emp_info.grade_group) || "";
	if (!grade && !frm.doc.employee && !frm.is_new()) {
		frm.dashboard.clear_headline();
		return;
	}

	let is_ps = (grade === "PS_CS");
	let is_os = (grade === "OS_ESP");
	let code = is_ps ? "PS" : (is_os ? "OS" : (grade || "OS"));
	let cat_title = is_ps ? "Professional Staff" : (is_os ? "Operating Staff" : (grade || "Operating Staff"));
	let grade_label = is_ps ? "PS_CS" : (is_os ? "OS_ESP" : grade);
	let boot_w = frappe.boot && frappe.boot.pms_competencies_data && frappe.boot.pms_competencies_data.weights;
	let target_wt = (boot_w && boot_w[grade]) ? boot_w[grade].work : (is_ps ? 60 : 50);
	let comp_wt = (boot_w && boot_w[grade]) ? boot_w[grade].competency : (is_ps ? 40 : 50);

	// In Performance Plan mode, ensure grade_group is hidden from form body
	if (!frm._is_appraisal_mode) {
		frm.set_df_property("grade_group", "hidden", 1);
	}

	frm.set_df_property(
		"targets",
		"description",
		__("For <b>{0}</b> category, total Target Weights must sum to exactly <b>{1}%</b>.", [code, target_wt])
	);

	// Fetch designation if missing
	if (frm.doc.employee && !frm._emp_designation && !frm._fetching_emp_desig) {
		frm._fetching_emp_desig = true;
		frappe.call({
			method: "frappe.client.get_value",
			args: {
				doctype: "Employee",
				fieldname: ["designation", "department"],
				filters: { name: frm.doc.employee }
			},
			callback: function(r) {
				frm._fetching_emp_desig = false;
				if (r && r.message) {
					frm._emp_designation = r.message.designation || "";
					frm._emp_department = r.message.department || "";
					if (!frm._is_appraisal_mode) {
						update_grade_group_display(frm);
					}
				}
			}
		});
	}

	let emp_id = frm.doc.employee || (emp_info && emp_info.name) || "";
	let emp_name = frm.doc.employee_name || (emp_info && emp_info.employee_name) || "Employee";
	let designation = frm._emp_designation || (emp_info && emp_info.designation) || "";

	let sup_name = frm.doc.supervisor_name || (emp_info && emp_info.supervisor_name) || frm._emp_supervisor_name || "";
	let sup_id = frm.doc.supervisor_snapshot || (emp_info && emp_info.reports_to) || "";

	let rev_name = frm.doc.reviewer_name || (emp_info && emp_info.reviewer_name) || frm._emp_reviewer_name || "";
	let rev_id = frm.doc.reviewer_snapshot || (emp_info && emp_info.reviewer) || "";

	let sup2_name = frm.doc.supervisor_2_name || (emp_info && emp_info.supervisor_2_name) || frm._emp_supervisor_2_name || "";
	let sup2_id = frm.doc.supervisor_2_snapshot || (emp_info && emp_info.supervisor_2) || "";

	// Resolve reporting line names dynamically if IDs exist but names are pending
	if (sup_id && !sup_name && !frm._resolving_sup) {
		frm._resolving_sup = true;
		frappe.db.get_value("Employee", sup_id, "employee_name", (r) => {
			frm._resolving_sup = false;
			if (r && r.employee_name) {
				frm.doc.supervisor_name = r.employee_name;
				frm._emp_supervisor_name = r.employee_name;
				update_grade_group_display(frm);
			}
		});
	}
	if (rev_id && !rev_name && !frm._resolving_rev) {
		frm._resolving_rev = true;
		frappe.db.get_value("Employee", rev_id, "employee_name", (r) => {
			frm._resolving_rev = false;
			if (r && r.employee_name) {
				frm.doc.reviewer_name = r.employee_name;
				frm._emp_reviewer_name = r.employee_name;
				update_grade_group_display(frm);
			}
		});
	}
	if (sup2_id && !sup2_name && !frm._resolving_sup2) {
		frm._resolving_sup2 = true;
		frappe.db.get_value("Employee", sup2_id, "employee_name", (r) => {
			frm._resolving_sup2 = false;
			if (r && r.employee_name) {
				frm.doc.supervisor_2_name = r.employee_name;
				frm._emp_supervisor_2_name = r.employee_name;
				update_grade_group_display(frm);
			}
		});
	}

	let sup_display = sup_name || (sup_id ? sup_id : __("Not Assigned"));
	let rev_display = rev_name || (rev_id ? rev_id : __("Not Assigned"));
	let sup2_display = sup2_name || (sup2_id ? sup2_id : __("Not Assigned"));

	let cycle_name = frm.doc.cycle || "";
	let cycle_display = cycle_name || (frm.is_new() ? __("Select Cycle...") : __("Appraisal Cycle"));
	let cycle_interactive = frm.is_new() ? "pms-hero-cycle-interactive" : "";

	let plan_status = frm.doc.plan_status || (frm.is_new() ? "Draft" : "Draft");
	if (plan_status === "Returned" || plan_status === "Rejected") {
		plan_status = (frm.doc.revised_by_role === "Reviewer") ? "Returned by Reviewer" : "Returned by Supervisor";
	} else if (plan_status === "Approved") {
		if (frm.doc.locked || frm.doc.appraisal_status === "Finalized & Locked" || frm.doc.workflow_state === "Appraisal Completed") {
			plan_status = "Finalized & Locked";
		} else if (frm.doc.workflow_state === "Appraisal Open" || (frm.doc.appraisal_status && frm.doc.appraisal_status !== "Not Activated")) {
			plan_status = "Appraisal Open";
		} else if (frm.doc.amendment_window_open) {
			plan_status = "Amendment In Progress";
		}
	}

	// Status slug for color coding
	let status_slug = "draft";
	if (plan_status === "Approved") status_slug = "approved";
	else if (plan_status === "Finalized & Locked") status_slug = "locked";
	else if (plan_status === "Appraisal Open") status_slug = "appraisal-open";
	else if (plan_status === "Amendment In Progress") status_slug = "amendment";
	else if (plan_status === "Pending Supervisor Approval") status_slug = "pending-sup";
	else if (plan_status === "Returned by Supervisor") status_slug = "returned-sup";
	else if (plan_status === "Pending Reviewer Approval") status_slug = "pending-rev";
	else if (plan_status === "Returned by Reviewer") status_slug = "returned-rev";
	else if (plan_status === "Returned") status_slug = "returned-sup";
	else if (plan_status === "Rejected") status_slug = "returned-rev";
	else if (plan_status === "Monitoring") status_slug = "approved";

	let grade_class = is_ps ? "grade-ps" : "grade-os";

	// Supervisor 2 row (conditional)
	let sup2_html = "";
	if (sup2_id || sup2_name) {
		sup2_html = `
			<div class="pms-hero-rep-item">
				<span class="pms-hero-rep-tag">Supervisor 2</span>
				<div class="pms-hero-rep-content">
					<span class="pms-hero-rep-name">${frappe.utils.escape_html(sup2_display)}</span>
					${sup2_id && sup2_name ? `<span class="pms-hero-rep-code">(${frappe.utils.escape_html(sup2_id)})</span>` : ''}
				</div>
			</div>
		`;
	}

	// Alert message for returned / rejected plans (integrated cleanly into headline)
	let alert_html = "";
	if (frm.doc.plan_revision_remark) {
		let changes_html = "";
		if (frm.doc.plan_revision_changes) {
			let lines = frm.doc.plan_revision_changes.split("\n").filter(l => l.trim().length > 0);
			if (lines.length > 0) {
				changes_html = `
					<div class="pms-hero-changes-box" style="margin-top: 8px; padding: 8px 12px; background: rgba(255, 255, 255, 0.75); border-radius: 6px; border: 1px solid #fcd34d;">
						<div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #92400e; margin-bottom: 4px;">
							<i class="fa fa-list-ul"></i> Modifications Made by ${frappe.utils.escape_html(frm.doc.revised_by_role || 'Supervisor')}:
						</div>
						<ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #78350f;">
							${lines.map(line => `<li>${frappe.utils.escape_html(line.replace(/^[•\-\*]\s*/, ''))}</li>`).join("")}
						</ul>
					</div>
				`;
			}
		}

		alert_html = `
			<div class="pms-hero-alert pms-alert-warning" style="display: block;">
				<div style="display: flex; align-items: flex-start; gap: 8px;">
					<i class="fa fa-pencil-square-o" style="margin-top: 3px; font-size: 16px; color: #b45309;"></i>
					<div style="flex: 1;">
						<div><b>Plan Returned with Modifications by ${frappe.utils.escape_html(frm.doc.revised_by_role || 'Supervisor/Reviewer')}:</b> <i>"${frappe.utils.escape_html(frm.doc.plan_revision_remark)}"</i></div>
						${changes_html}
						<div style="margin-top: 6px; font-size: 11.5px; color: #92400e;">
							Please review the updated targets and weightages below. Make any adjustments if needed, then click <b>Send for Approval</b>.
						</div>
					</div>
				</div>
			</div>
		`;
	} else if ((frm.doc.plan_status === "Rejected" || frm.doc.plan_status === "Returned" || frm.doc.plan_status === "Returned by Supervisor" || frm.doc.plan_status === "Returned by Reviewer") && (frm.doc.plan_rejection_remark || frm.doc.plan_revision_remark)) {
		let return_remark = frm.doc.plan_rejection_remark || frm.doc.plan_revision_remark;
		let return_title = frm.doc.plan_status;
		if (return_title === "Returned" || return_title === "Rejected") {
			return_title = (frm.doc.revised_by_role === "Reviewer") ? "Returned by Reviewer" : "Returned by Supervisor";
		}
		alert_html = `
			<div class="pms-hero-alert pms-alert-danger">
				<i class="fa fa-undo" style="margin-right: 6px; margin-top: 2px;"></i>
				<span><b>Plan ${frappe.utils.escape_html(return_title)}:</b> Return Remark: <i>"${frappe.utils.escape_html(return_remark)}"</i>. Please review remarks, make necessary adjustments, and click <b>Send for Approval</b>.</span>
			</div>
		`;
	}

	frm.dashboard.clear_headline();
	frm.dashboard.set_headline(`
		<div class="pms-hero-card-container">
			<div class="pms-hero-card">
				<!-- Left Section: Employee Information (NO AVATARS) -->
				<div class="pms-hero-col pms-hero-col-left">
					<div class="pms-hero-emp-name" title="${frappe.utils.escape_html(emp_name)}">${frappe.utils.escape_html(emp_name)}</div>
					<div class="pms-hero-emp-sub">
						${emp_id ? `<span class="pms-hero-id-pill">${frappe.utils.escape_html(emp_id)}</span>` : ''}
						${designation ? `<span class="pms-hero-sep">&bull;</span><span class="pms-hero-desig">${frappe.utils.escape_html(designation)}</span>` : ''}
					</div>
					<div class="pms-hero-badge-wrap">
						<span class="pms-hero-grade-badge ${grade_class}">
							<span class="pms-hero-badge-dot"></span>
							<span>${frappe.utils.escape_html(grade_label || 'OS_ESP')} &bull; ${frappe.utils.escape_html(cat_title)}</span>
						</span>
					</div>
				</div>

				<!-- Middle Section: Reporting Line (NO AVATARS) -->
				<div class="pms-hero-col pms-hero-col-mid">
					<div class="pms-hero-col-title">Reporting Line</div>
					<div class="pms-hero-rep-item">
						<span class="pms-hero-rep-tag">Supervisor</span>
						<div class="pms-hero-rep-content">
							<span class="pms-hero-rep-name">${frappe.utils.escape_html(sup_display)}</span>
							${sup_id && sup_name ? `<span class="pms-hero-rep-code">(${frappe.utils.escape_html(sup_id)})</span>` : ''}
						</div>
					</div>
					<div class="pms-hero-rep-item">
						<span class="pms-hero-rep-tag">Reviewer</span>
						<div class="pms-hero-rep-content">
							<span class="pms-hero-rep-name">${frappe.utils.escape_html(rev_display)}</span>
							${rev_id && rev_name ? `<span class="pms-hero-rep-code">(${frappe.utils.escape_html(rev_id)})</span>` : ''}
						</div>
					</div>
					${sup2_html}
				</div>

				<!-- Right Section: Cycle, Status & Weight Distribution -->
				<div class="pms-hero-col pms-hero-col-right">
					<div class="pms-hero-meta-row">
						<div class="pms-hero-cycle-badge ${cycle_interactive}" title="${frm.is_new() ? __('Click to select Appraisal Cycle') : 'Appraisal Cycle: ' + frappe.utils.escape_html(cycle_name)}">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
							<span>${frappe.utils.escape_html(cycle_display)}</span>
							${frm.is_new() ? `<i class="fa fa-caret-down" style="font-size: 10px; margin-left: 3px; opacity: 0.7;"></i>` : ''}
						</div>
						<span class="pms-hero-status-pill status-${status_slug}">
							<span class="pms-status-dot"></span>
							<span>${frappe.utils.escape_html(plan_status)}</span>
						</span>
					</div>

					<div class="pms-hero-weight-container">
						<div class="pms-hero-weight-header">
							<span class="pms-weight-target-text"><span class="pms-weight-color-dot dot-blue"></span> Targets: <b>${target_wt}%</b></span>
							<span class="pms-weight-comp-text"><span class="pms-weight-color-dot dot-purple"></span> Competencies: <b>${comp_wt}%</b></span>
						</div>
						<div class="pms-hero-weight-bar">
							<div class="pms-weight-segment seg-target" style="width: ${target_wt}%;" title="Targets Weight: ${target_wt}%"></div>
							<div class="pms-weight-segment seg-comp" style="width: ${comp_wt}%;" title="Competencies Weight: ${comp_wt}%"></div>
						</div>
					</div>
				</div>
			</div>
			${alert_html}
		</div>
	`, "white", true);

	if (frm.layout && frm.layout.message) {
		frm.layout.message.find('.pms-hero-card').closest('.form-message').addClass('pms-hero-msg-wrapper');
	}

	if (frm.is_new()) {
		$(frm.dashboard.wrapper).off('click', '.pms-hero-cycle-interactive').on('click', '.pms-hero-cycle-interactive', function() {
			frm.scroll_to_field("cycle");
			let f = frm.get_field("cycle");
			if (f && f.$input) f.$input.focus();
		});
	}

	if (frm.layout && frm.layout.message) {
		frm.layout.message.find('.pms-hero-card').closest('.form-message').addClass('pms-hero-msg-wrapper');
	}
}

function get_table_scores(frm) {
	let app_status = frm.doc.appraisal_status || "Self-Assessment Pending";
	let is_self_stage = (app_status === "Self-Assessment Pending");
	let show_super = (!is_self_stage);
	let show_rev = (
		app_status.includes("Reviewer") ||
		app_status.includes("PERC") ||
		app_status === "Appraisal Accepted" ||
		app_status === "Finalized & Locked" ||
		frm.doc.dispute_flag == 1
	);

	let targets = frm.doc.targets || [];
	let comps = frm.doc.competencies || [];

	// Target totals
	let target_weight = 0;
	let self_target_score = 0;
	let sup_target_score = 0;
	let rev_target_score = 0;

	targets.forEach(t => {
		target_weight += flt(t.weight || 0);
		self_target_score += flt(t.self_score || 0);
		sup_target_score += flt(t.supervisor_score || 0);
		rev_target_score += (t.reviewer_score != null && t.reviewer_score !== "" && flt(t.reviewer_score) > 0)
			? flt(t.reviewer_score)
			: flt(t.supervisor_score || 0);
	});

	// Competency totals
	let comp_weight = 0;
	let self_comp_score = 0;
	let sup_comp_score = 0;
	let rev_comp_score = 0;

	comps.forEach(c => {
		comp_weight += flt(c.weight || 0);
		self_comp_score += flt(c.self_rating || 0);
		sup_comp_score += flt(c.supervisor_rating || 0);
		rev_comp_score += (c.reviewer_rating != null && c.reviewer_rating !== "" && flt(c.reviewer_rating) > 0)
			? flt(c.reviewer_rating)
			: flt(c.supervisor_rating || 0);
	});

	if (target_weight === 0 && comp_weight === 0) {
		let boot_w = frappe.boot && frappe.boot.pms_competencies_data && frappe.boot.pms_competencies_data.weights;
		let grade = frm.doc.grade_group;
		target_weight = (boot_w && boot_w[grade]) ? boot_w[grade].work : (grade === "PS_CS" ? 60 : 50);
		comp_weight = (boot_w && boot_w[grade]) ? boot_w[grade].competency : (grade === "PS_CS" ? 40 : 50);
	}

	target_weight = flt(target_weight, 2);
	self_target_score = flt(self_target_score, 2);
	sup_target_score = flt(sup_target_score, 2);
	rev_target_score = flt(rev_target_score, 2);

	comp_weight = flt(comp_weight, 2);
	self_comp_score = flt(self_comp_score, 2);
	sup_comp_score = flt(sup_comp_score, 2);
	rev_comp_score = flt(rev_comp_score, 2);

	let active_target_score = show_rev ? rev_target_score : (show_super ? sup_target_score : self_target_score);
	let active_comp_score = show_rev ? rev_comp_score : (show_super ? sup_comp_score : self_comp_score);
	let total_score = flt(active_target_score + active_comp_score, 2);

	let band = "Unrated";
	if (total_score >= 90) band = "Outstanding Performance";
	else if (total_score >= 80) band = "Exceeds Expectations";
	else if (total_score >= 70) band = "Meets Expectations";
	else if (total_score >= 60) band = "Needs Improvement";
	else if (total_score > 0 || app_status !== "Self-Assessment Pending") band = "Unsatisfactory Performance";

	return {
		show_super: show_super,
		show_rev: show_rev,

		target_weight: target_weight,
		self_target_score: self_target_score,
		sup_target_score: sup_target_score,
		rev_target_score: rev_target_score,

		comp_weight: comp_weight,
		self_comp_score: self_comp_score,
		sup_comp_score: sup_comp_score,
		rev_comp_score: rev_comp_score,

		active_target_score: active_target_score,
		active_comp_score: active_comp_score,
		total_score: total_score,
		band: band
	};
}

function render_table_score_footers(frm) {
	// Remove legacy container above targets if exists
	$('.pms-appraisal-score-line-container').remove();

	if (!frm._is_appraisal_mode) {
		$('.pms-targets-score-footer, .pms-competencies-score-footer').remove();
		return;
	}

	let ts = get_table_scores(frm);

	// 1. Targets Table Footer
	if (frm.fields_dict["targets"] && frm.fields_dict["targets"].$wrapper) {
		let target_wrapper = frm.fields_dict["targets"].$wrapper;
		let target_grid = target_wrapper.find('.form-grid');
		let target_footer = target_wrapper.find('.pms-targets-score-footer');
		if (!target_footer.length) {
			target_footer = $('<div class="pms-table-score-footer pms-targets-score-footer"></div>');
			if (target_grid.length) target_grid.after(target_footer);
			else target_wrapper.append(target_footer);
		}

		let targets_html = `
			<div class="pms-footer-bar" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: #f8fafc; border: 1px solid #d1d5db; border-top: 2px solid #94a3b8; border-radius: 0 0 8px 8px; padding: 10px 14px; margin-top: -1px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
				<div class="pms-footer-title" style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">
					<span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; background: #e0f2fe; color: #0284c7;">
						<i class="fa fa-bullseye" style="font-size: 13px;"></i>
					</span>
					<span>Total Targets Score</span>
				</div>
				<div class="pms-footer-badges" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
					<div class="pms-footer-chip chip-weight" style="display: inline-flex; align-items: center; gap: 5px; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 5px 11px; border-radius: 18px; font-size: 12.5px; font-weight: 600; color: #475569;">
						<span style="opacity: 0.85;">Total Weight:</span>
						<strong style="color: #0f172a; font-size: 13.5px;">${flt(ts.target_weight, 2).toFixed(2)}</strong>
					</div>
					<div class="pms-footer-chip chip-self" style="display: inline-flex; align-items: center; gap: 5px; background: #eff6ff; border: 1px solid #bfdbfe; padding: 5px 12px; border-radius: 18px; font-size: 12.5px; font-weight: 600; color: #1d4ed8;">
						<i class="fa fa-user" style="font-size: 11px; opacity: 0.8;"></i>
						<span>Total Self Score:</span>
						<strong style="font-size: 14px; color: #1e40af;">${flt(ts.self_target_score, 2).toFixed(2)}</strong>
						<span style="font-size: 11px; opacity: 0.8;">/ ${flt(ts.target_weight, 2).toFixed(2)}</span>
					</div>
					${ts.show_super ? `
					<div class="pms-footer-chip chip-supervisor" style="display: inline-flex; align-items: center; gap: 5px; background: #f5f3ff; border: 1px solid #ddd6fe; padding: 5px 12px; border-radius: 18px; font-size: 12.5px; font-weight: 600; color: #6d28d9;">
						<i class="fa fa-user-tie" style="font-size: 11px; opacity: 0.8;"></i>
						<span>Total Supervisor Score:</span>
						<strong style="font-size: 14px; color: #5b21b6;">${flt(ts.sup_target_score, 2).toFixed(2)}</strong>
						<span style="font-size: 11px; opacity: 0.8;">/ ${flt(ts.target_weight, 2).toFixed(2)}</span>
					</div>` : ''}
					${ts.show_rev ? `
					<div class="pms-footer-chip chip-reviewer" style="display: inline-flex; align-items: center; gap: 5px; background: #fef3c7; border: 1px solid #fde68a; padding: 5px 12px; border-radius: 18px; font-size: 12.5px; font-weight: 600; color: #b45309;">
						<i class="fa fa-gavel" style="font-size: 11px; opacity: 0.8;"></i>
						<span>Total Reviewer Score:</span>
						<strong style="font-size: 14px; color: #92400e;">${flt(ts.rev_target_score, 2).toFixed(2)}</strong>
						<span style="font-size: 11px; opacity: 0.8;">/ ${flt(ts.target_weight, 2).toFixed(2)}</span>
					</div>` : ''}
				</div>
			</div>
		`;
		target_footer.html(targets_html);
	}

	// 2. Competencies Table Footer
	if (frm.fields_dict["competencies"] && frm.fields_dict["competencies"].$wrapper) {
		let comp_wrapper = frm.fields_dict["competencies"].$wrapper;
		let comp_grid = comp_wrapper.find('.form-grid');
		let comp_footer = comp_wrapper.find('.pms-competencies-score-footer');
		if (!comp_footer.length) {
			comp_footer = $('<div class="pms-table-score-footer pms-competencies-score-footer"></div>');
			if (comp_grid.length) comp_grid.after(comp_footer);
			else comp_wrapper.append(comp_footer);
		}

		let comps_html = `
			<div class="pms-footer-bar" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: #f8fafc; border: 1px solid #d1d5db; border-top: 2px solid #94a3b8; border-radius: 0 0 8px 8px; padding: 10px 14px; margin-top: -1px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
				<div class="pms-footer-title" style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">
					<span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; background: #f3e8ff; color: #7c3aed;">
						<i class="fa fa-star" style="font-size: 13px;"></i>
					</span>
					<span>Total Competency Score</span>
				</div>
				<div class="pms-footer-badges" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
					<div class="pms-footer-chip chip-weight" style="display: inline-flex; align-items: center; gap: 5px; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 5px 11px; border-radius: 18px; font-size: 12.5px; font-weight: 600; color: #475569;">
						<span style="opacity: 0.85;">Total Weight:</span>
						<strong style="color: #0f172a; font-size: 13.5px;">${flt(ts.comp_weight, 2).toFixed(2)}</strong>
					</div>
					<div class="pms-footer-chip chip-self" style="display: inline-flex; align-items: center; gap: 5px; background: #eff6ff; border: 1px solid #bfdbfe; padding: 5px 12px; border-radius: 18px; font-size: 12.5px; font-weight: 600; color: #1d4ed8;">
						<i class="fa fa-user" style="font-size: 11px; opacity: 0.8;"></i>
						<span>Total Self Score:</span>
						<strong style="font-size: 14px; color: #1e40af;">${flt(ts.self_comp_score, 2).toFixed(2)}</strong>
						<span style="font-size: 11px; opacity: 0.8;">/ ${flt(ts.comp_weight, 2).toFixed(2)}</span>
					</div>
					${ts.show_super ? `
					<div class="pms-footer-chip chip-supervisor" style="display: inline-flex; align-items: center; gap: 5px; background: #f5f3ff; border: 1px solid #ddd6fe; padding: 5px 12px; border-radius: 18px; font-size: 12.5px; font-weight: 600; color: #6d28d9;">
						<i class="fa fa-user-tie" style="font-size: 11px; opacity: 0.8;"></i>
						<span>Total Supervisor Score:</span>
						<strong style="font-size: 14px; color: #5b21b6;">${flt(ts.sup_comp_score, 2).toFixed(2)}</strong>
						<span style="font-size: 11px; opacity: 0.8;">/ ${flt(ts.comp_weight, 2).toFixed(2)}</span>
					</div>` : ''}
					${ts.show_rev ? `
					<div class="pms-footer-chip chip-reviewer" style="display: inline-flex; align-items: center; gap: 5px; background: #fef3c7; border: 1px solid #fde68a; padding: 5px 12px; border-radius: 18px; font-size: 12.5px; font-weight: 600; color: #b45309;">
						<i class="fa fa-gavel" style="font-size: 11px; opacity: 0.8;"></i>
						<span>Total Reviewer Score:</span>
						<strong style="font-size: 14px; color: #92400e;">${flt(ts.rev_comp_score, 2).toFixed(2)}</strong>
						<span style="font-size: 11px; opacity: 0.8;">/ ${flt(ts.comp_weight, 2).toFixed(2)}</span>
					</div>` : ''}
				</div>
			</div>
		`;
		comp_footer.html(comps_html);
	}
}

function update_live_appraisal_scores(frm) {
	if (!frm.doc || !frm._is_appraisal_mode) return;
	let ts = get_table_scores(frm);

	frm.doc.total_targets_score = ts.active_target_score;
	frm.doc.total_competency_score = ts.active_comp_score;
	frm.doc.total_score = ts.total_score;
	frm.doc.rating_band = ts.band;

	if (frm.fields_dict["total_targets_score"]) frm.refresh_field("total_targets_score");
	if (frm.fields_dict["total_competency_score"]) frm.refresh_field("total_competency_score");
	if (frm.fields_dict["total_score"]) frm.refresh_field("total_score");
	if (frm.fields_dict["rating_band"]) frm.refresh_field("rating_band");

	render_appraisal_headline(frm);
	render_table_score_footers(frm);
}

function render_appraisal_headline(frm) {
	let status = frm.doc.appraisal_status || "Self-Assessment Pending";
	let ts = get_table_scores(frm);
	let total_score = ts.total_score;
	let band = ts.band;
	let dispute = frm.doc.dispute_flag ? `<span class="indicator-pill red bold" style="margin-left: 6px;">Disputed</span>` : "";
	let locked = frm.doc.locked ? `<span class="indicator-pill green bold" style="margin-left: 6px;"><i class="fa fa-lock"></i> Locked</span>` : "";

	let badge_class = "blue";
	if (status === "Appraisal Accepted" || status === "Finalized & Locked") badge_class = "green";
	else if (status.includes("Dispute") || status.includes("PERC")) badge_class = "orange";
	else if (status.includes("Supervisor")) badge_class = "purple";

	let info_message = "";
	if (status === "Self-Assessment Pending") {
		info_message = __("Employee Self-Assessment is active. Enter self scores, remarks, upload supporting evidence, and submit.");
	} else if (status === "Pending Supervisor Review") {
		info_message = __("Awaiting Supervisor evaluation and scoring.");
	} else if (status === "Pending Employee Acceptance") {
		info_message = __("Supervisor evaluation completed. Employee must review and either Accept or Raise Dispute (both will forward to Reviewer).");
	} else if (status === "Pending Reviewer Review") {
		info_message = __("Supervisor evaluation accepted by employee. Awaiting Reviewer ({0}) evaluation and scoring.", [frm.doc.reviewer_name || frm.doc.reviewer_snapshot]);
	} else if (status === "Disputed - Pending Reviewer") {
		info_message = __("Dispute raised by employee ({0}) and escalated to Reviewer ({1}). Reason: \"{2}\"", [frm.doc.employee_name || frm.doc.employee, frm.doc.reviewer_name || frm.doc.reviewer_snapshot, frm.doc.dispute_reason || ""]);
	} else if (status === "Reviewer Resolved - Pending Employee Decision") {
		info_message = __("Reviewer evaluation completed. Employee must review and either Accept Final Scores or Request PERC escalation.");
	} else if (status === "Under PERC Review") {
		info_message = __("Case submitted to Performance Evaluation Review Committee ({0}). Awaiting committee hearing & final score.", [frm.doc.perc_case || ""]);
	} else if (status === "Appraisal Accepted") {
		info_message = __("Appraisal evaluation accepted. Ready for HR Admin final lock.");
	} else if (status === "Finalized & Locked") {
		info_message = __("Appraisal finalized and permanently locked by HR Admin. Final Score: <b>{0}</b> ({1}).", [flt(total_score, 2).toFixed(2), band]);
	}

	frm.dashboard.clear_headline();
	frm.dashboard.set_headline(`
		<div style="padding: 6px 0;">
			<div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 8px;">
				<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
					<span class="indicator-pill ${badge_class} bold" style="font-size: 13px; padding: 4px 10px; border-radius: 6px;">
						${status}
					</span>
					${dispute}
					${locked}
					<span style="font-size: 13px; font-weight: 600; color: var(--text-color); margin-left: 6px;">
						Employee: ${frm.doc.employee_name} (${frm.doc.employee})
					</span>
				</div>
				<div style="display: flex; align-items: center; gap: 16px; font-size: 13px;">
					<span>Total Score: <strong style="color: #15803d; font-size: 15px;">${flt(total_score, 2).toFixed(2)}</strong></span>
					<span>Rating Band: <strong style="color: var(--text-color);">${band}</strong></span>
				</div>
			</div>
			<div style="font-size: 12.5px; color: var(--text-muted); background: rgba(0,0,0,0.02); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.05);">
				<i class="fa fa-info-circle text-info" style="margin-right: 6px;"></i> ${info_message}
			</div>
		</div>
	`);
}

if (frappe.ui && frappe.ui.form && frappe.ui.form.GridRow) {
	if (!frappe.ui.form.GridRow.prototype.toggle_enable) {
		frappe.ui.form.GridRow.prototype.toggle_enable = function(fieldname, enable) {
			if (this.toggle_editable) {
				this.toggle_editable(fieldname, enable);
			} else {
				this.set_field_property(fieldname, "read_only", enable ? 0 : 1);
			}
		};
	}
}

function rebuild_grid_columns(frm, grid_fieldname, child_doctype, col_configs, mode_key) {
	if (!frm.fields_dict[grid_fieldname] || !frm.fields_dict[grid_fieldname].grid) return;
	let grid = frm.fields_dict[grid_fieldname].grid;

	// 1. Purge cached user settings that lock grid columns to old schemas
	try {
		if (frappe.model.user_settings && frappe.model.user_settings["PMS Appraisal"]) {
			delete frappe.model.user_settings["PMS Appraisal"].GridView;
		}
		if (frappe.get_user_settings) {
			let us = frappe.get_user_settings("PMS Appraisal", "GridView");
			if (us) {
				delete us[child_doctype];
			}
		}
	} catch(e){}

	grid.user_defined_columns = null;
	if (!grid.column_disp_overrides) grid.column_disp_overrides = {};

	// 2. Clear Frappe's docfield_copy cache so docfields are not locked to stale values
	try {
		if (frappe.meta.docfield_copy && frappe.meta.docfield_copy[child_doctype]) {
			delete frappe.meta.docfield_copy[child_doctype];
		}
	} catch(e){}

	// 3. Update meta docfield maps and list
	col_configs.forEach(cfg => {
		let fn = cfg.fieldname;
		let hidden = cfg.hidden ? 1 : 0;
		let in_list = cfg.in_list_view ? 1 : 0;
		let cols = cfg.columns || 2;
		let ro = cfg.read_only !== undefined ? (cfg.read_only ? 1 : 0) : undefined;
		let lbl = cfg.label;

		grid.column_disp_overrides[fn] = hidden;

		let meta_df = frappe.meta.get_docfield(child_doctype, fn);
		if (meta_df) {
			meta_df.hidden = hidden;
			meta_df.in_list_view = in_list;
			meta_df.columns = cols;
			meta_df.colsize = cols;
			if (ro !== undefined) meta_df.read_only = ro;
			if (lbl) meta_df.label = lbl;
		}

		if (frappe.meta.docfield_map && frappe.meta.docfield_map[child_doctype] && frappe.meta.docfield_map[child_doctype][fn]) {
			let d = frappe.meta.docfield_map[child_doctype][fn];
			d.hidden = hidden;
			d.in_list_view = in_list;
			d.columns = cols;
			d.colsize = cols;
			if (ro !== undefined) d.read_only = ro;
			if (lbl) d.label = lbl;
		}

		if (frappe.meta.docfield_list && frappe.meta.docfield_list[child_doctype]) {
			let d = frappe.meta.docfield_list[child_doctype].find(x => x.fieldname === fn);
			if (d) {
				d.hidden = hidden;
				d.in_list_view = in_list;
				d.columns = cols;
				d.colsize = cols;
				if (ro !== undefined) d.read_only = ro;
				if (lbl) d.label = lbl;
			}
		}

		if (grid.docfields) {
			let df = grid.docfields.find(d => d.fieldname === fn);
			if (df) {
				df.hidden = hidden;
				df.in_list_view = in_list;
				df.columns = cols;
				df.colsize = cols;
				if (ro !== undefined) df.read_only = ro;
				if (lbl) df.label = lbl;
			} else {
				let mdf = frappe.meta.get_docfield(child_doctype, fn) || (frappe.meta.docfield_map[child_doctype] && frappe.meta.docfield_map[child_doctype][fn]);
				if (mdf) {
					mdf.hidden = hidden;
					mdf.in_list_view = in_list;
					mdf.columns = cols;
					mdf.colsize = cols;
					if (ro !== undefined) mdf.read_only = ro;
					if (lbl) mdf.label = lbl;
					grid.docfields.push(mdf);
				}
			}
		}

		if (grid.fields_map && grid.fields_map[fn]) {
			grid.fields_map[fn].hidden = hidden;
			grid.fields_map[fn].in_list_view = in_list;
			grid.fields_map[fn].columns = cols;
			grid.fields_map[fn].colsize = cols;
			if (ro !== undefined) grid.fields_map[fn].read_only = ro;
			if (lbl) grid.fields_map[fn].label = lbl;
		}
	});

	// 4. Build explicit target_visible_columns array in exact desired order
	let target_visible_columns = [];
	col_configs.forEach(cfg => {
		if (!cfg.hidden && cfg.in_list_view) {
			let df = (grid.docfields && grid.docfields.find(d => d.fieldname === cfg.fieldname))
				|| (grid.fields_map && grid.fields_map[cfg.fieldname])
				|| (frappe.meta.docfield_map && frappe.meta.docfield_map[child_doctype] && frappe.meta.docfield_map[child_doctype][cfg.fieldname])
				|| frappe.meta.get_docfield(child_doctype, cfg.fieldname);
			if (df) {
				df.hidden = 0;
				df.in_list_view = 1;
				df.columns = cfg.columns || 2;
				df.colsize = cfg.columns || 2;
				if (cfg.read_only !== undefined) df.read_only = cfg.read_only ? 1 : 0;

				if (grid.docfields && !grid.docfields.find(d => d.fieldname === df.fieldname)) {
					grid.docfields.push(df);
				}
				if (grid.fields_map) {
					grid.fields_map[df.fieldname] = df;
				}

				target_visible_columns.push([df, df.colsize]);
			}
		}
	});

	// 5. Check if current visible columns match target
	let current_vis_str = (grid.visible_columns || []).map(col => (col[0] && col[0].fieldname) + ":" + col[1]).join(",");
	let target_vis_str = target_visible_columns.map(col => (col[0] && col[0].fieldname) + ":" + col[1]).join(",");
	let needs_rebuild = (current_vis_str !== target_vis_str) || (grid._rendered_pms_mode !== mode_key);

	if (needs_rebuild) {
		grid._rendered_pms_mode = mode_key;
		grid.user_defined_columns = [];
		grid.setup_user_defined_columns = function() { this.user_defined_columns = []; };
		grid.visible_columns = target_visible_columns;
		grid.setup_visible_columns = function() {
			this.visible_columns = target_visible_columns;
		};

		// Remove any stale rows from DOM and reset grid_rows so all rows re-render fresh with matching columns
		if (grid.grid_rows && grid.grid_rows.length > 0) {
			$(grid.parent).find(".grid-body .grid-row").remove();
			grid.grid_rows = [];
			grid.grid_rows_by_docname = {};
		}

		if (grid.refresh) {
			grid.refresh();
		}
	}
}

function apply_reviews_permissions(frm, can_edit_sup, can_edit_rev) {
	if (!frm.fields_dict["targets"] || !frm.fields_dict["targets"].grid) return;
	let grid = frm.fields_dict["targets"].grid;

	const perms = {
		"target_reviews": can_edit_sup ? 0 : 1,
		"reviewer_comments": can_edit_rev ? 0 : 1
	};

	Object.keys(perms).forEach(fn => {
		let ro = perms[fn];
		let can_edit = (ro === 0);

		// 1. Update Frappe metadata
		let meta_df = frappe.meta.get_docfield("PMS Target", fn);
		if (meta_df) meta_df.read_only = ro;

		if (frappe.meta.docfield_map && frappe.meta.docfield_map["PMS Target"] && frappe.meta.docfield_map["PMS Target"][fn]) {
			frappe.meta.docfield_map["PMS Target"][fn].read_only = ro;
		}

		// 2. Update grid docfields
		if (grid.docfields) {
			let df = grid.docfields.find(d => d.fieldname === fn);
			if (df) df.read_only = ro;
		}

		// 3. Update grid docfield property
		try {
			grid.update_docfield_property(fn, "read_only", ro);
		} catch(e) {}

		// 4. Update each grid row & column controls
		if (grid.grid_rows) {
			grid.grid_rows.forEach(row => {
				if (row.docfields) {
					let rdf = row.docfields.find(d => d.fieldname === fn);
					if (rdf) rdf.read_only = ro;
				}
				if (row.columns_list) {
					row.columns_list.forEach(col => {
						if (col.df && col.df.fieldname === fn) {
							col.df.read_only = ro;
							if (col.field) {
								col.field.df.read_only = ro;
								if (col.field.refresh) col.field.refresh();
							}
						}
					});
				}
				if (row.on_grid_fields_dict && row.on_grid_fields_dict[fn]) {
					row.on_grid_fields_dict[fn].df.read_only = ro;
					if (row.on_grid_fields_dict[fn].refresh) row.on_grid_fields_dict[fn].refresh();
				}
				if (row.grid_form && row.grid_form.fields_dict && row.grid_form.fields_dict[fn]) {
					row.grid_form.fields_dict[fn].df.read_only = ro;
					if (row.grid_form.fields_dict[fn].refresh) row.grid_form.fields_dict[fn].refresh();
				}
				if (row.toggle_editable) {
					row.toggle_editable(fn, can_edit);
				} else if (row.toggle_enable) {
					row.toggle_enable(fn, can_edit);
				}
			});
		}
	});

	if (grid.refresh) {
		grid.refresh();
	}
}

function apply_target_reviews_permission(frm, can_edit_sup, can_edit_rev) {
	if (can_edit_rev !== undefined) {
		apply_reviews_permissions(frm, can_edit_sup, can_edit_rev);
	} else if (typeof can_edit_sup === "boolean") {
		apply_reviews_permissions(frm, can_edit_sup, can_edit_sup);
	} else {
		apply_reviews_permissions(frm, false, false);
	}
}

function toggle_scoring_visibility(frm, is_appraisal) {
	const target_scoring_cols = [
		"self_score", "self_remark", "evidence",
		"supervisor_score", "supervisor_remark",
		"reviewer_score", "reviewer_remark"
	];
	const comp_scoring_cols = [
		"self_rating", "self_remark",
		"supervisor_rating", "supervisor_remark",
		"reviewer_rating", "reviewer_remark"
	];

	const parent_scoring_fields = [
		"appraisal_status", "total_targets_score", "total_competency_score", "total_score", "rating_band",
		"dispute_flag", "dispute_reason", "locked", "perc_case",
		"employee_overall_remarks", "supervisor_overall_remarks", "reviewer_overall_remarks",
		"amendment_window_open", "plan_rejection_remark", "plan_revision_changes", "revised_by_role"
	];

	if (!is_appraisal) {
		// HIDE ALL SCORING FIELDS IN PERFORMANCE PLAN MODE
		$('body').removeClass('gdl-pms-appraisal-mode gdl-pms-self-assessment-stage').addClass('gdl-pms-plan-mode');
		if (frm.page && frm.page.wrapper) {
			frm.page.wrapper.addClass('gdl-pms-plan-mode').removeClass('gdl-pms-appraisal-mode gdl-pms-self-assessment-stage');
		}

		parent_scoring_fields.forEach(f => {
			try {
				frm.set_df_property(f, "hidden", 1);
				frm.toggle_display(f, false);
			} catch(e){}
		});

		// In Performance Plan, hide plan revision remark in favor of per-target "Target Reviews" column
		try {
			frm.set_df_property("plan_revision_remark", "hidden", 1);
			frm.toggle_display("plan_revision_remark", false);
		} catch(e){}

		// Hide redundant vertical metadata fields (represented in Hero Header Card)
		const plan_meta_fields = [
			"employee", "employee_name", "grade_group", "cycle",
			"supervisor_snapshot", "supervisor_name",
			"reviewer_snapshot", "reviewer_name",
			"supervisor_2_snapshot", "supervisor_2_name",
			"plan_status", "workflow_state", "amendment_window_open"
		];

		if (frm.is_new()) {
			if (frm.page && frm.page.wrapper) frm.page.wrapper.addClass('gdl-pms-is-new');
			frm.set_df_property("cycle", "hidden", 0);
			frm.toggle_display("cycle", true);
			frm.set_df_property("cycle", "reqd", 1);

			let is_admin = frappe.user_roles.includes("System Manager") || frappe.user_roles.includes("HR Admin") || frappe.user_roles.includes("HR Manager");
			frm.set_df_property("employee", "hidden", is_admin ? 0 : 1);
			frm.toggle_display("employee", is_admin);

			plan_meta_fields.filter(f => f !== "employee" && f !== "cycle").forEach(f => {
				try {
					frm.set_df_property(f, "hidden", 1);
					frm.toggle_display(f, false);
				} catch(e){}
			});
		} else {
			if (frm.page && frm.page.wrapper) frm.page.wrapper.removeClass('gdl-pms-is-new');
			plan_meta_fields.forEach(f => {
				try {
					frm.set_df_property(f, "hidden", 1);
					frm.toggle_display(f, false);
				} catch(e){}
			});
		}

		// Rebuild plan columns for targets
		let is_admin_plan = frm._is_admin !== undefined ? frm._is_admin : (frappe.user_roles.includes("System Manager") || frappe.user_roles.includes("HR Admin") || frappe.user_roles.includes("HR Manager"));
		let current_emp_plan = frm._current_emp;
		let is_my_doc_plan = frm._is_my_doc !== undefined ? frm._is_my_doc : (frm.is_new() || (current_emp_plan && (current_emp_plan === frm.doc.employee)));
		let is_supervisor_plan = frm._is_supervisor !== undefined ? frm._is_supervisor : ((current_emp_plan && current_emp_plan === frm.doc.supervisor_snapshot) || is_admin_plan);
		let is_reviewer_plan = frm._is_reviewer !== undefined ? frm._is_reviewer : ((current_emp_plan && current_emp_plan === frm.doc.reviewer_snapshot) || is_admin_plan);

		let can_edit_sup_comments = false;
		let can_edit_rev_comments = false;
		if (!is_my_doc_plan) {
			if (is_admin_plan) {
				can_edit_sup_comments = true;
				can_edit_rev_comments = true;
			} else {
				if (is_supervisor_plan && frm.doc.plan_status === "Pending Supervisor Approval") {
					can_edit_sup_comments = true;
				}
				if (is_reviewer_plan && frm.doc.plan_status === "Pending Reviewer Approval") {
					can_edit_rev_comments = true;
				}
			}
		}

		let target_plan_cols = [
			{ fieldname: "target_description", in_list_view: 1, columns: 4, hidden: 0, read_only: 0 },
			{ fieldname: "weight", in_list_view: 1, columns: 1, hidden: 0, read_only: 0 },
			{ fieldname: "target_reviews", in_list_view: 1, columns: 3, hidden: 0, read_only: can_edit_sup_comments ? 0 : 1, label: __("Supervisor Comments") },
			{ fieldname: "reviewer_comments", in_list_view: 1, columns: 3, hidden: 0, read_only: can_edit_rev_comments ? 0 : 1, label: __("Reviewer Comments") },
			{ fieldname: "remark", in_list_view: 0, hidden: 1 },
			{ fieldname: "self_score", in_list_view: 0, hidden: 1 },
			{ fieldname: "self_remark", in_list_view: 0, hidden: 1 },
			{ fieldname: "evidence", in_list_view: 0, hidden: 1 },
			{ fieldname: "supervisor_score", in_list_view: 0, hidden: 1 },
			{ fieldname: "supervisor_remark", in_list_view: 0, hidden: 1 },
			{ fieldname: "reviewer_score", in_list_view: 0, hidden: 1 },
			{ fieldname: "reviewer_remark", in_list_view: 0, hidden: 1 }
		];
		rebuild_grid_columns(frm, "targets", "PMS Target", target_plan_cols, "plan");
		if (frm.fields_dict["targets"] && frm.fields_dict["targets"].grid) {
			frm.fields_dict["targets"].grid.cannot_add_rows = false;
		}

		// Rebuild plan columns for competencies
		let comp_plan_cols = [
			{ fieldname: "competency", in_list_view: 1, columns: 3, hidden: 0, read_only: 1 },
			{ fieldname: "definition", in_list_view: 1, columns: 6, hidden: 0, read_only: 1 },
			{ fieldname: "weight", in_list_view: 1, columns: 2, hidden: 0, read_only: 1 },
			{ fieldname: "self_rating", in_list_view: 0, hidden: 1 },
			{ fieldname: "self_remark", in_list_view: 0, hidden: 1 },
			{ fieldname: "supervisor_rating", in_list_view: 0, hidden: 1 },
			{ fieldname: "supervisor_remark", in_list_view: 0, hidden: 1 },
			{ fieldname: "reviewer_rating", in_list_view: 0, hidden: 1 },
			{ fieldname: "reviewer_remark", in_list_view: 0, hidden: 1 }
		];
		rebuild_grid_columns(frm, "competencies", "PMS Competency Score", comp_plan_cols, "plan");
		if (frm.fields_dict["competencies"] && frm.fields_dict["competencies"].grid) {
			frm.fields_dict["competencies"].grid.cannot_add_rows = true;
		}
	} else {
		// IN APPRAISAL MODE: SHOW SCORING FIELDS APPROPRIATE TO CURRENT STATE
		$('body').removeClass('gdl-pms-plan-mode gdl-pms-is-new').addClass('gdl-pms-appraisal-mode');
		if (frm.page && frm.page.wrapper) {
			frm.page.wrapper.removeClass('gdl-pms-plan-mode gdl-pms-is-new').addClass('gdl-pms-appraisal-mode');
		}

		let app_status = frm.doc.appraisal_status || "Self-Assessment Pending";
		let is_self = (app_status === "Self-Assessment Pending");
		let show_super = (!is_self);
		let show_rev = (app_status.includes("Reviewer") || app_status.includes("PERC") || app_status === "Appraisal Accepted" || app_status === "Finalized & Locked");

		if (is_self) {
			if (frm.page && frm.page.wrapper) {
				frm.page.wrapper.addClass('gdl-pms-self-assessment-stage');
			}
		} else {
			if (frm.page && frm.page.wrapper) {
				frm.page.wrapper.removeClass('gdl-pms-self-assessment-stage');
			}
		}

		const plan_meta_fields = [
			"employee", "employee_name", "grade_group", "cycle",
			"supervisor_snapshot", "supervisor_name",
			"reviewer_snapshot", "reviewer_name",
			"supervisor_2_snapshot", "supervisor_2_name",
			"plan_status", "workflow_state", "amendment_window_open"
		];
		plan_meta_fields.forEach(f => {
			try {
				frm.set_df_property(f, "hidden", 1);
				frm.toggle_display(f, false);
			} catch(e){}
		});

		frm.set_df_property("appraisal_status", "hidden", 0);
		frm.toggle_display("appraisal_status", true);
		frm.set_df_property("total_targets_score", "hidden", 0);
		frm.toggle_display("total_targets_score", true);
		frm.set_df_property("total_competency_score", "hidden", 0);
		frm.toggle_display("total_competency_score", true);
		frm.set_df_property("total_score", "hidden", 0);
		frm.toggle_display("total_score", true);
		frm.set_df_property("rating_band", "hidden", 0);
		frm.toggle_display("rating_band", true);

		// Strictly hide Overall Remarks (Employee, Supervisor, Reviewer) across all appraisal stages
		["employee_overall_remarks", "supervisor_overall_remarks", "reviewer_overall_remarks"].forEach(fn => {
			frm.set_df_property(fn, "hidden", 1);
			frm.toggle_display(fn, false);
		});

		let mode_key = "appraisal_" + (is_self ? "self" : (show_rev ? "rev" : "super"));

		// Rebuild targets columns for appraisal mode
		let target_appraisal_cols = [
			{ fieldname: "target_description", in_list_view: 1, columns: show_rev ? 2 : (show_super ? 3 : 3), hidden: 0, read_only: 1 },
			{ fieldname: "weight", in_list_view: 1, columns: 1, hidden: 0, read_only: 1 },
			{ fieldname: "target_reviews", in_list_view: 0, hidden: 1 },
			{ fieldname: "reviewer_comments", in_list_view: 0, hidden: 1 },
			{ fieldname: "remark", in_list_view: 0, hidden: 1 },
			{ fieldname: "self_score", in_list_view: 1, columns: 1, hidden: 0 },
			{ fieldname: "self_remark", in_list_view: 1, columns: show_rev ? 2 : (show_super ? 2 : 3), hidden: 0 },
			{ fieldname: "evidence", in_list_view: 1, columns: show_rev ? 1 : 2, hidden: 0 },
			{ fieldname: "supervisor_score", in_list_view: show_super ? 1 : 0, columns: 1, hidden: show_super ? 0 : 1 },
			{ fieldname: "supervisor_remark", in_list_view: show_super ? 1 : 0, columns: show_rev ? 1 : 2, hidden: show_super ? 0 : 1 },
			{ fieldname: "reviewer_score", in_list_view: show_rev ? 1 : 0, columns: 1, hidden: show_rev ? 0 : 1 },
			{ fieldname: "reviewer_remark", in_list_view: show_rev ? 1 : 0, columns: 2, hidden: show_rev ? 0 : 1 }
		];
		rebuild_grid_columns(frm, "targets", "PMS Target", target_appraisal_cols, mode_key);
		if (frm.fields_dict["targets"] && frm.fields_dict["targets"].grid) {
			frm.fields_dict["targets"].grid.cannot_add_rows = true;
		}

		// Rebuild competencies columns for appraisal mode
		let comp_appraisal_cols = [
			{ fieldname: "competency", in_list_view: 1, columns: show_rev ? 2 : (show_super ? 2 : 3), hidden: 0, read_only: 1 },
			{ fieldname: "definition", in_list_view: 1, columns: show_rev ? 3 : (show_super ? 3 : 4), hidden: 0, read_only: 1 },
			{ fieldname: "weight", in_list_view: 1, columns: 1, hidden: 0, read_only: 1 },
			{ fieldname: "self_rating", in_list_view: 1, columns: 1, hidden: 0 },
			{ fieldname: "self_remark", in_list_view: 1, columns: show_rev ? 2 : (show_super ? 2 : 3), hidden: 0 },
			{ fieldname: "supervisor_rating", in_list_view: show_super ? 1 : 0, columns: 1, hidden: show_super ? 0 : 1 },
			{ fieldname: "supervisor_remark", in_list_view: show_super ? 1 : 0, columns: show_rev ? 1 : 2, hidden: show_super ? 0 : 1 },
			{ fieldname: "reviewer_rating", in_list_view: show_rev ? 1 : 0, columns: 1, hidden: show_rev ? 0 : 1 },
			{ fieldname: "reviewer_remark", in_list_view: show_rev ? 1 : 0, columns: 2, hidden: show_rev ? 0 : 1 }
		];
		rebuild_grid_columns(frm, "competencies", "PMS Competency Score", comp_appraisal_cols, mode_key);
		if (frm.fields_dict["competencies"] && frm.fields_dict["competencies"].grid) {
			frm.fields_dict["competencies"].grid.cannot_add_rows = true;
		}
		update_live_appraisal_scores(frm);
	}
}

function apply_scoring_permissions(frm, app_status, is_supervisor, is_reviewer, is_employee, is_admin) {
	if (!frm.fields_dict["targets"] || !frm.fields_dict["targets"].grid) return;
	let tg = frm.fields_dict["targets"].grid;
	let cg = frm.fields_dict["competencies"] ? frm.fields_dict["competencies"].grid : null;

	let is_self_stage = (app_status === "Self-Assessment Pending");
	let is_sup_stage = (app_status === "Pending Supervisor Review");
	let is_rev_stage = (app_status === "Disputed - Pending Reviewer" || app_status === "Pending Reviewer Review");

	let can_edit_self = (is_self_stage && (is_employee || is_admin));
	let can_edit_sup = (is_sup_stage && (is_supervisor || is_admin));
	let can_edit_rev = (is_rev_stage && (is_reviewer || is_admin));

	let target_ro = {
		target_description: 1,
		weight: 1,
		remark: 1,
		target_reviews: 1,
		reviewer_comments: 1,
		self_score: can_edit_self ? 0 : 1,
		self_remark: can_edit_self ? 0 : 1,
		evidence: can_edit_self ? 0 : 1,
		supervisor_score: can_edit_sup ? 0 : 1,
		supervisor_remark: can_edit_sup ? 0 : 1,
		reviewer_score: can_edit_rev ? 0 : 1,
		reviewer_remark: can_edit_rev ? 0 : 1
	};

	let comp_ro = {
		competency: 1,
		definition: 1,
		weight: 1,
		self_rating: can_edit_self ? 0 : 1,
		self_remark: can_edit_self ? 0 : 1,
		supervisor_rating: can_edit_sup ? 0 : 1,
		supervisor_remark: can_edit_sup ? 0 : 1,
		reviewer_rating: can_edit_rev ? 0 : 1,
		reviewer_remark: can_edit_rev ? 0 : 1
	};

	Object.keys(target_ro).forEach(fn => {
		let ro = target_ro[fn];
		try {
			if (tg.docfields) {
				let df = tg.docfields.find(d => d.fieldname === fn);
				if (df) df.read_only = ro;
			}
			if (frappe.meta.docfield_map["PMS Target"] && frappe.meta.docfield_map["PMS Target"][fn]) {
				frappe.meta.docfield_map["PMS Target"][fn].read_only = ro;
			}
			if (tg.visible_columns) {
				tg.visible_columns.forEach(col => {
					if (col[0] && col[0].fieldname === fn) col[0].read_only = ro;
				});
			}
			if (tg.grid_rows) {
				tg.grid_rows.forEach(row => {
					if (row.columns_list) {
						row.columns_list.forEach(c => {
							if (c.df && c.df.fieldname === fn) {
								c.df.read_only = ro;
								if (c.field && c.field.df) {
									c.field.df.read_only = ro;
									c.field.refresh && c.field.refresh();
								}
							}
						});
					}
					if (row.docfields) {
						let rdf = row.docfields.find(d => d.fieldname === fn);
						if (rdf) rdf.read_only = ro;
					}
				});
			}
		} catch(e) {}
	});

	if (cg) {
		Object.keys(comp_ro).forEach(fn => {
			let ro = comp_ro[fn];
			try {
				if (cg.docfields) {
					let df = cg.docfields.find(d => d.fieldname === fn);
					if (df) df.read_only = ro;
				}
				if (frappe.meta.docfield_map["PMS Competency Score"] && frappe.meta.docfield_map["PMS Competency Score"][fn]) {
					frappe.meta.docfield_map["PMS Competency Score"][fn].read_only = ro;
				}
				if (cg.visible_columns) {
					cg.visible_columns.forEach(col => {
						if (col[0] && col[0].fieldname === fn) col[0].read_only = ro;
					});
				}
				if (cg.grid_rows) {
					cg.grid_rows.forEach(row => {
						if (row.columns_list) {
							row.columns_list.forEach(c => {
								if (c.df && c.df.fieldname === fn) {
									c.df.read_only = ro;
									if (c.field && c.field.df) {
										c.field.df.read_only = ro;
										c.field.refresh && c.field.refresh();
									}
								}
							});
						}
						if (row.docfields) {
							let rdf = row.docfields.find(d => d.fieldname === fn);
							if (rdf) rdf.read_only = ro;
						}
					});
				}
			} catch(e) {}
		});
	}
}

function sync_employee_details(frm, employee, callback) {

	if (!employee) {
		frappe.call({
			method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.get_current_employee",
			callback: function(r) {
				if (r && r.message && r.message.name) {
					frm.set_value("employee", r.message.name).then(() => {
						apply_employee_data(frm, r.message, callback);
					});
				}
			}
		});
	} else {
		frappe.call({
			method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.get_employee_details",
			args: { employee: employee },
			callback: function(r) {
				if (r && r.message) {
					apply_employee_data(frm, r.message, callback);
				}
			}
		});
	}
}

const GRADE_GROUP_COMPETENCIES = {
	"PS_CS": [
		{
			competency: "Leadership",
			weight: 8,
			definition: "a. Demonstrates a broad business perspective.\nb. Demonstrates emotional intelligence.\nc. Manages change and shows adaptability."
		},
		{
			competency: "Strategic Skills",
			weight: 8,
			definition: "a. Demonstrates knowledge of finance and ICT skills.\nb. Actively demonstrates skills of planning, resource management, decision making and risk management.\nc. Able to motivate, engage and drive performance."
		},
		{
			competency: "Communication/ Interpersonal Skills",
			weight: 8,
			definition: "a. Communicates effectively and professionally.\nb. Maintains high rapport with Stakeholders.\nc. Demonstrates skills of effective negotiation"
		},
		{
			competency: "People Management and Development",
			weight: 8,
			definition: "a. Champions development of capabilities of the team members.\nb. Engages in coaching and mentoring team members.\nc. Maintains harmonious and productive work-relationship."
		},
		{
			competency: "Integrity/ Accountability",
			weight: 8,
			definition: "a. Adheres to codes of conduct and ethical principles.\nb. Reliable, transparent, and trustworthy.\nc. Takes responsibility and accountability for their work and behavior."
		}
	],
	"OS_ESP": [
		{
			competency: "Communication/ Interpersonal Relationship",
			weight: 10,
			definition: "a. Courteous and respectful to colleagues and customers\nb. Always maintains impeccable appearance and hygiene\nc. Establishes wide network of positive and productive working relationship"
		},
		{
			competency: "Integrity and Ethical Conduct",
			weight: 10,
			definition: "a. Shows honesty and truthfulness\nb. Adheres to codes of conduct and ethical principles\nc. Reliable, transparent, and trustworthy"
		},
		{
			competency: "Adaptability",
			weight: 10,
			definition: "a. Responsive and adaptive to change and new information/idea\nb. Deals with uncertain and unforeseen situation.\nc. Participates in organizational ad-hoc events and activities"
		},
		{
			competency: "Knowledge of work",
			weight: 10,
			definition: "a. Produce error free outputs/quality of work output\nb. Uses available resources efficiently and skills to complete assigned tasks\nc. Complies to SOPs and occupational safety measures"
		},
		{
			competency: "Work Habits",
			weight: 10,
			definition: "a. Exhibits punctuality\nb. Takes ownership of company resources\nc. Participates in team activities"
		}
	]
};

function populate_competencies_for_grade(frm, grade_group, force = false) {
	if (!grade_group) grade_group = "OS_ESP";
	let boot_comps = frappe.boot && frappe.boot.pms_competencies_data && frappe.boot.pms_competencies_data.competencies;
	let expected_list = (boot_comps && boot_comps[grade_group]) || (GRADE_GROUP_COMPETENCIES && GRADE_GROUP_COMPETENCIES[grade_group]);

	if (!expected_list || expected_list.length === 0) {
		frappe.call({
			method: "gdl_pms.competencies.get_default_competencies",
			args: { grade_group: grade_group },
			callback: function(r) {
				if (r.message && r.message.length > 0) {
					if (!frappe.boot.pms_competencies_data) frappe.boot.pms_competencies_data = { competencies: {}, weights: {} };
					frappe.boot.pms_competencies_data.competencies[grade_group] = r.message;
					_sync_competencies_to_table(frm, r.message, force);
				}
			}
		});
		return;
	}
	_sync_competencies_to_table(frm, expected_list, force);
}

function _sync_competencies_to_table(frm, expected_list, force = false) {
	let current_comps = frm.doc.competencies || [];

	let needs_rebuild = force || current_comps.length === 0;
	if (!needs_rebuild && current_comps.length > 0) {
		let current_names = current_comps.map(c => c.competency);
		let expected_names = expected_list.map(c => c.competency);
		if (JSON.stringify(current_names) !== JSON.stringify(expected_names)) {
			needs_rebuild = true;
		}
	}

	if (needs_rebuild) {
		frm.clear_table("competencies");
		expected_list.forEach(item => {
			let row = frm.add_child("competencies");
			row.competency = item.competency;
			row.definition = item.definition;
			row.weight = item.weight;
		});
		frm.refresh_field("competencies");
		toggle_scoring_visibility(frm, frm._is_appraisal_mode);
	} else {
		let modified = false;
		current_comps.forEach((row, idx) => {
			if (expected_list[idx]) {
				if (!row.definition && expected_list[idx].definition) {
					row.definition = expected_list[idx].definition;
					modified = true;
				}
				if (!row.weight || row.weight !== expected_list[idx].weight) {
					row.weight = expected_list[idx].weight;
					modified = true;
				}
			}
		});
		if (modified) {
			frm.refresh_field("competencies");
			toggle_scoring_visibility(frm, frm._is_appraisal_mode);
		}
	}
}

function apply_employee_data(frm, data, callback) {
	let promises = [];
	if (data.employee_name && frm.doc.employee_name !== data.employee_name) {
		promises.push(frm.set_value("employee_name", data.employee_name));
	}
	if (data.grade_group && frm.doc.grade_group !== data.grade_group) {
		promises.push(frm.set_value("grade_group", data.grade_group));
	}
	if (data.reports_to && frm.doc.supervisor_snapshot !== data.reports_to) {
		promises.push(frm.set_value("supervisor_snapshot", data.reports_to));
	}
	if (data.supervisor_name && frm.doc.supervisor_name !== data.supervisor_name) {
		promises.push(frm.set_value("supervisor_name", data.supervisor_name));
	}
	if (data.reviewer && frm.doc.reviewer_snapshot !== data.reviewer) {
		promises.push(frm.set_value("reviewer_snapshot", data.reviewer));
	}
	if (data.reviewer_name && frm.doc.reviewer_name !== data.reviewer_name) {
		promises.push(frm.set_value("reviewer_name", data.reviewer_name));
	}
	if (data.supervisor_2 && frm.doc.supervisor_2_snapshot !== data.supervisor_2) {
		promises.push(frm.set_value("supervisor_2_snapshot", data.supervisor_2));
	}
	if (data.supervisor_2_name && frm.doc.supervisor_2_name !== data.supervisor_2_name) {
		promises.push(frm.set_value("supervisor_2_name", data.supervisor_2_name));
	}

	Promise.all(promises).then(() => {
		frm.refresh_field("employee_name");
		frm.refresh_field("grade_group");
		frm.refresh_field("supervisor_snapshot");
		frm.refresh_field("supervisor_name");
		frm.refresh_field("reviewer_snapshot");
		frm.refresh_field("reviewer_name");
		frm.refresh_field("supervisor_2_snapshot");
		frm.refresh_field("supervisor_2_name");

		if (data.supervisor_name) {
			frm.set_df_property("supervisor_snapshot", "description", `<b style="color: var(--text-color); font-size: 13px;">${data.supervisor_name}</b>`);
		}
		if (data.reviewer_name) {
			frm.set_df_property("reviewer_snapshot", "description", `<b style="color: var(--text-color); font-size: 13px;">${data.reviewer_name}</b>`);
		}
		if (data.supervisor_2_name) {
			frm.set_df_property("supervisor_2_snapshot", "description", `<b style="color: var(--text-color); font-size: 13px;">${data.supervisor_2_name}</b>`);
		}

		// Initialize default competencies according to Grade Group if empty and new/draft
		if (frm.is_new() || frm.doc.plan_status === "Draft") {
			populate_competencies_for_grade(frm, data.grade_group || frm.doc.grade_group);
		}

		if (data.designation) {
			frm._emp_designation = data.designation;
		}
		if (data.department) {
			frm._emp_department = data.department;
		}
		if (data.supervisor_name) {
			frm._emp_supervisor_name = data.supervisor_name;
		}
		if (data.reviewer_name) {
			frm._emp_reviewer_name = data.reviewer_name;
		}
		if (data.supervisor_2_name) {
			frm._emp_supervisor_2_name = data.supervisor_2_name;
		}

		update_grade_group_display(frm, data);
		if (callback) callback();
	});
}

function build_plan_history_html(frm, history) {
	if (!history || history.length === 0) {
		return `
			<div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; text-align: center; color: #64748b; margin-top: 15px;">
				<i class="fa fa-info-circle" style="font-size: 24px; color: #94a3b8; margin-bottom: 8px;"></i>
				<div style="font-size: 14px; font-weight: 600; color: #334155;">No Plan History Recorded</div>
				<div style="font-size: 12px; margin-top: 4px;">History will appear here as the plan progresses through creation, reviews, approvals, re-edits, and amendments.</div>
			</div>
		`;
	}

	const color_map = {
		green: { border: "#bbf7d0", bg: "#f0fdf4", text: "#15803d", dot: "#16a34a" },
		red: { border: "#fecaca", bg: "#fef2f2", text: "#b91c1c", dot: "#dc2626" },
		orange: { border: "#fed7aa", bg: "#fff7ed", text: "#c2410c", dot: "#ea580c" },
		blue: { border: "#bae6fd", bg: "#f0f9ff", text: "#0369a1", dot: "#0284c7" },
		purple: { border: "#ddd6fe", bg: "#faf5ff", text: "#6d28d9", dot: "#7c3aed" },
		teal: { border: "#99f6e4", bg: "#f0fdfa", text: "#0f766e", dot: "#0d9488" },
		gray: { border: "#e2e8f0", bg: "#f8fafc", text: "#475569", dot: "#64748b" }
	};

	let items_html = "";
	history.forEach((ev, idx) => {
		let col = color_map[ev.badge_color] || color_map.gray;
		let is_last = (idx === history.length - 1);

		let comment_html = "";
		if (ev.comment) {
			let label = "Comment / Remark:";
			if (ev.event_type && (ev.event_type.includes("rejection") || ev.event_type.includes("return"))) label = "Return Reason / Remark:";
			else if (ev.event_type && ev.event_type.includes("re_edit")) label = "Revision Remark to Employee:";
			else if (ev.event_type && ev.event_type.includes("amendment")) label = "Amendment Reason / Remark:";

			comment_html = `
				<div style="background: ${col.bg}; border-left: 3px solid ${col.dot}; padding: 8px 12px; border-radius: 0 6px 6px 0; margin-top: 8px; font-size: 12.5px; color: #1e293b;">
					<div style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${col.dot}; margin-bottom: 2px;">
						${label}
					</div>
					<div style="font-style: italic; line-height: 1.4;">"${frappe.utils.escape_html(ev.comment)}"</div>
				</div>
			`;
		}

		let link_html = "";
		if (ev.link) {
			link_html = `
				<div style="margin-top: 8px;">
					<a href="${ev.link}" class="btn btn-xs btn-default" style="border-radius: 6px; font-size: 11.5px; padding: 3px 9px; display: inline-flex; align-items: center; gap: 5px; color: #1e293b; text-decoration: none; border: 1px solid #cbd5e1;">
						<i class="fa fa-external-link text-muted"></i> View Amendment Document
					</a>
				</div>
			`;
		}

		let details_html = "";
		if (ev.details && !ev.comment) {
			details_html = `<span style="font-size: 12px; color: #64748b;">&bull; ${frappe.utils.escape_html(ev.details)}</span>`;
		}

		items_html += `
			<div class="timeline-item" style="position: relative; margin-bottom: ${is_last ? '0px' : '20px'};">
				<!-- Timeline node circle -->
				<div style="position: absolute; left: -29px; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: ${col.dot}; border: 3px solid #ffffff; box-shadow: 0 0 0 2px ${col.border}; display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 9px; z-index: 2;">
					<i class="fa ${ev.icon || 'fa-circle'}"></i>
				</div>

				<!-- Content Card -->
				<div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); transition: all 0.2s ease;">
					<div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
						<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
							<span style="font-weight: 700; font-size: 13.5px; color: #0f172a;">${frappe.utils.escape_html(ev.title)}</span>
							<span class="indicator-pill ${ev.badge_color} bold" style="font-size: 11px; padding: 2px 8px;">${frappe.utils.escape_html(ev.badge_text)}</span>
						</div>
						<div style="font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 4px;">
							<i class="fa fa-clock-o"></i> ${frappe.utils.escape_html(ev.formatted_date)}
						</div>
					</div>

					<div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #475569; flex-wrap: wrap;">
						<span style="display: inline-flex; align-items: center; gap: 4px; font-weight: 600; color: #334155;">
							<i class="fa fa-user-circle" style="color: #94a3b8;"></i> ${frappe.utils.escape_html(ev.actor_name || 'System')}
						</span>
						<span style="font-size: 11px; background: #f1f5f9; color: #475569; padding: 1px 6px; border-radius: 4px; font-weight: 600; border: 1px solid #e2e8f0;">
							${frappe.utils.escape_html(ev.actor_role || 'Employee')}
						</span>
						${details_html}
					</div>

					${comment_html}
					${link_html}
				</div>
			</div>
		`;
	});

	return `
		<div class="pms-history-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05); overflow: hidden; margin-top: 15px; margin-bottom: 25px;">
			<div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-bottom: 1px solid #e2e8f0;">
				<div style="display: flex; align-items: center; gap: 10px;">
					<div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(21, 128, 61, 0.1); color: #15803d; display: flex; align-items: center; justify-content: center; font-size: 15px;">
						<i class="fa fa-history"></i>
					</div>
					<div>
						<div style="font-weight: 700; font-size: 14px; color: #0f172a; letter-spacing: -0.2px;">Performance Plan Lifecycle & Audit History</div>
						<div style="font-size: 11.5px; color: #64748b;">Complete chronological trail of submissions, approvals, returns, supervisor edits, and amendments</div>
					</div>
				</div>
				<div style="display: flex; align-items: center; gap: 8px;">
					<span class="indicator-pill blue bold" style="font-size: 11px;">${history.length} Event(s)</span>
					<button type="button" class="btn btn-xs btn-default btn-reload-plan-history" title="Refresh History" style="border-radius: 6px; padding: 4px 8px;">
						<i class="fa fa-refresh"></i> Refresh
					</button>
				</div>
			</div>
			
			<div style="padding: 20px 24px; background: #ffffff;">
				<div class="pms-timeline" style="position: relative; padding-left: 28px;">
					<!-- timeline vertical connecting line -->
					<div style="position: absolute; left: 9px; top: 12px; bottom: 12px; width: 2px; background: #e2e8f0; z-index: 1;"></div>
					${items_html}
				</div>
			</div>
		</div>
	`;
}

function render_plan_agreement(frm) {
	if (!frm.fields_dict["plan_agreement_html"]) return;

	let is_approved = (frm.doc.plan_status === "Approved" || frm.doc.plan_status === "Amendment In Progress" || frm.doc.plan_status === "Appraisal Open" || frm.doc.plan_status === "Finalized & Locked");
	let is_pending_post_approval_agreement = (!frm._is_appraisal_mode && is_approved && frm.doc.plan_agreement !== "Agreed" && !frm.doc.locked);
	let is_draft_or_returned = !frm._is_appraisal_mode &&
		(frm.is_new() || frm.doc.plan_status === "Draft" || frm.doc.plan_status === "Returned" || frm.doc.plan_status === "Rejected" || frm.doc.plan_status === "Returned by Supervisor" || frm.doc.plan_status === "Returned by Reviewer") &&
		!frm.doc.locked;
	let is_approved_confirmed = (!frm._is_appraisal_mode && is_approved && frm.doc.plan_agreement === "Agreed");

	if (!is_draft_or_returned && !is_pending_post_approval_agreement && !is_approved_confirmed) {
		frm.set_df_property("plan_agreement_section", "hidden", 1);
		frm.set_df_property("plan_agreement_html", "hidden", 1);
		if (frm.fields_dict["plan_agreement_section"] && frm.fields_dict["plan_agreement_section"].$wrapper) {
			frm.fields_dict["plan_agreement_section"].$wrapper.hide();
		}
		if (frm.fields_dict["plan_agreement_html"] && frm.fields_dict["plan_agreement_html"].$wrapper) {
			frm.fields_dict["plan_agreement_html"].$wrapper.hide();
		}
		return;
	}

	frm.set_df_property("plan_agreement_section", "hidden", 0);
	frm.set_df_property("plan_agreement_html", "hidden", 0);
	if (frm.fields_dict["plan_agreement_section"] && frm.fields_dict["plan_agreement_section"].$wrapper) {
		frm.fields_dict["plan_agreement_section"].$wrapper.show();
	}
	if (frm.fields_dict["plan_agreement_html"] && frm.fields_dict["plan_agreement_html"].$wrapper) {
		frm.fields_dict["plan_agreement_html"].$wrapper.show();
	}

	// 1. If approved and agreement is confirmed, show clean confirmed state
	if (is_approved_confirmed) {
		let confirmed_html = `
			<div class="pms-agreement-container" style="margin-top: 15px; margin-bottom: 25px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				<div style="font-weight: 600; font-size: 13px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
					<span>
						<i class="fa fa-handshake-o" style="margin-right: 6px; color: #16a34a;"></i> Performance Plan Discussion & Agreement
					</span>
					<span class="badge" style="background-color: #dcfce7; color: #15803d; font-size: 11px; padding: 4px 8px; border-radius: 4px;"><i class="fa fa-check"></i> Agreement Confirmed</span>
				</div>
				<div style="background-color: #f0fdf4; border: 1.5px solid #86efac; border-radius: 6px; padding: 14px 18px; display: flex; align-items: flex-start; gap: 14px;">
					<div style="width: 22px; height: 22px; border-radius: 4px; background-color: #16a34a; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;">
						<svg style="width: 14px; height: 14px; fill: white;" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>
					</div>
					<div style="flex: 1; font-size: 13.5px; color: #166534; line-height: 1.5; font-weight: 600;">
						I have discussed and understood the Performance Plan above and agree to the goals on which my performance would be evaluated.
					</div>
				</div>
			</div>
		`;
		let $wrapper = $(frm.fields_dict["plan_agreement_html"].wrapper);
		$wrapper.html(confirmed_html);
		return;
	}

	// 2. If approved but agreement is pending (Reviewer approved plan, link shared to employee to tick)
	if (is_pending_post_approval_agreement) {
		let is_admin = frappe.user_roles.includes("System Manager") || frappe.user_roles.includes("Administrator") || frappe.user_roles.includes("HR Admin") || frappe.user_roles.includes("HR Manager") || (frappe.session && frappe.session.user === "Administrator");
		let is_my_doc = frm._is_my_doc !== undefined ? frm._is_my_doc : (frm._current_emp && frm._current_emp === frm.doc.employee);
		let can_confirm = (is_my_doc || is_admin);

		let pending_html = `
			<div class="pms-agreement-container" style="margin-top: 15px; margin-bottom: 25px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				<div style="background-color: #fffbeb; border: 1.5px solid #f59e0b; border-radius: 8px; padding: 14px 18px; margin-bottom: 14px; display: flex; align-items: center; gap: 12px; box-shadow: 0 1px 3px rgba(245, 158, 11, 0.1);">
					<i class="fa fa-exclamation-circle" style="font-size: 22px; color: #d97706; flex-shrink: 0;"></i>
					<div style="flex: 1;">
						<div style="font-weight: 700; color: #92400e; font-size: 14px;">Agreement Declaration Pending</div>
						<div style="color: #b45309; font-size: 12.5px; margin-top: 2px;">
							Your Reviewer has approved the Performance Plan. Please review your finalized targets above and tick the declaration below to confirm your acceptance.
						</div>
					</div>
				</div>

				<div class="pms-post-approval-agreement-box"
					 style="border: 2px solid #16a34a; background-color: #f0fdf4; padding: 16px 20px; border-radius: 6px; cursor: ${can_confirm ? 'pointer' : 'default'};">
					<div style="display: flex; align-items: flex-start; gap: 14px;">
						<div class="pms-tickbox" style="
							margin-top: 2px; width: 22px; height: 22px;
							border: 2px solid #16a34a; border-radius: 4px;
							background-color: #ffffff; display: flex;
							align-items: center; justify-content: center; flex-shrink: 0;
						">
						</div>
						<div style="flex: 1;">
							<div style="font-size: 13.5px; color: #0f172a; line-height: 1.5; font-weight: 600;">
								I have discussed and understood the Performance Plan above and agree to the goals on which my performance would be evaluated.
							</div>
							${can_confirm ? `
								<div style="margin-top: 12px;">
									<button type="button" class="btn btn-sm btn-primary btn-do-confirm-agreement" style="background-color: #16a34a; border-color: #15803d; font-weight: 600; padding: 6px 16px; border-radius: 6px;">
										<i class="fa fa-check" style="margin-right: 4px;"></i> Tick & Confirm Agreement
									</button>
								</div>
							` : ''}
						</div>
					</div>
				</div>
			</div>
		`;
		let $wrapper = $(frm.fields_dict["plan_agreement_html"].wrapper);
		$wrapper.html(pending_html);

		if (can_confirm) {
			$wrapper.off("click", ".btn-do-confirm-agreement, .pms-post-approval-agreement-box").on("click", ".btn-do-confirm-agreement, .pms-post-approval-agreement-box", function(e) {
				e.preventDefault();
				e.stopPropagation();
				frappe.confirm(
					__("Do you agree to the finalized Performance Plan goals and wish to confirm your acceptance?<br><br><i>'I have discussed and understood the Performance Plan above and agree to the goals on which my performance would be evaluated.'</i>"),
					function() {
						frappe.call({
							method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.confirm_plan_agreement",
							args: { docname: frm.doc.name },
							freeze: true,
							freeze_message: __("Confirming agreement..."),
							callback: function(res) {
								if (!res.exc) {
									frappe.show_alert({
										message: __("Performance Plan agreement confirmed successfully."),
										indicator: "green"
									});
									frm.reload_doc();
								}
							}
						});
					}
				);
			});
		}
		return;
	}

	let current_val = frm.doc.plan_agreement || "";
	let is_admin = frappe.user_roles.includes("System Manager") || frappe.user_roles.includes("Administrator") || frappe.user_roles.includes("HR Admin") || frappe.user_roles.includes("HR Manager") || (frappe.session && frappe.session.user === "Administrator");
	let is_locked = frm.doc.locked || (frm.doc.plan_status === "Approved" && frm.doc.workflow_state === "Monitoring") || (frm.doc.workflow_state === "Appraisal Open") || (frm.doc.workflow_state === "Appraisal Completed");
	let is_owner_or_admin = (frm._is_my_doc !== undefined ? frm._is_my_doc : (frm.is_new() || (frm._current_emp && frm._current_emp === frm.doc.employee))) || is_admin;
	let is_editable = (!is_locked && is_owner_or_admin);

	let is_resubmission = Boolean(frm.doc.first_submission_done || frm.doc.plan_revision_remark || frm.doc.plan_rejection_remark || frm.doc.plan_revision_changes);

	let is_initial_proposed = (current_val === "Initial Proposed");
	let is_agreed = (current_val === "Agreed");
	let is_disagreed = (current_val === "Disagreed");

	let boxes_html = "";

	if (!is_resubmission) {
		// 1. Initial Submission by Employee
		// Option 1: Initial Proposed
		boxes_html += `
			<div class="pms-agreement-box ${is_initial_proposed ? 'pms-agreement-active' : ''}" data-val="Initial Proposed"
				 style="border: 2px solid ${is_initial_proposed ? '#2563eb' : '#000000'};
				        background-color: ${is_initial_proposed ? '#eff6ff' : '#ffffff'};
				        padding: 14px 18px; margin-bottom: 12px; cursor: ${is_editable ? 'pointer' : 'default'};
				        border-radius: 4px; box-shadow: ${is_initial_proposed ? '0 1px 4px rgba(37,99,235,0.15)' : 'none'};
				        transition: all 0.15s ease;">
				<div style="display: flex; align-items: flex-start; gap: 14px; pointer-events: none;">
					<div class="pms-tickbox" style="
						margin-top: 1px;
						width: 22px;
						height: 22px;
						border: 2px solid ${is_initial_proposed ? '#2563eb' : '#475569'};
						border-radius: 4px;
						background-color: ${is_initial_proposed ? '#2563eb' : '#ffffff'};
						display: flex;
						align-items: center;
						justify-content: center;
						flex-shrink: 0;
						transition: all 0.15s ease;
					">
						${is_initial_proposed ? '<svg style="width: 14px; height: 14px; fill: white;" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>' : ''}
					</div>
					<div style="flex: 1; font-size: 13.5px; color: #0f172a; line-height: 1.5; font-weight: ${is_initial_proposed ? '600' : '400'}; user-select: none;">
						This is my Initial Performance Plan proposed to be discussed with my supervisor.
					</div>
				</div>
			</div>

			<!-- Option 2: Agreed -->
			<div class="pms-agreement-box ${is_agreed ? 'pms-agreement-active' : ''}" data-val="Agreed"
				 style="border: 2px solid ${is_agreed ? '#16a34a' : '#000000'};
				        background-color: ${is_agreed ? '#f0fdf4' : '#ffffff'};
				        padding: 14px 18px; margin-bottom: 12px; cursor: ${is_editable ? 'pointer' : 'default'};
				        border-radius: 4px; box-shadow: ${is_agreed ? '0 1px 4px rgba(22,163,74,0.15)' : 'none'};
				        transition: all 0.15s ease;">
				<div style="display: flex; align-items: flex-start; gap: 14px; pointer-events: none;">
					<div class="pms-tickbox" style="
						margin-top: 1px;
						width: 22px;
						height: 22px;
						border: 2px solid ${is_agreed ? '#16a34a' : '#475569'};
						border-radius: 4px;
						background-color: ${is_agreed ? '#16a34a' : '#ffffff'};
						display: flex;
						align-items: center;
						justify-content: center;
						flex-shrink: 0;
						transition: all 0.15s ease;
					">
						${is_agreed ? '<svg style="width: 14px; height: 14px; fill: white;" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>' : ''}
					</div>
					<div style="flex: 1; font-size: 13.5px; color: #0f172a; line-height: 1.5; font-weight: ${is_agreed ? '600' : '400'}; user-select: none;">
						I have discussed and understood the Performance Plans above and agree to the goals on which my performance would be evaluated during the Appraisal Period.
					</div>
				</div>
			</div>

			<!-- Option 3: Disagreed -->
			<div class="pms-agreement-box ${is_disagreed ? 'pms-agreement-active' : ''}" data-val="Disagreed"
				 style="border: 2px solid ${is_disagreed ? '#dc2626' : '#000000'};
				        background-color: ${is_disagreed ? '#fef2f2' : '#ffffff'};
				        padding: 14px 18px; margin-bottom: 10px; cursor: ${is_editable ? 'pointer' : 'default'};
				        border-radius: 4px; box-shadow: ${is_disagreed ? '0 1px 4px rgba(220,38,38,0.15)' : 'none'};
				        transition: all 0.15s ease;">
				<div style="display: flex; align-items: flex-start; gap: 14px; pointer-events: none;">
					<div class="pms-tickbox" style="
						margin-top: 1px;
						width: 22px;
						height: 22px;
						border: 2px solid ${is_disagreed ? '#dc2626' : '#475569'};
						border-radius: 4px;
						background-color: ${is_disagreed ? '#dc2626' : '#ffffff'};
						display: flex;
						align-items: center;
						justify-content: center;
						flex-shrink: 0;
						transition: all 0.15s ease;
					">
						${is_disagreed ? '<svg style="width: 14px; height: 14px; fill: white;" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>' : ''}
					</div>
					<div style="flex: 1; font-size: 13.5px; color: #0f172a; line-height: 1.5; font-weight: ${is_disagreed ? '600' : '400'}; user-select: none;">
						I have understood the Performance Plan as above and I do not agree to the goals on which my performance would be evaluated during the Appraisal Period.
					</div>
				</div>
			</div>
		`;
	} else {
		// 2. Resubmission after Return by Supervisor/Reviewer
		// Option 1: Agreed
		boxes_html += `
			<div class="pms-agreement-box ${is_agreed ? 'pms-agreement-active' : ''}" data-val="Agreed"
				 style="border: 2px solid ${is_agreed ? '#16a34a' : '#000000'};
				        background-color: ${is_agreed ? '#f0fdf4' : '#ffffff'};
				        padding: 14px 18px; margin-bottom: 12px; cursor: ${is_editable ? 'pointer' : 'default'};
				        border-radius: 4px; box-shadow: ${is_agreed ? '0 1px 4px rgba(22,163,74,0.15)' : 'none'};
				        transition: all 0.15s ease;">
				<div style="display: flex; align-items: flex-start; gap: 14px; pointer-events: none;">
					<div class="pms-tickbox" style="
						margin-top: 1px;
						width: 22px;
						height: 22px;
						border: 2px solid ${is_agreed ? '#16a34a' : '#475569'};
						border-radius: 4px;
						background-color: ${is_agreed ? '#16a34a' : '#ffffff'};
						display: flex;
						align-items: center;
						justify-content: center;
						flex-shrink: 0;
						transition: all 0.15s ease;
					">
						${is_agreed ? '<svg style="width: 14px; height: 14px; fill: white;" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>' : ''}
					</div>
					<div style="flex: 1; font-size: 13.5px; color: #0f172a; line-height: 1.5; font-weight: ${is_agreed ? '600' : '400'}; user-select: none;">
						I have discussed and understood the Performance Plan above and agree to the goals on which my performance would be evaluated.
					</div>
				</div>
			</div>

			<!-- Option 2: Disagreed -->
			<div class="pms-agreement-box ${is_disagreed ? 'pms-agreement-active' : ''}" data-val="Disagreed"
				 style="border: 2px solid ${is_disagreed ? '#dc2626' : '#000000'};
				        background-color: ${is_disagreed ? '#fef2f2' : '#ffffff'};
				        padding: 14px 18px; margin-bottom: 10px; cursor: ${is_editable ? 'pointer' : 'default'};
				        border-radius: 4px; box-shadow: ${is_disagreed ? '0 1px 4px rgba(220,38,38,0.15)' : 'none'};
				        transition: all 0.15s ease;">
				<div style="display: flex; align-items: flex-start; gap: 14px; pointer-events: none;">
					<div class="pms-tickbox" style="
						margin-top: 1px;
						width: 22px;
						height: 22px;
						border: 2px solid ${is_disagreed ? '#dc2626' : '#475569'};
						border-radius: 4px;
						background-color: ${is_disagreed ? '#dc2626' : '#ffffff'};
						display: flex;
						align-items: center;
						justify-content: center;
						flex-shrink: 0;
						transition: all 0.15s ease;
					">
						${is_disagreed ? '<svg style="width: 14px; height: 14px; fill: white;" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>' : ''}
					</div>
					<div style="flex: 1; font-size: 13.5px; color: #0f172a; line-height: 1.5; font-weight: ${is_disagreed ? '600' : '400'}; user-select: none;">
						I have understood the Performance Plan as above and I do not agree to the goals on which my performance would be evaluated during the Appraisal Period.
					</div>
				</div>
			</div>
		`;
	}

	let badge_html = "";
	if (!current_val && is_editable) {
		let badge_text = !is_resubmission ? "Please tick one declaration option below" : "Please tick agreement declaration before resubmitting";
		badge_html = `<span class="badge" style="background-color: #fef3c7; color: #92400e; font-size: 11px; padding: 4px 8px; border-radius: 4px;"><i class="fa fa-check-square-o"></i> ${badge_text}</span>`;
	}

	let html = `
		<div class="pms-agreement-container" style="margin-top: 15px; margin-bottom: 25px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
			<div style="font-weight: 600; font-size: 13px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
				<span>
					<i class="fa fa-handshake-o" style="margin-right: 6px; color: #2563eb;"></i> Performance Plan Discussion & Agreement
				</span>
				${badge_html}
			</div>
			${boxes_html}
		</div>
	`;

	let $wrapper = $(frm.fields_dict["plan_agreement_html"].wrapper);
	$wrapper.html(html);

	if (is_editable) {
		$wrapper.off("click", ".pms-agreement-box").on("click", ".pms-agreement-box", function(e) {
			e.preventDefault();
			e.stopPropagation();
			let target_val = $(this).attr("data-val");
			let new_val = (frm.doc.plan_agreement === target_val) ? "" : target_val;
			frm.doc.plan_agreement = new_val;
			frm.dirty();
			frm.set_value("plan_agreement", new_val);
			render_plan_agreement(frm);
		});
	}
}

function render_plan_history(frm) {
	if (frm.is_new()) {
		try {
			frm.set_df_property("plan_history_section", "hidden", 1);
		} catch(e){}
		return;
	}

	try {
		frm.set_df_property("plan_history_section", "hidden", 0);
	} catch(e){}

	frappe.call({
		method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.get_plan_history",
		args: { docname: frm.doc.name },
		callback: function(r) {
			let history = (r && r.message) || [];
			let html = build_plan_history_html(frm, history);

			let rendered = false;
			if (frm.fields_dict["plan_history_html"] && frm.fields_dict["plan_history_html"].$wrapper) {
				frm.fields_dict["plan_history_html"].$wrapper.html(html);
				rendered = true;
			}

			if (!rendered || !$('#pms-plan-history-dynamic-wrapper').length) {
				let $anchor = (frm.fields_dict["competencies"] && frm.fields_dict["competencies"].$wrapper && frm.fields_dict["competencies"].$wrapper.is(':visible'))
					? frm.fields_dict["competencies"].$wrapper
					: (frm.fields_dict["targets"] ? frm.fields_dict["targets"].$wrapper : null);

				if ($anchor && $anchor.length && !rendered) {
					if (!$('#pms-plan-history-dynamic-wrapper').length) {
						$anchor.after('<div id="pms-plan-history-dynamic-wrapper" style="margin-top: 25px;"></div>');
					}
					$('#pms-plan-history-dynamic-wrapper').html(html);
				}
			}

			// Bind reload button
			$('.btn-reload-plan-history').off('click').on('click', function(e) {
				e.preventDefault();
				$(this).find('i').addClass('fa-spin');
				render_plan_history(frm);
			});
		}
	});
}

frappe.ui.form.on("PMS Appraisal", {
	plan_agreement: function(frm) {
		render_plan_agreement(frm);
	},

	setup: function(frm) {
		frm.add_fetch("employee", "employee_name", "employee_name");
		try {
			if (frappe.meta.get_docfield("PMS Target", "weight")) {
				frappe.meta.get_docfield("PMS Target", "weight").precision = "2";
			}
			if (frappe.meta.get_docfield("PMS Competency Score", "weight")) {
				frappe.meta.get_docfield("PMS Competency Score", "weight").precision = "2";
			}
		} catch(e){}
		frm.set_query("cycle", function() {
			return {
				query: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.get_cycles_for_employee",
				filters: {
					employee: frm.doc.employee
				}
			};
		});
	},

	onload: function(frm) {
		frm.set_query("cycle", function() {
			return {
				query: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.get_cycles_for_employee",
				filters: {
					employee: frm.doc.employee
				}
			};
		});
		if (!frappe.user_roles.includes("HR Admin") && !frappe.user_roles.includes("System Manager")) {
			frm.set_df_property("employee", "read_only", 1);
		}
	},

	onload_post_render: function(frm) {
		let is_activated = (frm.doc.workflow_state === "Appraisal Open" || frm.doc.workflow_state === "Appraisal Completed" || (frm.doc.appraisal_status && frm.doc.appraisal_status !== "Not Activated"));
		let is_appraisal = is_activated && (frm._view_mode === "appraisal" || (!frm._view_mode && is_activated));
		frm._is_appraisal_mode = is_appraisal;
		toggle_scoring_visibility(frm, is_appraisal);
		if (!is_appraisal) {
			update_grade_group_display(frm);
		}
	},

	employee: function(frm) {
		if (frm.doc.employee) {
			sync_employee_details(frm, frm.doc.employee);
		}
	},

	cycle: function(frm) {
		update_grade_group_display(frm);
		if (frm.doc.cycle) {
			if (!frm.doc.calendar_year) {
				frappe.db.get_value("PMS Appraisal Cycle", frm.doc.cycle, "calendar_year", (r) => {
					if (r && r.calendar_year) {
						frm.set_value("calendar_year", r.calendar_year);
					}
				});
			}
			if (!frm.doc.cycle_end_date) {
				frappe.db.get_value("PMS Appraisal Cycle", frm.doc.cycle, "end_date", (r) => {
					if (r && r.end_date) {
						frm.set_value("cycle_end_date", r.end_date);
					}
				});
			}
		}
	},

	grade_group: function(frm) {
		update_grade_group_display(frm);
		if (frm.is_new() || frm.doc.plan_status === "Draft") {
			populate_competencies_for_grade(frm, frm.doc.grade_group, true);
		}
	},

	refresh(frm) {
		let route_vm = (frappe.route_options && frappe.route_options.view_mode) || localStorage.getItem("pms_view_mode") || null;
		if (frappe.route_options && frappe.route_options.view_mode) {
			delete frappe.route_options.view_mode;
		}

		if (frm.is_new()) {
			frm._view_mode = "plan";
		} else if (route_vm) {
			frm._view_mode = route_vm;
		}

		let is_activated = (frm.doc.workflow_state === "Appraisal Open" || frm.doc.workflow_state === "Appraisal Completed" || (frm.doc.appraisal_status && frm.doc.appraisal_status !== "Not Activated"));
		let is_appraisal = is_activated && (frm._view_mode === "appraisal" || (!frm._view_mode && is_activated));
		frm._is_appraisal_mode = is_appraisal;

		if (typeof window.sync_pms_sidebar_active_item === "function") {
			window.sync_pms_sidebar_active_item(is_appraisal ? "appraisal" : "plan");
		}

		// Immediately set page title & toggle scoring visibility
		try {
			let title = is_appraisal ? __("PMS Appraisal Form") : (frm.is_new() ? __("New PMS Performance Plan") : __("PMS Performance Plan"));
			if (frm.set_title) {
				frm.set_title(title);
			} else if (frm.page && frm.page.set_title) {
				frm.page.set_title(title);
			}
		} catch (e) {
			console.log(e);
		}

		toggle_scoring_visibility(frm, is_appraisal);
		if (!is_appraisal) {
			update_grade_group_display(frm);
		}

		if (frm.is_new() && !frm.doc.employee) {
			sync_employee_details(frm);
		} else if (frm.doc.employee) {
			if (!frm.doc.grade_group || !frm.doc.supervisor_name) {
				sync_employee_details(frm, frm.doc.employee);
			}
		}

		if (frm.is_new() && !frm.doc.cycle) {
			frappe.db.get_list("PMS Appraisal Cycle", {
				filters: { status: ["in", ["Active", "Planning Open", "Draft"]] },
				fields: ["name"],
				order_by: "creation desc",
				limit: 1
			}).then(records => {
				if (records && records.length > 0 && !frm.doc.cycle) {
					frm.set_value("cycle", records[0].name).then(() => {
						update_grade_group_display(frm);
					});
				}
			});
		}

		if (frm.doc.grade_group) {
			let comps = frm.doc.competencies || [];
			let missing_defs = comps.length === 0 || comps.some(c => !c.definition);
			if (frm.is_new() || frm.doc.plan_status === "Draft" || missing_defs) {
				populate_competencies_for_grade(frm, frm.doc.grade_group || "OS_ESP");
			}
		}


		if (frm.doc.supervisor_name) {
			frm.set_df_property("supervisor_snapshot", "description", `<b style="color: var(--text-color); font-size: 13px;">${frm.doc.supervisor_name}</b>`);
		}
		if (frm.doc.reviewer_name) {
			frm.set_df_property("reviewer_snapshot", "description", `<b style="color: var(--text-color); font-size: 13px;">${frm.doc.reviewer_name}</b>`);
		}
		if (frm.doc.supervisor_2_name) {
			frm.set_df_property("supervisor_2_snapshot", "description", `<b style="color: var(--text-color); font-size: 13px;">${frm.doc.supervisor_2_name}</b>`);
		}

		try {
			if (frm.fields_dict["targets"] && frm.fields_dict["targets"].grid) {
				frm.fields_dict["targets"].grid.update_docfield_property("weight", "precision", "2");
			}
			if (frm.fields_dict["competencies"] && frm.fields_dict["competencies"].grid) {
				frm.fields_dict["competencies"].grid.update_docfield_property("weight", "precision", "2");
			}
		} catch(e){}

		frm._original_targets_desc_weight_json = JSON.stringify((frm.doc.targets || []).map(t => ({
			name: t.name || "",
			desc: (t.target_description || "").trim(),
			weight: parseFloat(t.weight || 0)
		})));

		frm._original_targets_json = JSON.stringify((frm.doc.targets || []).map(t => ({
			name: t.name || "",
			desc: (t.target_description || "").trim(),
			weight: parseFloat(t.weight || 0),
			target_reviews: (t.target_reviews || "").trim(),
			reviewer_comments: (t.reviewer_comments || "").trim()
		})));

		// Switcher button between Performance Plan and Appraisal Form
		if (!is_appraisal && is_activated) {
			frm.page.add_inner_button(__("Open Appraisal Form"), function() {
				frm._view_mode = "appraisal";
				localStorage.setItem("pms_view_mode", "appraisal");
				frm.refresh();
			}).addClass("btn-primary text-white").css("background", "linear-gradient(135deg, #15803d, #0d9488)");
		} else if (is_appraisal) {
			frm.page.add_inner_button(__("View Performance Plan"), function() {
				frm._view_mode = "plan";
				localStorage.setItem("pms_view_mode", "plan");
				frm.refresh();
			});
		}

		// Rejection & Revision Remarks visibility
		try {
			let is_ret_status = (frm.doc.plan_status === "Rejected" || frm.doc.plan_status === "Returned" || frm.doc.plan_status === "Returned by Supervisor" || frm.doc.plan_status === "Returned by Reviewer");
			frm.set_df_property("plan_rejection_remark", "hidden", is_ret_status ? 0 : 1);
			frm.set_df_property("plan_revision_remark", "hidden", 1);
		} catch(e) { console.log(e); }

		// Render Agreement Declaration & Plan Lifecycle History Timeline
		render_plan_agreement(frm);
		render_plan_history(frm);

		// Dynamic Evaluation of User Roles
		frappe.call({
			method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.get_current_employee",
			callback: function(r) {
				let current_emp = r && r.message && r.message.name;
				frm._current_emp = current_emp;
				let is_my_doc = frm.is_new() || (current_emp && (current_emp === frm.doc.employee));
				let is_admin = frappe.user_roles.includes("System Manager") || frappe.user_roles.includes("HR Admin") || frappe.user_roles.includes("HR Manager");
				let is_supervisor = (current_emp && current_emp === frm.doc.supervisor_snapshot) || is_admin;
				let is_reviewer = (current_emp && current_emp === frm.doc.reviewer_snapshot) || is_admin;
				frm._is_admin = is_admin;
				frm._is_supervisor = is_supervisor;
				frm._is_reviewer = is_reviewer;
				frm._is_my_doc = is_my_doc;
				let is_supervisor_2_only = frappe.user_roles.includes("Supervisor 2") && !is_admin && !frappe.user_roles.includes("Supervisor") && !frappe.user_roles.includes("Reviewer");
				let is_supervisor_2_for_this_doc = (current_emp && frm.doc.supervisor_2_snapshot === current_emp) && !is_my_doc && !is_admin;

				// Supervisor 2: Strict Read-Only Observer
				if (is_supervisor_2_only || is_supervisor_2_for_this_doc) {
					frm.disable_form();
					if (frm.disable_save) frm.disable_save();
					if (frm.page.btn_primary) frm.page.btn_primary.hide();
					if (is_appraisal) render_appraisal_headline(frm);
					else update_grade_group_display(frm);
					return;
				}

				// If Locked: Strict Permanent Lock
				if (frm.doc.locked) {
					frm.disable_form();
					if (frm.disable_save) frm.disable_save();
					if (frm.page.btn_primary) frm.page.btn_primary.hide();
					render_appraisal_headline(frm);
					return;
				}

				// =============================================================
				// CASE A: APPRAISAL PHASE ACTIVE
				// =============================================================
				if (is_appraisal) {
					update_live_appraisal_scores(frm);

					$(frm.wrapper).off('input.pms_scores change.pms_scores').on('input.pms_scores change.pms_scores', 'input[data-fieldname="self_score"], input[data-fieldname="supervisor_score"], input[data-fieldname="reviewer_score"], input[data-fieldname="self_rating"], input[data-fieldname="supervisor_rating"], input[data-fieldname="reviewer_rating"]', function() {
						clearTimeout(frm._pms_score_timer);
						frm._pms_score_timer = setTimeout(() => {
							update_live_appraisal_scores(frm);
						}, 60);
					});

					// In appraisal phase, target descriptions and weights are strictly locked
					frm.set_df_property("targets", "read_only", 0);
					frm.set_df_property("competencies", "read_only", 0);

					let app_status = frm.doc.appraisal_status || "Self-Assessment Pending";
					frm._current_emp = current_emp;
					apply_scoring_permissions(frm, app_status, is_supervisor, is_reviewer, is_my_doc, is_admin);

					// 1. Stage: Self-Assessment Pending
					if (app_status === "Self-Assessment Pending") {
						if (is_my_doc || is_admin) {
							frm.enable_save();
							["employee_overall_remarks", "supervisor_overall_remarks", "reviewer_overall_remarks"].forEach(fn => {
								frm.set_df_property(fn, "hidden", 1);
								frm.toggle_display(fn, false);
							});

							frm.page.add_inner_button(__("Submit Self-Appraisal"), function() {
								let non_pdf = (frm.doc.targets || []).find(t => {
									if (!t.evidence) return false;
									let c = String(t.evidence).split("?")[0].toLowerCase().trim();
									return !c.endsWith(".pdf");
								});
								if (non_pdf) {
									frappe.msgprint({
										title: __("Invalid File Format"),
										indicator: "red",
										message: __("Target #{0} has a non-PDF file attached. Only PDF files are allowed for Supporting Docs.", [non_pdf.idx || 1])
									});
									return;
								}

								frappe.confirm(
									__("Are you sure you want to submit your Self-Appraisal to your Supervisor?"),
									function() {
										frappe.call({
											method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.submit_self_assessment",
											args: {
												docname: frm.doc.name,
												employee_remarks: "",
												target_data: frm.doc.targets,
												competency_data: frm.doc.competencies
											},
											callback: function(res) {
												if (!res.exc) {
													frappe.show_alert({message: __("Self-Appraisal submitted successfully."), indicator: "green"});
													frm.reload_doc();
												}
											}
										});
									}
								);
							}).addClass("btn-primary text-white").css("background-color", "#2490ef");
						} else {
							frm.disable_form();
						}
					}

					// 2. Stage: Pending Supervisor Review
					else if (app_status === "Pending Supervisor Review") {
						if (is_supervisor) {
							frm.enable_save();
							["employee_overall_remarks", "supervisor_overall_remarks", "reviewer_overall_remarks"].forEach(fn => {
								frm.set_df_property(fn, "hidden", 1);
								frm.toggle_display(fn, false);
							});

							frm.page.add_inner_button(__("Submit Supervisor Review"), function() {
								frappe.confirm(
									__("Submit your evaluation and score for this appraisal?"),
									function() {
										frappe.call({
											method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.submit_supervisor_review",
											args: {
												docname: frm.doc.name,
												supervisor_remarks: frm.doc.supervisor_overall_remarks,
												target_data: frm.doc.targets,
												competency_data: frm.doc.competencies
											},
											callback: function(res) {
												if (!res.exc) {
													frappe.show_alert({message: __("Supervisor review submitted."), indicator: "green"});
													frm.reload_doc();
												}
											}
										});
									}
								);
							}).addClass("btn-primary text-white").css("background-color", "#15803d");
						} else {
							frm.disable_form();
						}
					}

					// 3. Stage: Pending Employee Acceptance
					else if (app_status === "Pending Employee Acceptance") {
						frm.disable_form();
						if (is_my_doc || is_admin) {
							frm.page.add_inner_button(__("Accept Scores"), function() {
								frappe.confirm(
									__("Do you accept the supervisor's evaluation and scores?"),
									function() {
										frappe.call({
											method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.accept_supervisor_scores",
											args: { docname: frm.doc.name },
											callback: function(res) {
												if (!res.exc) {
													frappe.show_alert({message: __("Scores accepted."), indicator: "green"});
													frm.reload_doc();
												}
											}
										});
									}
								);
							}).addClass("btn-success text-white").css("background-color", "#28a745");

							frm.page.add_inner_button(__("Raise Dispute"), function() {
								frappe.prompt(
									{
										fieldtype: "Small Text",
										fieldname: "reason",
										label: __("Dispute Reason & Justification"),
										reqd: 1
									},
									function(values) {
										frappe.call({
											method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.raise_dispute",
											args: {
												docname: frm.doc.name,
												dispute_reason: values.reason
											},
											callback: function(res) {
												if (!res.exc) {
													frappe.show_alert({message: __("Dispute raised and forwarded to Reviewer."), indicator: "orange"});
													frm.reload_doc();
												}
											}
										});
									},
									__("Raise Appraisal Dispute"),
									__("Escalate to Reviewer")
								);
							}).addClass("btn-danger text-white").css("background-color", "#dc3545");
						}
					}

					// 4. Stage: Pending Reviewer (Disputed or Accepted Normal Flow)
					else if (app_status === "Disputed - Pending Reviewer" || app_status === "Pending Reviewer Review") {
						if (is_reviewer) {
							frm.enable_save();
							["employee_overall_remarks", "supervisor_overall_remarks", "reviewer_overall_remarks"].forEach(fn => {
								frm.set_df_property(fn, "hidden", 1);
								frm.toggle_display(fn, false);
							});

							let btn_title = frm.doc.dispute_flag ? __("Submit Reviewer Decision") : __("Submit Reviewer Review");
							let confirm_msg = frm.doc.dispute_flag
								? __("Submit your final dispute validation and scores?")
								: __("Submit your reviewer evaluation and scores?");

							frm.page.add_inner_button(btn_title, function() {
								frappe.confirm(
									confirm_msg,
									function() {
										frappe.call({
											method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.submit_reviewer_decision",
											args: {
												docname: frm.doc.name,
												reviewer_remarks: frm.doc.reviewer_overall_remarks,
												target_data: frm.doc.targets,
												competency_data: frm.doc.competencies
											},
											callback: function(res) {
												if (!res.exc) {
													frappe.show_alert({message: __("Reviewer evaluation submitted."), indicator: "green"});
													frm.reload_doc();
												}
											}
										});
									}
								);
							}).addClass("btn-primary text-white").css("background-color", "#15803d");
						} else {
							frm.disable_form();
						}
					}

					// 5. Stage: Reviewer Resolved - Pending Employee Decision
					else if (app_status === "Reviewer Resolved - Pending Employee Decision") {
						frm.disable_form();
						if (is_my_doc || is_admin) {
							frm.page.add_inner_button(__("Accept Reviewer Decision"), function() {
								frappe.confirm(
									__("Accept the Reviewer's final evaluation?"),
									function() {
										frappe.call({
											method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.accept_reviewer_decision",
											args: { docname: frm.doc.name },
											callback: function(res) {
												if (!res.exc) {
													frappe.show_alert({message: __("Reviewer decision accepted."), indicator: "green"});
													frm.reload_doc();
												}
											}
										});
									}
								);
							}).addClass("btn-success text-white").css("background-color", "#28a745");

							frm.page.add_inner_button(__("Request PERC Review"), function() {
								frappe.prompt(
									{
										fieldtype: "Small Text",
										fieldname: "justification",
										label: __("Grievance Justification for PERC Committee"),
										reqd: 1
									},
									function(values) {
										frappe.call({
											method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.request_perc_review",
											args: {
												docname: frm.doc.name,
												justification: values.justification
											},
											callback: function(res) {
												if (!res.exc) {
													frappe.show_alert({message: __("PERC Case opened successfully."), indicator: "orange"});
													frm.reload_doc();
												}
											}
										});
									},
									__("Request PERC Escalation"),
									__("Submit Request")
								);
							}).addClass("btn-warning text-dark");
						}
					}

					// 6. Stage: Under PERC Review
					else if (app_status === "Under PERC Review") {
						frm.disable_form();
					}

					// 7. Stage: Appraisal Accepted
					else if (app_status === "Appraisal Accepted") {
						frm.disable_form();
					}

					// Common Actions for HR Admin in Appraisal Phase
					if (is_admin) {
						if (["Appraisal Accepted", "Under PERC Review", "Reviewer Resolved - Pending Employee Decision"].includes(app_status)) {
							frm.page.add_inner_button(__("Lock Appraisal"), function() {
								frappe.prompt(
									{
										fieldtype: "Float",
										fieldname: "final_score",
										label: __("Confirmed Final Score (Optional Override)"),
										default: frm.doc.total_score || 0
									},
									function(values) {
										frappe.call({
											method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.lock_appraisal",
											args: {
												docname: frm.doc.name,
												final_score: values.final_score
											},
											callback: function(res) {
												if (!res.exc) {
													frappe.show_alert({message: __("Appraisal finalized and locked."), indicator: "green"});
													frm.reload_doc();
												}
											}
										});
									},
									__("Lock Appraisal"),
									__("Confirm & Lock")
								);
							}).addClass("btn-dark text-white");
						}

						if (frm.doc.perc_case) {
							frm.page.add_inner_button(__("View PERC Case"), function() {
								frappe.set_route("Form", "PERC Case", frm.doc.perc_case);
							});
						}

						if (app_status === "Finalized & Locked" || frm.doc.locked) {
							frm.page.add_inner_button(__("Upload to Employee Master"), function() {
								frappe.confirm(
									__("Upload/Sync this finalized evaluation to Employee Master for <b>{0}</b>?", [frm.doc.employee_name || frm.doc.employee]),
									function() {
										frappe.call({
											method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.sync_appraisal_to_employee_master",
											args: { docname: frm.doc.name },
											freeze: true,
											freeze_message: __("Uploading to Employee Master..."),
											callback: function(res) {
												if (!res.exc) {
													frappe.show_alert({
														message: res.message || __("Evaluation uploaded to Employee Master successfully."),
														indicator: "green"
													});
												}
											}
										});
									}
								);
							}).addClass("btn-primary text-white");
						}
					}
					return;
				}

				// =============================================================
				// CASE B: PLANNING & MONITORING PHASE (Original Flow)
				// =============================================================
				update_grade_group_display(frm);

				// Lock form targets and competencies when Approved and in Monitoring or subsequent stage
				if (["Approved", "Amendment In Progress", "Appraisal Open", "Finalized & Locked"].includes(frm.doc.plan_status)) {
					frm.set_df_property("targets", "read_only", 1);
					frm.set_df_property("competencies", "read_only", 1);
				}

				// 1. DRAFT or RETURNED stage
				let is_draft_or_ret_plan = (frm.is_new() || frm.doc.plan_status === "Draft" || frm.doc.plan_status === "Rejected" || frm.doc.plan_status === "Returned" || frm.doc.plan_status === "Returned by Supervisor" || frm.doc.plan_status === "Returned by Reviewer");
				if (is_draft_or_ret_plan) {
					if (frm.is_new() || is_my_doc || is_admin) {
						frm.set_df_property("targets", "read_only", 0);
						frm.set_df_property("competencies", "read_only", 0);
						apply_reviews_permissions(frm, is_admin, is_admin);
						frm.enable_save();

						update_grade_group_display(frm);

						if (!frm.is_new()) {
							let is_resubmit = Boolean(frm.doc.first_submission_done || frm.doc.plan_revision_remark || frm.doc.plan_rejection_remark || frm.doc.plan_revision_changes);
							let btn_title = is_resubmit ? __("Resubmit for Approval") : __("Send for Approval");
							frm.page.add_inner_button(btn_title, () => {
								// Validation: Employee must tick declaration before sending
								if (!frm.doc.plan_agreement) {
									let msg = !frm.doc.first_submission_done
										? __("Please review the <b>Performance Plan Discussion & Agreement</b> section below and <b>tick one of the options</b> before sending for approval.")
										: __("Please review the <b>Performance Plan Discussion & Agreement</b> section below and <b>tick the declaration</b> agreeing to the goals before resubmitting.");
									frappe.msgprint({
										title: __("Declaration Required"),
										message: msg,
										indicator: "orange"
									});
									if (frm.fields_dict["plan_agreement_section"]) {
										frappe.utils.scroll_to(frm.fields_dict["plan_agreement_section"].wrapper);
									}
									return;
								}

								let proceed_send_approval = () => {
									frappe.call({
										method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.send_for_approval",
										args: { docname: frm.doc.name },
										freeze: true,
										freeze_message: __("Sending Performance Plan for approval..."),
										callback: function(res) {
											if (!res.exc) {
												frappe.show_alert({message: __('Performance Plan sent for approval successfully.'), indicator: 'green'});
												frm.reload_doc();
											}
										}
									});
								};

								if (frm.is_dirty()) {
									let d = new frappe.ui.Dialog({
										title: __("Unsaved Changes Detected"),
										indicator: "orange",
										fields: [
											{
												fieldtype: "HTML",
												fieldname: "unsaved_warning",
												options: `
													<div style="font-size: 13.5px; line-height: 1.6; color: #1e293b; padding: 6px 0;">
														<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: #b45309; font-weight: 700; font-size: 14.5px;">
															<i class="fa fa-exclamation-triangle" style="font-size: 17px;"></i>
															<span>Action Required</span>
														</div>
														<p style="margin-bottom: 10px;">
															You have modified your Performance Plan without saving. If you send for approval without saving, <b>your recent changes will be lost</b>.
														</p>
														<p style="margin-bottom: 0; color: #64748b; font-size: 12.5px;">
															Please save your changes first, or click <b>Save & Send for Approval</b> to save and proceed automatically.
														</p>
													</div>
												`
											}
										],
										primary_action_label: __("Save & Send for Approval"),
										primary_action: function() {
											d.hide();
											frm.save().then(() => {
												if (!frm.is_dirty()) {
													proceed_send_approval();
												}
											});
										},
										secondary_action_label: __("Review Changes"),
										secondary_action: function() {
											d.hide();
											frappe.show_alert({
												message: __("Submission paused. Please review and save your changes."),
												indicator: "orange"
											});
										}
									});
									d.show();
									return;
								}

								let confirm_msg = "";
								if (frm.doc.plan_agreement === "Initial Proposed") {
									confirm_msg = __("Are you sure you want to submit your initial proposed Performance Plan to <b>{0}</b> for discussion and approval?", [frm.doc.supervisor_name || frm.doc.supervisor_snapshot || __("your Supervisor")]);
								} else if (frm.doc.plan_agreement === "Disagreed") {
									confirm_msg = __("You have ticked that you <b>do not agree</b> to the goals on which performance will be evaluated. Your Performance Plan will be submitted to your Supervisor (<b>{0}</b>) for discussion and review, and HR will be notified to assist in finalization.<br><br>Do you wish to proceed?", [frm.doc.supervisor_name || frm.doc.supervisor_snapshot || __("your Supervisor")]);
								} else {
									confirm_msg = frm.doc.first_submission_done
										? __("Are you sure you want to resubmit your agreed Performance Plan to <b>{0}</b> for approval?", [frm.doc.supervisor_name || frm.doc.supervisor_snapshot || __("your Supervisor")])
										: __("Are you sure you want to submit your agreed Performance Plan to <b>{0}</b> for approval?", [frm.doc.supervisor_name || frm.doc.supervisor_snapshot || __("your Supervisor")]);
								}

								frappe.confirm(
									confirm_msg,
									function() {
										proceed_send_approval();
									}
								);
							}).addClass("btn-primary text-white").css("background-color", "#2490ef");
						}
					} else {
						frm.set_df_property("targets", "read_only", 1);
						frm.set_df_property("competencies", "read_only", 1);
						frm.disable_form();
					}
					return;
				}

				// 2. PENDING SUPERVISOR APPROVAL stage
				if (frm.doc.plan_status === "Pending Supervisor Approval") {
					if ((is_supervisor && !is_my_doc) || is_admin) {
						frm.set_df_property("targets", "read_only", 0);
						frm.set_df_property("plan_revision_remark", "hidden", 1);
						apply_reviews_permissions(frm, is_supervisor || is_admin, is_admin);
						frm.set_df_property("competencies", "read_only", 1);
						frm.enable_save();

						frm.page.add_inner_button(__("Approve"), () => {
							let current_desc_weight_json = JSON.stringify((frm.doc.targets || []).map(t => ({
								name: t.name || "",
								desc: (t.target_description || "").trim(),
								weight: parseFloat(t.weight || 0)
							})));
							let targets_desc_weight_modified = (frm._original_targets_desc_weight_json && frm._original_targets_desc_weight_json !== current_desc_weight_json);

							if (targets_desc_weight_modified) {
								frappe.msgprint({
									title: __("Cannot Approve Modified Plan"),
									message: __("You have made changes to the targets or weightages. As per PMS policy, any modifications must be returned to the employee for review and acceptance.<br><br>Please use the <b>Return</b> button to send your revisions back to the employee, or reload the page to discard your modifications before approving."),
									indicator: "orange"
								});
								return;
							}

							let confirm_msg = frm.doc.reviewer_snapshot
								? __("Are you sure you want to approve this Performance Plan and forward it to Reviewer (<b>{0}</b>) for approval?", [frm.doc.reviewer_name || frm.doc.reviewer_snapshot || __("the Reviewer")])
								: __("Are you sure you want to approve this Performance Plan and make it active?");

							frappe.confirm(
								confirm_msg,
								function() {
									frappe.call({
										method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.approve_plan",
										args: {
											docname: frm.doc.name,
											targets: JSON.stringify(frm.doc.targets || [])
										},
										freeze: true,
										freeze_message: __("Approving Performance Plan..."),
										callback: function(res) {
											if (!res.exc) {
												frappe.show_alert({message: __('Plan Approved'), indicator: 'green'});
												frm.reload_doc();
											}
										}
									});
								}
							);
						}).addClass("btn-primary text-white").css("background-color", "#28a745");

						frm.page.add_inner_button(__("Return"), () => {
							let current_targets_json = JSON.stringify((frm.doc.targets || []).map(t => ({
								name: t.name || "",
								desc: (t.target_description || "").trim(),
								weight: parseFloat(t.weight || 0),
								target_reviews: (t.target_reviews || "").trim(),
								reviewer_comments: (t.reviewer_comments || "").trim()
							})));
							let targets_modified = (frm._original_targets_json && frm._original_targets_json !== current_targets_json);

							let prompt_title = targets_modified ? __("Return Plan with Modifications") : __("Return Plan to Employee");
							let remark_label = targets_modified ? __("Revision Remarks / Reason for Changes") : __("Return Reason / Remark");

							frappe.prompt(
								{
									fieldtype: "Small Text",
									fieldname: "remark",
									label: remark_label,
									reqd: 1,
									default: frm.doc.plan_revision_remark || frm.doc.plan_rejection_remark || ""
								},
								function(values) {
									if (targets_modified) {
										let boot_w = frappe.boot && frappe.boot.pms_competencies_data && frappe.boot.pms_competencies_data.weights;
										let expected_weight = (boot_w && boot_w[frm.doc.grade_group]) ? boot_w[frm.doc.grade_group].work : ((frm.doc.grade_group === "PS_CS") ? 60 : 50);
										let current_sum = 0;
										(frm.doc.targets || []).forEach(t => { current_sum += flt(t.weight || 0); });
										if (Math.abs(current_sum - expected_weight) > 0.01) {
											frappe.msgprint({
												title: __("Target Weight Validation"),
												message: __(`Total target weight must equal <b>${expected_weight}</b>. Current sum is <b>${current_sum.toFixed(2)}</b>.<br><br>Please adjust the weights to sum to ${expected_weight} before returning.`),
												indicator: "red"
											});
											return;
										}
									}

									frappe.call({
										method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.return_plan",
										args: {
											docname: frm.doc.name,
											remark: values.remark,
											targets: targets_modified ? JSON.stringify(frm.doc.targets) : null
										},
										freeze: true,
										freeze_message: __("Returning plan to employee..."),
										callback: function(res) {
											if (!res.exc) {
												frappe.show_alert({
													message: targets_modified ? __('Plan returned to Employee with modifications') : __('Plan returned to Employee'),
													indicator: 'orange'
												});
												frm.reload_doc();
											}
										}
									});
								},
								prompt_title,
								__("Return")
							);
						}).addClass("btn-danger text-white").css("background-color", "#dc3545");
					} else {
						frm.set_df_property("targets", "read_only", 1);
						frm.set_df_property("competencies", "read_only", 1);
						frm.disable_form();
					}
					return;
				}

				// 3. PENDING REVIEWER APPROVAL stage
				if (frm.doc.plan_status === "Pending Reviewer Approval") {
					if ((is_reviewer && !is_my_doc) || is_admin) {
						frm.set_df_property("targets", "read_only", 0);
						frm.set_df_property("plan_revision_remark", "hidden", 1);
						apply_reviews_permissions(frm, is_admin, is_reviewer || is_admin);
						frm.set_df_property("competencies", "read_only", 1);
						frm.enable_save();

						frm.page.add_inner_button(__("Approve"), () => {
							let current_desc_weight_json = JSON.stringify((frm.doc.targets || []).map(t => ({
								name: t.name || "",
								desc: (t.target_description || "").trim(),
								weight: parseFloat(t.weight || 0)
							})));
							let targets_desc_weight_modified = (frm._original_targets_desc_weight_json && frm._original_targets_desc_weight_json !== current_desc_weight_json);

							if (targets_desc_weight_modified) {
								frappe.msgprint({
									title: __("Cannot Approve Modified Plan"),
									message: __("You have made changes to the targets or weightages. As per PMS policy, any modifications must be returned to the employee for review and acceptance.<br><br>Please use the <b>Return</b> button to send your revisions back to the employee, or reload the page to discard your modifications before approving."),
									indicator: "orange"
								});
								return;
							}

							let confirm_msg = __("Are you sure you want to approve this Performance Plan and make it active?");

							frappe.confirm(
								confirm_msg,
								function() {
									frappe.call({
										method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.approve_plan",
										args: {
											docname: frm.doc.name,
											targets: JSON.stringify(frm.doc.targets || [])
										},
										freeze: true,
										freeze_message: __("Approving Performance Plan..."),
										callback: function(res) {
											if (!res.exc) {
												frappe.show_alert({message: __('Plan Approved'), indicator: 'green'});
												frm.reload_doc();
											}
										}
									});
								}
							);
						}).addClass("btn-primary text-white").css("background-color", "#28a745");

						frm.page.add_inner_button(__("Return"), () => {
							let current_targets_json = JSON.stringify((frm.doc.targets || []).map(t => ({
								name: t.name || "",
								desc: (t.target_description || "").trim(),
								weight: parseFloat(t.weight || 0),
								target_reviews: (t.target_reviews || "").trim(),
								reviewer_comments: (t.reviewer_comments || "").trim()
							})));
							let targets_modified = (frm._original_targets_json && frm._original_targets_json !== current_targets_json);

							let prompt_title = targets_modified ? __("Return Plan with Modifications") : __("Return Plan to Employee");
							let remark_label = targets_modified ? __("Revision Remarks / Reason for Changes") : __("Return Reason / Remark");

							frappe.prompt(
								{
									fieldtype: "Small Text",
									fieldname: "remark",
									label: remark_label,
									reqd: 1,
									default: frm.doc.plan_revision_remark || frm.doc.plan_rejection_remark || ""
								},
								function(values) {
									if (targets_modified) {
										let boot_w = frappe.boot && frappe.boot.pms_competencies_data && frappe.boot.pms_competencies_data.weights;
										let expected_weight = (boot_w && boot_w[frm.doc.grade_group]) ? boot_w[frm.doc.grade_group].work : ((frm.doc.grade_group === "PS_CS") ? 60 : 50);
										let current_sum = 0;
										(frm.doc.targets || []).forEach(t => { current_sum += flt(t.weight || 0); });
										if (Math.abs(current_sum - expected_weight) > 0.01) {
											frappe.msgprint({
												title: __("Target Weight Validation"),
												message: __(`Total target weight must equal <b>${expected_weight}</b>. Current sum is <b>${current_sum.toFixed(2)}</b>.<br><br>Please adjust the weights to sum to ${expected_weight} before returning.`),
												indicator: "red"
											});
											return;
										}
									}

									frappe.call({
										method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.return_plan",
										args: {
											docname: frm.doc.name,
											remark: values.remark,
											targets: targets_modified ? JSON.stringify(frm.doc.targets) : null
										},
										freeze: true,
										freeze_message: __("Returning plan to employee..."),
										callback: function(res) {
											if (!res.exc) {
												frappe.show_alert({
													message: targets_modified ? __('Plan returned to Employee with modifications') : __('Plan returned to Employee'),
													indicator: 'orange'
												});
												frm.reload_doc();
											}
										}
									});
								},
								prompt_title,
								__("Return")
							);
						}).addClass("btn-danger text-white").css("background-color", "#dc3545");
					} else {
						frm.set_df_property("targets", "read_only", 1);
						frm.set_df_property("competencies", "read_only", 1);
						frm.disable_form();
					}
					return;
				}

				// 4. APPROVED / MONITORING stage
				if (frm.doc.plan_status === "Approved" || ["Amendment In Progress", "Appraisal Open", "Finalized & Locked"].includes(frm.doc.plan_status)) {
					frm.disable_form();
					if (frm.doc.workflow_state === "Monitoring") {
						// HR Admin Action: Activate Appraisal Phase
						if (is_admin) {
							frm.page.add_inner_button(__("Activate Appraisal Phase"), function() {
								frappe.confirm(
									__("Activate Appraisal Phase for this Performance Plan? Mapped competencies and scoring tables will become available for Employee Self-Assessment."),
									function() {
										frappe.call({
											method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.activate_appraisal_phase",
											args: { docname: frm.doc.name },
											callback: function(res) {
												if (!res.exc) {
													frappe.show_alert({message: __("Appraisal Phase Activated."), indicator: "green"});
													frm.reload_doc();
												}
											}
										});
									}
								);
							}).addClass("btn-success text-white").css("background-color", "#15803d");

							// Amendment Window Controls
							if (!frm.doc.amendment_window_open) {
								frm.page.add_inner_button(__("Open Amendment Window"), function() {
									frappe.call({
										method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.open_amendment_window",
										args: { docname: frm.doc.name },
										callback: function(res) {
											if (!res.exc) {
												frappe.show_alert({message: __("Amendment Window opened. Draft amendment created."), indicator: "green"});
												frm.reload_doc();
											}
										}
									});
								}).addClass("btn-warning text-dark");
							} else {
								frm.page.add_inner_button(__("Close Amendment Window"), function() {
									frappe.call({
										method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.close_amendment_window",
										args: { docname: frm.doc.name },
										callback: function(res) {
											if (!res.exc) {
												frappe.show_alert({message: __("Amendment Window closed."), indicator: "orange"});
												frm.reload_doc();
											}
										}
									});
								}).addClass("btn-danger text-white");
							}
						}

						// View Plan Amendment button if an amendment exists for this Performance Plan (Request Amendment button removed)
						frappe.db.get_list("PMS Plan Amendment", {
							filters: { performance_plan: frm.doc.name },
							fields: ["name", "status"],
							limit: 1,
							order_by: "creation desc"
						}).then(amends => {
							if (amends && amends.length > 0) {
								frm.page.add_inner_button(__("View Plan Amendment"), function() {
									frappe.set_route("Form", "PMS Plan Amendment", amends[0].name);
								}).addClass("btn-primary text-white").css("background-color", "#2563eb");
							}
						});
					}
					return;
				}
			}
		});
	},

	targets_add: function(frm) {
		if (frm._is_appraisal_mode) {
			update_live_appraisal_scores(frm);
		} else {
			let is_admin = frm._is_admin || false;
			let is_supervisor = frm._is_supervisor || false;
			let is_reviewer = frm._is_reviewer || false;
			let is_my_doc = frm._is_my_doc !== undefined ? frm._is_my_doc : true;
			let can_edit_sup = false;
			let can_edit_rev = false;
			if (!is_my_doc) {
				if (is_admin) {
					can_edit_sup = true;
					can_edit_rev = true;
				} else if (is_supervisor && frm.doc.plan_status === "Pending Supervisor Approval") {
					can_edit_sup = true;
				} else if (is_reviewer && frm.doc.plan_status === "Pending Reviewer Approval") {
					can_edit_rev = true;
				}
			}
			apply_reviews_permissions(frm, can_edit_sup, can_edit_rev);
		}
	},
	targets_remove: function(frm) {
		if (frm._is_appraisal_mode) update_live_appraisal_scores(frm);
	},
	competencies_add: function(frm) {
		if (frm._is_appraisal_mode) update_live_appraisal_scores(frm);
	},
	competencies_remove: function(frm) {
		if (frm._is_appraisal_mode) update_live_appraisal_scores(frm);
	}
});

frappe.ui.form.on("PMS Target", {
	weight: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row && row.weight != null) {
			row.weight = flt(row.weight, 2);
			frm.refresh_field("targets");
		}
	},

	form_render: function(frm, cdt, cdn) {
		let is_app = frm._is_appraisal_mode;
		let grid_row = frm.fields_dict["targets"] && frm.fields_dict["targets"].grid.grid_rows_by_docname[cdn];
		if (!grid_row) return;

		const scoring_cols = ["self_score", "self_remark", "evidence", "supervisor_score", "supervisor_remark", "reviewer_score", "reviewer_remark"];
		grid_row.toggle_display("remark", false);

		if (!is_app) {
			scoring_cols.forEach(f => grid_row.toggle_display(f, false));
			let is_admin = frm._is_admin !== undefined ? frm._is_admin : (frappe.user_roles.includes("System Manager") || frappe.user_roles.includes("HR Admin") || frappe.user_roles.includes("HR Manager"));
			let current_emp = frm._current_emp;
			let is_my_doc = frm._is_my_doc !== undefined ? frm._is_my_doc : (frm.is_new() || (current_emp && (current_emp === frm.doc.employee)));
			let is_supervisor = frm._is_supervisor !== undefined ? frm._is_supervisor : ((current_emp && current_emp === frm.doc.supervisor_snapshot) || is_admin);
			let is_reviewer = frm._is_reviewer !== undefined ? frm._is_reviewer : ((current_emp && current_emp === frm.doc.reviewer_snapshot) || is_admin);

			let is_draft_or_ret = (frm.doc.plan_status === "Draft" || frm.doc.plan_status === "Returned by Supervisor" || frm.doc.plan_status === "Returned by Reviewer" || frm.doc.plan_status === "Returned" || frm.doc.plan_status === "Rejected");
			let can_edit_targets = false;
			if (frm.is_new() || (is_draft_or_ret && (is_my_doc || is_admin))) {
				can_edit_targets = true;
			} else if (frm.doc.plan_status === "Pending Supervisor Approval" && ((is_supervisor && !is_my_doc) || is_admin)) {
				can_edit_targets = true;
			} else if (frm.doc.plan_status === "Pending Reviewer Approval" && ((is_reviewer && !is_my_doc) || is_admin)) {
				can_edit_targets = true;
			}

			if (grid_row.toggle_editable) {
				grid_row.toggle_editable("target_description", can_edit_targets);
				grid_row.toggle_editable("weight", can_edit_targets);
			} else if (grid_row.toggle_enable) {
				grid_row.toggle_enable("target_description", can_edit_targets);
				grid_row.toggle_enable("weight", can_edit_targets);
			}

			let can_edit_sup_comments = false;
			let can_edit_rev_comments = false;
			if (!is_my_doc) {
				if (is_admin) {
					can_edit_sup_comments = true;
					can_edit_rev_comments = true;
				} else if (is_supervisor && frm.doc.plan_status === "Pending Supervisor Approval") {
					can_edit_sup_comments = true;
				} else if (is_reviewer && frm.doc.plan_status === "Pending Reviewer Approval") {
					can_edit_rev_comments = true;
				}
			}
			if (grid_row.toggle_editable) {
				grid_row.toggle_editable("target_reviews", can_edit_sup_comments);
				grid_row.toggle_editable("reviewer_comments", can_edit_rev_comments);
			} else if (grid_row.toggle_enable) {
				grid_row.toggle_enable("target_reviews", can_edit_sup_comments);
				grid_row.toggle_enable("reviewer_comments", can_edit_rev_comments);
			}
		} else {
			let app_status = frm.doc.appraisal_status || "Self-Assessment Pending";
			let is_self_stage = (app_status === "Self-Assessment Pending");
			let is_sup_stage = (app_status === "Pending Supervisor Review");
			let is_rev_stage = (app_status === "Disputed - Pending Reviewer" || app_status === "Pending Reviewer Review");

			let is_admin = frappe.user_roles.includes("System Manager") || frappe.user_roles.includes("HR Admin") || frappe.user_roles.includes("HR Manager");
			let current_emp = frm._current_emp;
			let is_supervisor = (current_emp && current_emp === frm.doc.supervisor_snapshot) || is_admin;
			let is_reviewer = (current_emp && current_emp === frm.doc.reviewer_snapshot) || is_admin;
			let is_employee = (current_emp && current_emp === frm.doc.employee) || is_admin;

			grid_row.toggle_enable("target_description", false);
			grid_row.toggle_enable("weight", false);

			// Self scoring
			grid_row.toggle_display("self_score", true);
			grid_row.toggle_display("self_remark", true);
			grid_row.toggle_display("evidence", true);
			let can_edit_self = is_self_stage && is_employee;
			grid_row.toggle_enable("self_score", can_edit_self);
			grid_row.toggle_enable("self_remark", can_edit_self);
			grid_row.toggle_enable("evidence", can_edit_self);

			// Supervisor scoring
			let show_super = (!is_self_stage);
			grid_row.toggle_display("supervisor_score", show_super);
			grid_row.toggle_display("supervisor_remark", show_super);
			let can_edit_sup = is_sup_stage && is_supervisor;
			grid_row.toggle_enable("supervisor_score", can_edit_sup);
			grid_row.toggle_enable("supervisor_remark", can_edit_sup);

			// Reviewer scoring
			let show_rev = (is_rev_stage || app_status.includes("Reviewer") || app_status.includes("PERC") || app_status === "Appraisal Accepted" || app_status === "Finalized & Locked");
			grid_row.toggle_display("reviewer_score", show_rev);
			grid_row.toggle_display("reviewer_remark", show_rev);
			let can_edit_rev = is_rev_stage && is_reviewer;
			grid_row.toggle_enable("reviewer_score", can_edit_rev);
			grid_row.toggle_enable("reviewer_remark", can_edit_rev);
		}
	},
	reviewer_score: function(frm, cdt, cdn) {
		let app_status = frm.doc.appraisal_status;
		let is_admin = frappe.user_roles.includes("System Manager");
		if (app_status !== "Disputed - Pending Reviewer" && app_status !== "Pending Reviewer Review" && !is_admin) {
			frappe.model.set_value(cdt, cdn, "reviewer_score", 0);
			frappe.msgprint({
				title: __("Not Allowed"),
				indicator: "red",
				message: __("Only the assigned Reviewer can enter or edit Reviewer Score during the reviewer stage.")
			});
		} else {
			let row = locals[cdt][cdn];
			if (row && row.reviewer_score != null) {
				row.reviewer_score = flt(row.reviewer_score, 2);
			}
			update_live_appraisal_scores(frm);
		}
	},
	supervisor_score: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row && row.supervisor_score != null) {
			row.supervisor_score = flt(row.supervisor_score, 2);
		}
		update_live_appraisal_scores(frm);
	},
	reviewer_remark: function(frm, cdt, cdn) {
		let app_status = frm.doc.appraisal_status;
		let is_admin = frappe.user_roles.includes("System Manager");
		if (app_status !== "Disputed - Pending Reviewer" && app_status !== "Pending Reviewer Review" && !is_admin) {
			frappe.model.set_value(cdt, cdn, "reviewer_remark", "");
			frappe.msgprint({
				title: __("Not Allowed"),
				indicator: "red",
				message: __("Only the assigned Reviewer can enter or edit Reviewer Remark.")
			});
		}
	},
	self_score: function(frm, cdt, cdn) {
		let app_status = frm.doc.appraisal_status;
		let is_admin = frappe.user_roles.includes("System Manager");
		if (app_status !== "Self-Assessment Pending" && !is_admin) {
			frappe.msgprint({
				title: __("Not Allowed"),
				indicator: "red",
				message: __("Self-Assessment score cannot be edited at this stage.")
			});
			frm.reload_doc();
			return;
		}
		let row = locals[cdt][cdn];
		if (row && row.self_score != null) {
			row.self_score = flt(row.self_score, 2);
		}
		update_live_appraisal_scores(frm);
	},
	evidence: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row && row.evidence) {
			let clean = String(row.evidence).split("?")[0].toLowerCase().trim();
			if (!clean.endsWith(".pdf")) {
				frappe.model.set_value(cdt, cdn, "evidence", "");
				frappe.msgprint({
					title: __("Invalid File Format"),
					indicator: "red",
					message: __("Only PDF files are allowed for Supporting Docs. Please upload a valid .pdf file.")
				});
			}
		}
	}
});

frappe.ui.form.on("PMS Competency Score", {
	form_render: function(frm, cdt, cdn) {
		let is_app = frm._is_appraisal_mode;
		let grid_row = frm.fields_dict["competencies"] && frm.fields_dict["competencies"].grid.grid_rows_by_docname[cdn];
		if (!grid_row) return;

		const scoring_cols = ["self_rating", "self_remark", "supervisor_rating", "supervisor_remark", "reviewer_rating", "reviewer_remark"];

		if (!is_app) {
			scoring_cols.forEach(f => grid_row.toggle_display(f, false));
			grid_row.toggle_enable("competency", false);
			grid_row.toggle_enable("definition", false);
			grid_row.toggle_enable("weight", false);
		} else {
			let app_status = frm.doc.appraisal_status || "Self-Assessment Pending";
			let is_self_stage = (app_status === "Self-Assessment Pending");
			let is_sup_stage = (app_status === "Pending Supervisor Review");
			let is_rev_stage = (app_status === "Disputed - Pending Reviewer" || app_status === "Pending Reviewer Review");

			let is_admin = frappe.user_roles.includes("System Manager") || frappe.user_roles.includes("HR Admin") || frappe.user_roles.includes("HR Manager");
			let current_emp = frm._current_emp;
			let is_supervisor = (current_emp && current_emp === frm.doc.supervisor_snapshot) || is_admin;
			let is_reviewer = (current_emp && current_emp === frm.doc.reviewer_snapshot) || is_admin;
			let is_employee = (current_emp && current_emp === frm.doc.employee) || is_admin;

			grid_row.toggle_enable("competency", false);
			grid_row.toggle_enable("definition", false);
			grid_row.toggle_enable("weight", false);

			// Self rating
			grid_row.toggle_display("self_rating", true);
			grid_row.toggle_display("self_remark", true);
			let can_edit_self = is_self_stage && is_employee;
			grid_row.toggle_enable("self_rating", can_edit_self);
			grid_row.toggle_enable("self_remark", can_edit_self);

			// Supervisor rating
			let show_super = (!is_self_stage);
			grid_row.toggle_display("supervisor_rating", show_super);
			grid_row.toggle_display("supervisor_remark", show_super);
			let can_edit_sup = is_sup_stage && is_supervisor;
			grid_row.toggle_enable("supervisor_rating", can_edit_sup);
			grid_row.toggle_enable("supervisor_remark", can_edit_sup);

			// Reviewer rating
			let show_rev = (is_rev_stage || app_status.includes("Reviewer") || app_status.includes("PERC") || app_status === "Appraisal Accepted" || app_status === "Finalized & Locked");
			grid_row.toggle_display("reviewer_rating", show_rev);
			grid_row.toggle_display("reviewer_remark", show_rev);
			let can_edit_rev = is_rev_stage && is_reviewer;
			grid_row.toggle_enable("reviewer_rating", can_edit_rev);
			grid_row.toggle_enable("reviewer_remark", can_edit_rev);
		}
	},
	reviewer_rating: function(frm, cdt, cdn) {
		let app_status = frm.doc.appraisal_status;
		let is_admin = frappe.user_roles.includes("System Manager");
		if (app_status !== "Disputed - Pending Reviewer" && app_status !== "Pending Reviewer Review" && !is_admin) {
			frappe.model.set_value(cdt, cdn, "reviewer_rating", 0);
			frappe.msgprint({
				title: __("Not Allowed"),
				indicator: "red",
				message: __("Only the assigned Reviewer can enter or edit Reviewer Rating during the reviewer stage.")
			});
		} else {
			let row = locals[cdt][cdn];
			if (row && row.reviewer_rating != null) {
				row.reviewer_rating = flt(row.reviewer_rating, 2);
			}
			update_live_appraisal_scores(frm);
		}
	},
	supervisor_rating: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row && row.supervisor_rating != null) {
			row.supervisor_rating = flt(row.supervisor_rating, 2);
		}
		update_live_appraisal_scores(frm);
	},
	reviewer_remark: function(frm, cdt, cdn) {
		let app_status = frm.doc.appraisal_status;
		let is_admin = frappe.user_roles.includes("System Manager");
		if (app_status !== "Disputed - Pending Reviewer" && app_status !== "Pending Reviewer Review" && !is_admin) {
			frappe.model.set_value(cdt, cdn, "reviewer_remark", "");
			frappe.msgprint({
				title: __("Not Allowed"),
				indicator: "red",
				message: __("Only the assigned Reviewer can enter or edit Reviewer Remark.")
			});
		}
	},
	self_rating: function(frm, cdt, cdn) {
		let app_status = frm.doc.appraisal_status;
		let is_admin = frappe.user_roles.includes("System Manager");
		if (app_status !== "Self-Assessment Pending" && !is_admin) {
			frappe.msgprint({
				title: __("Not Allowed"),
				indicator: "red",
				message: __("Self-Assessment rating cannot be edited at this stage.")
			});
			frm.reload_doc();
			return;
		}
		let row = locals[cdt][cdn];
		if (row && row.self_rating != null) {
			row.self_rating = flt(row.self_rating, 2);
		}
		update_live_appraisal_scores(frm);
	}
});

