// Copyright (c) 2026, GDL and contributors
// For license information, please see license.txt

frappe.ui.form.on("PERC Case", {
	refresh(frm) {
		if (frm.is_new()) return;

		if (frm.doc.appraisal) {
			frm.add_custom_button(__("View Appraisal"), function () {
				frappe.set_route("Form", "PMS Appraisal", frm.doc.appraisal);
			});
		}

		if (frm.doc.status === "Resolved") {
			frm.set_intro(
				__("This PERC Case is resolved. The linked PMS Appraisal has been updated with the final score and locked."),
				"green"
			);
			frm.disable_save();
			return;
		}

		const is_hr =
			frappe.user.has_role("HR Admin") ||
			frappe.user.has_role("HR Manager") ||
			frappe.user.has_role("System Manager");

		if (is_hr) {
			frm.add_custom_button(
				__("Resolve PERC Case"),
				function () {
					if (frm.doc.final_score === null || frm.doc.final_score === undefined || frm.doc.final_score === "") {
						frappe.msgprint(__("Please enter the Final Score decided by the PERC Committee before resolving."));
						return;
					}
					if (!frm.doc.minutes_attachment) {
						frappe.msgprint(__("Please upload the signed PERC Meeting Minutes / Decision Letter before resolving."));
						return;
					}
					frappe.confirm(
						__(
							"Resolving this PERC Case will override the linked Appraisal ({0}) final score to {1} and permanently lock it. Continue?",
							[frm.doc.appraisal, frm.doc.final_score]
						),
						function () {
							frm.set_value("status", "Resolved");
							frm.save();
						}
					);
				}
			).addClass("btn-primary");
		}
	},
});
