frappe.ui.form.on("PMS Plan Amendment", {
    setup: function(frm) {
        // Apply theme styling classes
        if (frm.page && frm.page.wrapper) {
            frm.page.wrapper.addClass('gdl-pms-plan-mode');
        }
        $('body').addClass('gdl-pms-plan-mode');
    },

    refresh: function(frm) {
        if (frm.page && frm.page.wrapper) {
            frm.page.wrapper.addClass('gdl-pms-plan-mode');
        }
        $('body').addClass('gdl-pms-plan-mode');

        // Ensure performance_plan is strictly read-only
        frm.set_df_property("performance_plan", "read_only", 1);

        // Ensure raw JSON code field is hidden
        frm.set_df_property("previous_targets", "hidden", 1);

        // Hide Employee & Reporting Line Reference section completely
        frm.set_df_property("sec_employee_details", "hidden", 1);

        // Hide Total Weights Summary section completely
        frm.set_df_property("sec_weights", "hidden", 1);

        // Collapse remarks section if both remarks are empty
        let has_remarks = !!(frm.doc.supervisor_remark || frm.doc.reviewer_remark);
        if (!has_remarks && frm.doc.status === "Draft") {
            frm.set_df_property("sec_remarks", "collapsed", 1);
        } else {
            frm.set_df_property("sec_remarks", "collapsed", 0);
        }

        // Render Hero Card Header
        render_amendment_hero_card(frm);

        // Render previous targets snapshot table
        render_previous_targets_table(frm);

        // Snapshot initial revised_targets state for modification tracking
        frm._original_targets_desc_weight_json = JSON.stringify((frm.doc.revised_targets || []).map(t => ({
            name: t.name || "",
            desc: (t.target_description || "").trim(),
            weight: parseFloat(t.weight || 0)
        })));

        frm._original_targets_json = JSON.stringify((frm.doc.revised_targets || []).map(t => ({
            name: t.name || "",
            desc: (t.target_description || "").trim(),
            weight: parseFloat(t.weight || 0),
            target_reviews: (t.target_reviews || "").trim()
        })));

        // Configure revised_targets child table
        configure_revised_targets_grid(frm);

        if (frm.is_new()) {
            frm.set_df_property("reason", "read_only", 0);
            frm.set_df_property("revised_targets", "read_only", 0);
            if (frm.fields_dict["revised_targets"] && frm.fields_dict["revised_targets"].grid) {
                let tg = frm.fields_dict["revised_targets"].grid;
                tg.cannot_add_rows = false;
                tg.update_docfield_property("target_description", "read_only", 0);
                tg.update_docfield_property("weight", "read_only", 0);
                tg.update_docfield_property("target_reviews", "read_only", 1);
                tg.update_docfield_property("reviewer_comments", "read_only", 1);
            }
            return;
        }

        // Custom action buttons based on status & current logged-in role
        frappe.call({
            method: "gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal.get_current_employee",
            callback: function(r) {
                let current_emp = r && r.message && r.message.name;
                let is_admin = frappe.user_roles.includes("System Manager") || frappe.user_roles.includes("HR Admin") || frappe.user_roles.includes("HR Manager") || frappe.session.user === "Administrator";
                let is_employee = (current_emp && current_emp === frm.doc.employee) || is_admin;
                let is_supervisor = (current_emp && current_emp === frm.doc.supervisor_snapshot) || is_admin;
                let is_reviewer = (current_emp && current_emp === frm.doc.reviewer_snapshot) || is_admin;

                frm._current_emp = current_emp;
                frm._is_admin = is_admin;
                frm._is_employee = is_employee;
                frm._is_supervisor = is_supervisor;
                frm._is_reviewer = is_reviewer;

                // Setup field & table permissions based on role & status
                setup_amendment_permissions(frm);

                // 1. Submit for Approval (Only for Employee/Admin when in Draft, Rejected, or Returned)
                if (frm.doc.status === "Draft" || frm.doc.status === "Rejected" || frm.doc.status === "Returned") {
                    if (is_employee) {
                        frm.add_custom_button(__("Submit for Approval"), function() {
                            if (!frm.doc.reason || !frm.doc.reason.trim()) {
                                frappe.msgprint({
                                    title: __("Reason Required"),
                                    message: __("Reason for Amendment is mandatory before submission. Please enter a reason."),
                                    indicator: "orange"
                                });
                                frm.scroll_to_field("reason");
                                return;
                            }

                            let proceed_submit = () => {
                                frappe.confirm(
                                    __("Are you sure you want to submit this Amendment for Supervisor approval?"),
                                    function() {
                                        frappe.call({
                                            method: "gdl_pms.gdl_pms.doctype.pms_plan_amendment.pms_plan_amendment.submit_amendment",
                                            args: { docname: frm.doc.name },
                                            freeze: true,
                                            freeze_message: __("Submitting Amendment for approval..."),
                                            callback: function(res) {
                                                if (!res.exc) {
                                                    frappe.show_alert({message: __("Amendment submitted for approval."), indicator: "green"});
                                                    frm.reload_doc();
                                                }
                                            }
                                        });
                                    }
                                );
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
                                                        You have modified your Amendment without saving. If you send for approval without saving, <b>your recent changes will be lost</b>.
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
                                                proceed_submit();
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

                            proceed_submit();
                        }).addClass("btn-primary text-white").css("background-color", "#2490ef");
                    }
                }

                // 2. Pending Supervisor / Reviewer Approval
                let can_approve = false;
                let role_label = "";
                if (frm.doc.status === "Pending Supervisor Approval" && is_supervisor) {
                    can_approve = true;
                    role_label = __("Supervisor");
                } else if (frm.doc.status === "Pending Reviewer Approval" && is_reviewer) {
                    can_approve = true;
                    role_label = __("Reviewer");
                }

                if (can_approve) {
                    // Approve Button
                    frm.add_custom_button(__("Approve Amendment"), function() {
                        let current_desc_weight_json = JSON.stringify((frm.doc.revised_targets || []).map(t => ({
                            name: t.name || "",
                            desc: (t.target_description || "").trim(),
                            weight: parseFloat(t.weight || 0)
                        })));
                        let targets_desc_weight_modified = (frm._original_targets_desc_weight_json && frm._original_targets_desc_weight_json !== current_desc_weight_json);

                        if (targets_desc_weight_modified) {
                            frappe.msgprint({
                                title: __("Cannot Approve Modified Amendment"),
                                message: __("You have made changes to the targets or weightages. As per PMS policy, any modifications must be returned to the employee for review and acceptance.<br><br>Please use the <b>Return Amendment</b> button to send your revisions back to the employee, or reload the page to discard your modifications before approving."),
                                indicator: "orange"
                            });
                            return;
                        }

                        frappe.confirm(__("Are you sure you want to approve this target amendment as {0}?", [role_label]), function() {
                            frappe.call({
                                method: "gdl_pms.gdl_pms.doctype.pms_plan_amendment.pms_plan_amendment.approve_amendment",
                                args: {
                                    docname: frm.doc.name,
                                    revised_targets: JSON.stringify(frm.doc.revised_targets || [])
                                },
                                freeze: true,
                                freeze_message: __("Approving Amendment..."),
                                callback: function(res) {
                                    if (!res.exc) {
                                        frappe.msgprint(__("Amendment Approved successfully."));
                                        frm.reload_doc();
                                    }
                                }
                            });
                        });
                    }).addClass("btn-success");

                    // Return Button
                    frm.add_custom_button(__("Return Amendment"), function() {
                        let current_targets_json = JSON.stringify((frm.doc.revised_targets || []).map(t => ({
                            name: t.name || "",
                            desc: (t.target_description || "").trim(),
                            weight: parseFloat(t.weight || 0),
                            target_reviews: (t.target_reviews || "").trim()
                        })));
                        let targets_modified = (frm._original_targets_json && frm._original_targets_json !== current_targets_json);

                        let prompt_title = targets_modified ? __("Return Amendment with Modifications") : __("Return Amendment to Employee");
                        let remark_label = targets_modified ? __("Revision Remarks / Reason for Changes") : __("Return Reason / Remark");

                        frappe.prompt([
                            {
                                fieldname: "remark",
                                fieldtype: "Small Text",
                                label: remark_label,
                                reqd: 1,
                                default: (role_label === "Supervisor" ? frm.doc.supervisor_remark : frm.doc.reviewer_remark) || ""
                            }
                        ], function(values) {
                            if (targets_modified) {
                                let boot_w = frappe.boot && frappe.boot.pms_competencies_data && frappe.boot.pms_competencies_data.weights;
                                let expected_weight = (boot_w && boot_w[frm.doc.grade_group]) ? boot_w[frm.doc.grade_group].work : ((frm.doc.grade_group === "PS_CS") ? 60 : 50);
                                let current_sum = 0;
                                (frm.doc.revised_targets || []).forEach(t => { current_sum += flt(t.weight || 0); });
                                if (Math.abs(current_sum - expected_weight) > 0.01) {
                                    frappe.msgprint({
                                        title: __("Target Weight Validation"),
                                        message: __(`Total revised target weight must equal <b>${expected_weight}</b>. Current sum is <b>${current_sum.toFixed(2)}</b>.<br><br>Please adjust the weights to sum to ${expected_weight} before returning.`),
                                        indicator: "red"
                                    });
                                    return;
                                }
                            }

                            frappe.call({
                                method: "gdl_pms.gdl_pms.doctype.pms_plan_amendment.pms_plan_amendment.reject_amendment",
                                args: {
                                    docname: frm.doc.name,
                                    remark: values.remark,
                                    revised_targets: targets_modified ? JSON.stringify(frm.doc.revised_targets || []) : null
                                },
                                freeze: true,
                                freeze_message: __("Returning amendment to employee..."),
                                callback: function(res) {
                                    if (!res.exc) {
                                        frappe.show_alert({
                                            message: targets_modified ? __("Amendment returned to Employee with modifications") : __("Amendment returned to Employee"),
                                            indicator: "orange"
                                        });
                                        frm.reload_doc();
                                    }
                                }
                            });
                        }, prompt_title, __("Return Amendment"));
                    }).addClass("btn-danger");
                }

                // Disable save button when not in Draft
                if (frm.doc.status !== "Draft") {
                    frm.disable_save();
                }
            }
        });
    },

    performance_plan: function(frm) {
        if (frm.doc.performance_plan) {
            frappe.db.get_doc("PMS Appraisal", frm.doc.performance_plan).then(plan => {
                if (plan) {
                    // Pre-fill employee and hierarchy snapshot fields
                    if (plan.employee) frm.set_value("employee", plan.employee);
                    if (plan.employee_name) frm.set_value("employee_name", plan.employee_name);
                    if (plan.cycle) frm.set_value("cycle", plan.cycle);
                    if (plan.grade_group) frm.set_value("grade_group", plan.grade_group);
                    if (plan.supervisor_snapshot) frm.set_value("supervisor_snapshot", plan.supervisor_snapshot);
                    if (plan.reviewer_snapshot) frm.set_value("reviewer_snapshot", plan.reviewer_snapshot);
                    if (plan.supervisor_2_snapshot) frm.set_value("supervisor_2_snapshot", plan.supervisor_2_snapshot);

                    if (plan.targets) {
                        let prev_targets = plan.targets.map(t => ({
                            target_description: t.target_description || t.description || "",
                            weight: flt(t.weight),
                            target_reviews: t.target_reviews || "",
                            reviewer_comments: t.reviewer_comments || ""
                        }));
                        frm.set_value("previous_targets", JSON.stringify(prev_targets, null, 2));

                        let prev_sum = prev_targets.reduce((acc, t) => acc + flt(t.weight), 0);
                        frm.set_value("previous_total_weight", prev_sum);
                        
                        if (!frm.doc.revised_targets || frm.doc.revised_targets.length === 0) {
                            frm.clear_table("revised_targets");
                            plan.targets.forEach(t => {
                                let row = frm.add_child("revised_targets");
                                row.target_description = t.target_description || t.description || "";
                                row.weight = t.weight;
                                row.target_reviews = t.target_reviews || "";
                                row.reviewer_comments = t.reviewer_comments || "";
                            });
                            frm.refresh_field("revised_targets");
                            frm.set_value("revised_total_weight", prev_sum);
                        }
                        render_previous_targets_table(frm);
                        configure_revised_targets_grid(frm);
                    }
                    render_amendment_hero_card(frm);
                }
            });
        }
    },

    previous_targets: function(frm) {
        render_previous_targets_table(frm);
    }
});

// Real-time calculation and row-level control on revised_targets changes
frappe.ui.form.on("PMS Target", {
    weight: function(frm, cdt, cdn) {
        if (frm.doctype === "PMS Plan Amendment") {
            update_amendment_weights_and_card(frm);
        }
    },
    revised_targets_add: function(frm) {
        if (frm.doctype === "PMS Plan Amendment") {
            update_amendment_weights_and_card(frm);
        }
    },
    revised_targets_remove: function(frm) {
        if (frm.doctype === "PMS Plan Amendment") {
            update_amendment_weights_and_card(frm);
        }
    },
    form_render: function(frm, cdt, cdn) {
        if (frm.doctype === "PMS Plan Amendment" && frm.fields_dict["revised_targets"]) {
            let grid_row = frm.fields_dict["revised_targets"].grid.grid_rows_by_docname[cdn];
            if (!grid_row) return;

            const scoring_cols = ["self_score", "self_remark", "evidence", "supervisor_score", "supervisor_remark", "reviewer_score", "reviewer_remark", "remark"];
            scoring_cols.forEach(f => grid_row.toggle_display(f, false));
            grid_row.toggle_display("target_reviews", true);

            let is_admin = frm._is_admin !== undefined ? frm._is_admin : (frappe.user_roles.includes("System Manager") || frappe.user_roles.includes("HR Admin") || frappe.user_roles.includes("HR Manager"));
            let is_supervisor = frm._is_supervisor !== undefined ? frm._is_supervisor : false;
            let is_reviewer = frm._is_reviewer !== undefined ? frm._is_reviewer : false;
            let status = frm.doc.status || "Draft";

            let can_edit_sup_reviews = false;
            let can_edit_rev_reviews = false;
            let can_edit_targets = false;

            if (status === "Draft" || status === "Rejected" || status === "Returned") {
                can_edit_targets = frm._is_employee || is_admin;
                can_edit_sup_reviews = is_admin; // Employee cannot edit supervisor comments
                can_edit_rev_reviews = is_admin; // Employee cannot edit reviewer comments
            } else if (status === "Pending Supervisor Approval") {
                can_edit_targets = is_supervisor || is_admin;
                can_edit_sup_reviews = is_supervisor || is_admin;
                can_edit_rev_reviews = is_admin;
            } else if (status === "Pending Reviewer Approval") {
                can_edit_targets = is_reviewer || is_admin;
                can_edit_sup_reviews = is_admin;
                can_edit_rev_reviews = is_reviewer || is_admin;
            }

            if (grid_row.toggle_editable) {
                grid_row.toggle_editable("target_description", can_edit_targets);
                grid_row.toggle_editable("weight", can_edit_targets);
                grid_row.toggle_editable("target_reviews", can_edit_sup_reviews);
                grid_row.toggle_editable("reviewer_comments", can_edit_rev_reviews);
            } else if (grid_row.toggle_enable) {
                grid_row.toggle_enable("target_description", can_edit_targets);
                grid_row.toggle_enable("weight", can_edit_targets);
                grid_row.toggle_enable("target_reviews", can_edit_sup_reviews);
                grid_row.toggle_enable("reviewer_comments", can_edit_rev_reviews);
            }
        }
    }
});

function setup_amendment_permissions(frm) {
    let is_admin = frm._is_admin;
    let is_employee = frm._is_employee;
    let is_supervisor = frm._is_supervisor;
    let is_reviewer = frm._is_reviewer;
    let status = frm.doc.status || "Draft";

    if (status === "Draft" || status === "Rejected" || status === "Returned") {
        let can_edit = is_employee;
        frm.set_df_property("reason", "read_only", can_edit ? 0 : 1);
        frm.set_df_property("revised_targets", "read_only", can_edit ? 0 : 1);
        if (frm.fields_dict["revised_targets"] && frm.fields_dict["revised_targets"].grid) {
            let tg = frm.fields_dict["revised_targets"].grid;
            tg.cannot_add_rows = !can_edit;
            tg.update_docfield_property("target_description", "read_only", can_edit ? 0 : 1);
            tg.update_docfield_property("weight", "read_only", can_edit ? 0 : 1);
            tg.update_docfield_property("target_reviews", "read_only", is_admin ? 0 : 1); // Employee cannot edit supervisor comments
            tg.update_docfield_property("reviewer_comments", "read_only", is_admin ? 0 : 1); // Employee cannot edit reviewer comments
            tg.refresh();
        }
    } else if (status === "Pending Supervisor Approval") {
        frm.set_df_property("reason", "read_only", 1);
        if (is_supervisor || is_admin) {
            frm.set_df_property("revised_targets", "read_only", 0);
            if (frm.fields_dict["revised_targets"] && frm.fields_dict["revised_targets"].grid) {
                let tg = frm.fields_dict["revised_targets"].grid;
                tg.cannot_add_rows = false;
                tg.update_docfield_property("target_description", "read_only", 0);
                tg.update_docfield_property("weight", "read_only", 0);
                tg.update_docfield_property("target_reviews", "read_only", 0); // Supervisor can edit comments
                tg.update_docfield_property("reviewer_comments", "read_only", is_admin ? 0 : 1); // Only admin or reviewer
                tg.refresh();
            }
        } else {
            frm.set_df_property("revised_targets", "read_only", 1);
        }
    } else if (status === "Pending Reviewer Approval") {
        frm.set_df_property("reason", "read_only", 1);
        if (is_reviewer || is_admin) {
            frm.set_df_property("revised_targets", "read_only", 0);
            if (frm.fields_dict["revised_targets"] && frm.fields_dict["revised_targets"].grid) {
                let tg = frm.fields_dict["revised_targets"].grid;
                tg.cannot_add_rows = false;
                tg.update_docfield_property("target_description", "read_only", 0);
                tg.update_docfield_property("weight", "read_only", 0);
                tg.update_docfield_property("target_reviews", "read_only", is_admin ? 0 : 1); // Only admin or supervisor
                tg.update_docfield_property("reviewer_comments", "read_only", 0); // Reviewer can edit comments
                tg.refresh();
            }
        } else {
            frm.set_df_property("revised_targets", "read_only", 1);
        }
    } else {
        frm.set_df_property("reason", "read_only", 1);
        frm.set_df_property("revised_targets", "read_only", 1);
    }
}

function update_amendment_weights_and_card(frm) {
    let revised_sum = 0;
    (frm.doc.revised_targets || []).forEach(t => {
        revised_sum += flt(t.weight || 0);
    });
    frm.set_value("revised_total_weight", revised_sum);
    render_amendment_hero_card(frm);
}

function configure_revised_targets_grid(frm) {
    let grade = frm.doc.grade_group || "";
    let is_ps = (grade === "PS_CS");
    let boot_w = frappe.boot && frappe.boot.pms_competencies_data && frappe.boot.pms_competencies_data.weights;
    let target_cap = (boot_w && boot_w[grade]) ? boot_w[grade].work : (is_ps ? 60 : 50);
    let code = is_ps ? "PS" : "OS";

    frm.set_df_property(
        "revised_targets",
        "description",
        __("For <b>{0}</b> category, total revised Target Weights must sum to exactly <b>{1}%</b>.", [code, target_cap])
    );

    if (frm.fields_dict["revised_targets"] && frm.fields_dict["revised_targets"].grid) {
        let tg = frm.fields_dict["revised_targets"].grid;
        try {
            const target_scoring_cols = [
                "remark", "self_score", "self_remark", "evidence",
                "supervisor_score", "supervisor_remark",
                "reviewer_score", "reviewer_remark"
            ];
            target_scoring_cols.forEach(f => {
                try { tg.update_docfield_property(f, "hidden", 1); } catch(e){}
            });

            // Ensure supervisor comments and reviewer comments are visible and in list view
            tg.update_docfield_property("target_description", "columns", 4);
            tg.update_docfield_property("weight", "columns", 1);
            tg.update_docfield_property("target_reviews", "hidden", 0);
            tg.update_docfield_property("target_reviews", "in_list_view", 1);
            tg.update_docfield_property("target_reviews", "columns", 3);
            tg.update_docfield_property("target_reviews", "label", __("Supervisor Comments"));
            tg.update_docfield_property("reviewer_comments", "hidden", 0);
            tg.update_docfield_property("reviewer_comments", "in_list_view", 1);
            tg.update_docfield_property("reviewer_comments", "columns", 3);
            tg.update_docfield_property("reviewer_comments", "label", __("Reviewer Comments"));

            if (tg.set_column_disp) {
                tg.set_column_disp("target_description", true);
                tg.set_column_disp("weight", true);
                tg.set_column_disp("target_reviews", true);
                tg.set_column_disp("reviewer_comments", true);
                target_scoring_cols.forEach(f => tg.set_column_disp(f, false));
            }
            if (tg.set_column_disp_in_list_view) {
                tg.set_column_disp_in_list_view("target_description", true);
                tg.set_column_disp_in_list_view("weight", true);
                tg.set_column_disp_in_list_view("target_reviews", true);
                tg.set_column_disp_in_list_view("reviewer_comments", true);
                target_scoring_cols.forEach(f => tg.set_column_disp_in_list_view(f, false));
            }

            let has_rev_col = (tg.visible_columns || []).some(col => col[0] && col[0].fieldname === "target_reviews");
            if (!has_rev_col && tg.fields_map && tg.fields_map["target_reviews"]) {
                tg.fields_map["target_reviews"].in_list_view = 1;
                tg.fields_map["target_reviews"].hidden = 0;
                tg.setup_visible_columns();
            }

            tg.refresh();
        } catch(e){}
    }
}

function render_amendment_hero_card(frm) {
    if (!frm.doc.performance_plan && frm.is_new()) {
        frm.dashboard.clear_headline();
        frm.dashboard.set_headline(`
            <div class="pms-hero-card-container">
                <div class="pms-hero-card" style="grid-template-columns: 1fr; padding: 16px 20px;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; display: flex; align-items: center; justify-content: center; color: #166534; font-size: 18px;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </div>
                        <div>
                            <div style="font-size: 15px; font-weight: 700; color: #0f172a;">New Performance Plan Amendment</div>
                            <div style="font-size: 12.5px; color: #64748b; margin-top: 2px;">
                                Select an approved <b>Performance Plan</b> below to load the employee's existing targets and hierarchy snapshot.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `, "white", true);
        if (frm.layout && frm.layout.message) {
            frm.layout.message.find('.pms-hero-card').closest('.form-message').addClass('pms-hero-msg-wrapper');
        }
        return;
    }

    let emp_id = frm.doc.employee || "";
    let emp_name = frm.doc.employee_name || (emp_id ? emp_id : "Employee");
    let grade = frm.doc.grade_group || "";
    let is_ps = (grade === "PS_CS");
    let is_os = (grade === "OS_ESP");
    let cat_title = is_ps ? "Professional Staff" : (is_os ? "Operating Staff" : (grade || "Operating Staff"));
    let grade_label = is_ps ? "PS_CS" : (is_os ? "OS_ESP" : (grade || "OS_ESP"));
    let target_cap = is_ps ? 60 : 50;
    let grade_class = is_ps ? "grade-ps" : "grade-os";

    // Designation
    let designation = frm._emp_designation || "";
    if (emp_id && !designation && !frm._fetching_emp_desig) {
        frm._fetching_emp_desig = true;
        frappe.call({
            method: "frappe.client.get_value",
            args: {
                doctype: "Employee",
                fieldname: ["designation", "department"],
                filters: { name: emp_id }
            },
            callback: function(r) {
                frm._fetching_emp_desig = false;
                if (r && r.message) {
                    frm._emp_designation = r.message.designation || "";
                    render_amendment_hero_card(frm);
                }
            }
        });
    }

    // Reporting Line
    let sup_id = frm.doc.supervisor_snapshot || "";
    let sup_name = frm._sup_name || "";
    if (sup_id && !sup_name && !frm._fetching_sup) {
        frm._fetching_sup = true;
        frappe.db.get_value("Employee", sup_id, "employee_name", (r) => {
            frm._fetching_sup = false;
            if (r && r.employee_name) {
                frm._sup_name = r.employee_name;
                render_amendment_hero_card(frm);
            }
        });
    }

    let rev_id = frm.doc.reviewer_snapshot || "";
    let rev_name = frm._rev_name || "";
    if (rev_id && !rev_name && !frm._fetching_rev) {
        frm._fetching_rev = true;
        frappe.db.get_value("Employee", rev_id, "employee_name", (r) => {
            frm._fetching_rev = false;
            if (r && r.employee_name) {
                frm._rev_name = r.employee_name;
                render_amendment_hero_card(frm);
            }
        });
    }

    let sup2_id = frm.doc.supervisor_2_snapshot || "";
    let sup2_name = frm._sup2_name || "";
    if (sup2_id && !sup2_name && !frm._fetching_sup2) {
        frm._fetching_sup2 = true;
        frappe.db.get_value("Employee", sup2_id, "employee_name", (r) => {
            frm._fetching_sup2 = false;
            if (r && r.employee_name) {
                frm._sup2_name = r.employee_name;
                render_amendment_hero_card(frm);
            }
        });
    }

    let sup_display = sup_name || (sup_id ? sup_id : __("Not Assigned"));
    let rev_display = rev_name || (rev_id ? rev_id : __("Not Assigned"));
    let sup2_display = sup2_name || (sup2_id ? sup2_id : __("Not Assigned"));

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

    // Status slug
    let status = frm.doc.status || "Draft";
    let status_slug = "draft";
    if (status === "Approved") status_slug = "approved";
    else if (status === "Pending Supervisor Approval") status_slug = "pending-sup";
    else if (status === "Pending Reviewer Approval") status_slug = "pending-rev";
    else if (status === "Returned") status_slug = "returned";
    else if (status === "Rejected") status_slug = "rejected";

    let cycle_display = frm.doc.cycle || __("Cycle");

    // Dynamic Revised Target Weight
    let revised_wt = 0;
    (frm.doc.revised_targets || []).forEach(t => {
        revised_wt += flt(t.weight || 0);
    });
    let prev_wt = flt(frm.doc.previous_total_weight || 0);
    let is_wt_valid = (Math.abs(revised_wt - target_cap) < 0.01);
    let wt_color = is_wt_valid ? "#15803d" : (revised_wt > target_cap ? "#dc2626" : "#d97706");
    let wt_bar_bg = is_wt_valid ? "linear-gradient(90deg, #10b981, #059669)" : (revised_wt > target_cap ? "linear-gradient(90deg, #ef4444, #dc2626)" : "linear-gradient(90deg, #f59e0b, #d97706)");
    let pct = Math.min(100, Math.max(0, (revised_wt / (target_cap || 50)) * 100));

    // Alerts
    let alert_html = "";
    if (status === "Returned" && (frm.doc.supervisor_remark || frm.doc.reviewer_remark)) {
        let remark = frm.doc.supervisor_remark || frm.doc.reviewer_remark;
        alert_html = `
            <div class="pms-hero-alert pms-alert-warning" style="display: block;">
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                    <i class="fa fa-undo" style="margin-top: 3px; font-size: 15px; color: #b45309;"></i>
                    <div style="flex: 1;">
                        <div><b>Amendment Returned:</b> <i>"${frappe.utils.escape_html(remark)}"</i></div>
                        <div style="margin-top: 4px; font-size: 11.5px; color: #92400e;">
                            Please adjust your revised targets and weights below so they sum to exactly <b>${target_cap}%</b>, then click <b>Submit for Approval</b>.
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else if (status === "Rejected" && (frm.doc.supervisor_remark || frm.doc.reviewer_remark)) {
        let remark = frm.doc.supervisor_remark || frm.doc.reviewer_remark;
        alert_html = `
            <div class="pms-hero-alert pms-alert-danger" style="display: block;">
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                    <i class="fa fa-times-circle" style="margin-top: 3px; font-size: 15px; color: #b91c1c;"></i>
                    <div style="flex: 1;">
                        <div><b>Amendment Rejected:</b> <i>"${frappe.utils.escape_html(remark)}"</i></div>
                    </div>
                </div>
            </div>
        `;
    } else if (status === "Approved") {
        alert_html = `
            <div class="pms-hero-alert" style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; display: block;">
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                    <i class="fa fa-check-circle" style="margin-top: 3px; font-size: 15px; color: #059669;"></i>
                    <div style="flex: 1;">
                        <div><b>Amendment Approved:</b> Revised targets have been applied to Performance Plan <b>${frappe.utils.escape_html(frm.doc.performance_plan)}</b>.</div>
                    </div>
                </div>
            </div>
        `;
    }

    frm.dashboard.clear_headline();
    frm.dashboard.set_headline(`
        <div class="pms-hero-card-container">
            <div class="pms-hero-card">
                <!-- Left Section: Employee Information -->
                <div class="pms-hero-col pms-hero-col-left">
                    <div class="pms-hero-emp-name" title="${frappe.utils.escape_html(emp_name)}">${frappe.utils.escape_html(emp_name)}</div>
                    <div class="pms-hero-emp-sub">
                        ${emp_id ? `<span class="pms-hero-id-pill">${frappe.utils.escape_html(emp_id)}</span>` : ''}
                        ${designation ? `<span class="pms-hero-sep">&bull;</span><span class="pms-hero-desig">${frappe.utils.escape_html(designation)}</span>` : ''}
                        <span class="pms-hero-sep">&bull;</span>
                        <span class="pms-hero-id-pill" style="background: #e0f2fe; color: #0369a1; border-color: #bae6fd;">
                            Amendment #${frm.doc.amendment_number || 1}
                        </span>
                    </div>
                    <div class="pms-hero-badge-wrap">
                        <span class="pms-hero-grade-badge ${grade_class}">
                            <span class="pms-hero-badge-dot"></span>
                            <span>${frappe.utils.escape_html(grade_label || 'OS_ESP')} &bull; ${frappe.utils.escape_html(cat_title)} (Target Cap: ${target_cap}%)</span>
                        </span>
                    </div>
                </div>

                <!-- Middle Section: Reporting Line -->
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

                <!-- Right Section: Cycle, Status & Revised Weight Target -->
                <div class="pms-hero-col pms-hero-col-right">
                    <div class="pms-hero-meta-row">
                        <div class="pms-hero-cycle-badge" title="Cycle: ${frappe.utils.escape_html(cycle_display)}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            <span>${frappe.utils.escape_html(cycle_display)}</span>
                        </div>
                        <span class="pms-hero-status-pill status-${status_slug}">
                            <span class="pms-status-dot"></span>
                            <span>${frappe.utils.escape_html(status)}</span>
                        </span>
                    </div>

                    <div class="pms-hero-weight-container">
                        <div class="pms-hero-weight-header">
                            <span style="font-size: 11.5px; font-weight: 600; color: #475569;">
                                Target Weight: <b style="color: ${wt_color}; font-size: 13px;">${revised_wt.toFixed(1)}%</b> / ${target_cap}%
                            </span>
                            <span style="font-size: 11px; color: #64748b;">
                                Original: <b>${prev_wt.toFixed(1)}%</b>
                            </span>
                        </div>
                        <div class="pms-hero-weight-bar">
                            <div class="pms-weight-segment" style="width: ${pct}%; background: ${wt_bar_bg};" title="Revised Weight: ${revised_wt}% (Target Cap: ${target_cap}%)"></div>
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
}

function render_previous_targets_table(frm) {
    let field = frm.get_field("previous_targets_html");
    if (!field || !field.$wrapper) return;

    let targets = [];
    if (frm.doc.previous_targets) {
        try {
            targets = typeof frm.doc.previous_targets === "string" 
                ? JSON.parse(frm.doc.previous_targets) 
                : frm.doc.previous_targets;
        } catch (e) {
            targets = [];
        }
    }

    if (!Array.isArray(targets) || targets.length === 0) {
        let empty_html = `
            <div class="previous-targets-empty" style="padding: 14px 18px; margin-bottom: 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 13px; display: flex; align-items: center; gap: 8px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>No previous targets snapshot available.</span>
            </div>
        `;
        field.$wrapper.html(empty_html);
        return;
    }

    let total_weight = 0;
    let rows_html = targets.map((t, idx) => {
        let weight = flt(t.weight || 0);
        total_weight += weight;
        let desc = frappe.utils.escape_html(t.target_description || t.description || "");
        let sup_review = frappe.utils.escape_html(t.target_reviews || "--");
        let rev_comment = frappe.utils.escape_html(t.reviewer_comments || "--");
        return `
            <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;">
                <td style="width: 45px; text-align: center; color: #64748b; font-weight: 500; padding: 10px 8px; vertical-align: middle;">${idx + 1}</td>
                <td style="color: #1e293b; font-weight: 500; padding: 10px 14px; vertical-align: middle; line-height: 1.5;">${desc}</td>
                <td style="width: 100px; text-align: right; padding: 10px 14px; vertical-align: middle;">
                    <span style="display: inline-block; padding: 3px 10px; background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; border-radius: 6px; font-weight: 600; font-size: 12.5px;">
                        ${weight.toFixed(1)}%
                    </span>
                </td>
                <td style="width: 220px; color: #475569; padding: 10px 14px; vertical-align: middle; font-size: 12.5px;">${sup_review}</td>
                <td style="width: 220px; color: #475569; padding: 10px 14px; vertical-align: middle; font-size: 12.5px;">${rev_comment}</td>
            </tr>
        `;
    }).join("");

    let table_html = `
        <div class="previous-targets-table-card" style="margin-bottom: 16px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between;">
                <div style="font-weight: 600; font-size: 13px; color: #334155; display: flex; align-items: center; gap: 8px;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>Original Approved Targets (Snapshot)</span>
                    <span style="font-size: 10.5px; font-weight: 600; background: #e2e8f0; color: #475569; padding: 2px 7px; border-radius: 4px; text-transform: uppercase;">Reference</span>
                </div>
                <div style="font-size: 12px; color: #64748b;">
                    Total Targets: <b style="color: #0f172a;">${targets.length}</b>
                </div>
            </div>
            <table class="table" style="width: 100%; margin-bottom: 0; font-size: 13px; border-collapse: collapse;">
                <thead>
                    <tr style="background: #fcfdfe; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px;">
                        <th style="width: 45px; text-align: center; padding: 9px 8px; font-weight: 600;">#</th>
                        <th style="padding: 9px 14px; font-weight: 600;">Target Description</th>
                        <th style="width: 100px; text-align: right; padding: 9px 14px; font-weight: 600;">Weight</th>
                        <th style="width: 220px; padding: 9px 14px; font-weight: 600;">Supervisor Comments</th>
                        <th style="width: 220px; padding: 9px 14px; font-weight: 600;">Reviewer Comments</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows_html}
                </tbody>
                <tfoot>
                    <tr style="background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 13px;">
                        <td colspan="2" style="text-align: right; padding: 10px 14px; font-weight: 600; color: #475569;">
                            Original Total Weight:
                        </td>
                        <td style="text-align: right; padding: 10px 14px; font-weight: 700; color: #15803d; font-size: 13.5px;">
                            ${total_weight.toFixed(1)}%
                        </td>
                        <td colspan="2"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

    field.$wrapper.html(table_html);
    frm.set_df_property("previous_targets_html", "options", table_html);
}
