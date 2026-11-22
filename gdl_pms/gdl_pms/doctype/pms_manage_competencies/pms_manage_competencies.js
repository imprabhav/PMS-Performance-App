// Copyright (c) 2026, GDL and contributors
// For license information, please see license.txt

frappe.ui.form.on("PMS Manage Competencies", {
	refresh: function(frm) {
		// Populate defaults if empty on first load
		let need_populate = (!frm.doc.os_competencies || frm.doc.os_competencies.length === 0) ||
							(!frm.doc.ps_competencies || frm.doc.ps_competencies.length === 0);

		if (need_populate) {
			frappe.call({
				method: "gdl_pms.competencies.populate_manage_competencies_doc",
				callback: function(r) {
					frm.reload_doc();
				}
			});
		}

		frm.add_custom_button(__("Reset to System Defaults"), function() {
			frappe.confirm(__("Are you sure you want to reset all competencies and weightages to standard company defaults (OS: 50/50, PS: 60/40)?"), function() {
				frappe.call({
					method: "gdl_pms.competencies.reset_manage_competencies_doc",
					freeze: true,
					freeze_message: __("Resetting competencies..."),
					callback: function(r) {
						frm.reload_doc();
						frappe.show_alert({message: __("Competencies reset to system defaults."), indicator: "green"});
					}
				});
			});
		});

		update_competency_summaries(frm);
	},

	os_target_weight: function(frm) {
		let tw = flt(frm.doc.os_target_weight, 2);
		if (tw > 0 && tw < 100) {
			frm.set_value("os_competency_weight", flt(100 - tw, 2));
		}
		update_competency_summaries(frm);
	},

	os_competency_weight: function(frm) {
		let cw = flt(frm.doc.os_competency_weight, 2);
		if (cw > 0 && cw < 100) {
			frm.set_value("os_target_weight", flt(100 - cw, 2));
		}
		update_competency_summaries(frm);
	},

	ps_target_weight: function(frm) {
		let tw = flt(frm.doc.ps_target_weight, 2);
		if (tw > 0 && tw < 100) {
			frm.set_value("ps_competency_weight", flt(100 - tw, 2));
		}
		update_competency_summaries(frm);
	},

	ps_competency_weight: function(frm) {
		let cw = flt(frm.doc.ps_competency_weight, 2);
		if (cw > 0 && cw < 100) {
			frm.set_value("ps_target_weight", flt(100 - cw, 2));
		}
		update_competency_summaries(frm);
	}
});

frappe.ui.form.on("PMS Competency Item", {
	weight: function(frm, cdt, cdn) {
		update_competency_summaries(frm);
	},
	os_competencies_remove: function(frm) {
		update_competency_summaries(frm);
	},
	ps_competencies_remove: function(frm) {
		update_competency_summaries(frm);
	}
});

function update_competency_summaries(frm) {
	let os_sum = 0;
	(frm.doc.os_competencies || []).forEach(c => { os_sum += flt(c.weight, 2); });
	let os_target = flt(frm.doc.os_competency_weight, 2);
	let os_diff = Math.abs(os_sum - os_target);
	let os_color = os_diff < 0.01 ? "#15803d" : "#b91c1c";
	let os_msg = `Total OS Competency Weights: <b style="color: ${os_color};">${os_sum.toFixed(2)}% / ${os_target.toFixed(2)}%</b>`;
	frm.set_df_property("sec_os_comps", "description", os_msg);

	let ps_sum = 0;
	(frm.doc.ps_competencies || []).forEach(c => { ps_sum += flt(c.weight, 2); });
	let ps_target = flt(frm.doc.ps_competency_weight, 2);
	let ps_diff = Math.abs(ps_sum - ps_target);
	let ps_color = ps_diff < 0.01 ? "#15803d" : "#b91c1c";
	let ps_msg = `Total PS Competency Weights: <b style="color: ${ps_color};">${ps_sum.toFixed(2)}% / ${ps_target.toFixed(2)}%</b>`;
	frm.set_df_property("sec_ps_comps", "description", ps_msg);
}

