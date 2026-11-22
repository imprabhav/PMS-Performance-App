frappe.ui.form.on('PMS Grade Group', {
	refresh: function(frm) {
		render_weight_status(frm);
	},

	target_weight: function(frm) {
		if (frm.doc.target_weight != null) {
			let tw = flt(frm.doc.target_weight, 2);
			if (tw <= 100 && (!frm.doc.competency_weight || frm._auto_balancing)) {
				frm._auto_balancing = true;
				frm.set_value('competency_weight', flt(100 - tw, 2));
				frm._auto_balancing = false;
			}
		}
		render_weight_status(frm);
	},

	competency_weight: function(frm) {
		render_weight_status(frm);
	},

	validate: function(frm) {
		let tw = flt(frm.doc.target_weight, 2);
		let cw = flt(frm.doc.competency_weight, 2);
		if (flt(tw + cw, 2) !== 100.0) {
			frappe.msgprint(__('Target Weight ({0}%) + Competency Weight ({1}%) must equal 100%.', [tw, cw]));
			frappe.validated = false;
			return;
		}

		if (frm.doc.competencies && frm.doc.competencies.length > 0) {
			let total_comp = frm.doc.competencies.reduce((acc, row) => acc + flt(row.weight, 2), 0);
			if (flt(total_comp, 2) !== cw) {
				frappe.msgprint(__('Total weights of default competencies ({0}%) must equal Competency Weight ({1}%).', [flt(total_comp, 2), cw]));
				frappe.validated = false;
			}
		}
	}
});

frappe.ui.form.on('PMS Competency Item', {
	weight: function(frm) {
		render_weight_status(frm);
	},
	competencies_remove: function(frm) {
		render_weight_status(frm);
	}
});

function render_weight_status(frm) {
	frm.dashboard.clear_headline();
	let tw = flt(frm.doc.target_weight, 2);
	let cw = flt(frm.doc.competency_weight, 2);
	let sum = flt(tw + cw, 2);

	let comp_sum = 0;
	if (frm.doc.competencies) {
		comp_sum = frm.doc.competencies.reduce((acc, row) => acc + flt(row.weight, 2), 0);
		comp_sum = flt(comp_sum, 2);
	}

	let weight_valid = (sum === 100.0);
	let comps_valid = (!frm.doc.competencies || frm.doc.competencies.length === 0 || comp_sum === cw);

	let badge_class = weight_valid ? 'indicator-pill green' : 'indicator-pill red';
	let comp_badge_class = comps_valid ? 'indicator-pill green' : 'indicator-pill orange';

	let html = `
		<div style="display: flex; gap: 12px; align-items: center; padding: 6px 0; font-size: 13px;">
			<span class="${badge_class}">
				<b>Total Weight:</b> ${sum}% ${weight_valid ? '✓' : '(Must be 100%)'}
			</span>
			<span style="color: #6c757d;">|</span>
			<span><b>Targets:</b> ${tw}%</span>
			<span style="color: #6c757d;">+</span>
			<span><b>Competencies:</b> ${cw}%</span>
			${frm.doc.competencies && frm.doc.competencies.length > 0 ? `
				<span style="color: #6c757d;">|</span>
				<span class="${comp_badge_class}">
					<b>Competencies Sum:</b> ${comp_sum}% / ${cw}% ${comps_valid ? '✓' : '⚠️'}
				</span>
			` : ''}
		</div>
	`;

	frm.dashboard.set_headline(html);
}

