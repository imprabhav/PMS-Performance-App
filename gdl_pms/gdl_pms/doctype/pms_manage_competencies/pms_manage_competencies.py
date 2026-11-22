import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

class PMSManageCompetencies(Document):
	def validate(self):
		# Default weights if not specified
		if not self.os_target_weight:
			self.os_target_weight = 50.0
		if not self.os_competency_weight:
			self.os_competency_weight = 50.0
		if not self.ps_target_weight:
			self.ps_target_weight = 60.0
		if not self.ps_competency_weight:
			self.ps_competency_weight = 40.0

		os_target = flt(self.os_target_weight, 2)
		os_comp = flt(self.os_competency_weight, 2)
		if round(os_target + os_comp, 2) != 100.0:
			frappe.throw(_("Operating Staff (OS_ESP): Target Weight ({0}%) + Competency Weight ({1}%) must equal 100%.").format(os_target, os_comp))

		os_comp_sum = sum(flt(c.weight, 2) for c in (self.os_competencies or []))
		if round(os_comp_sum, 2) != round(os_comp, 2):
			frappe.throw(_("Operating Staff (OS_ESP): Sum of individual competency weights ({0}%) must equal Total Competency Weight ({1}%).").format(round(os_comp_sum, 2), os_comp))

		ps_target = flt(self.ps_target_weight, 2)
		ps_comp = flt(self.ps_competency_weight, 2)
		if round(ps_target + ps_comp, 2) != 100.0:
			frappe.throw(_("Professional Staff (PS_CS): Target Weight ({0}%) + Competency Weight ({1}%) must equal 100%.").format(ps_target, ps_comp))

		ps_comp_sum = sum(flt(c.weight, 2) for c in (self.ps_competencies or []))
		if round(ps_comp_sum, 2) != round(ps_comp, 2):
			frappe.throw(_("Professional Staff (PS_CS): Sum of individual competency weights ({0}%) must equal Total Competency Weight ({1}%).").format(round(ps_comp_sum, 2), ps_comp))

		# Validate rows
		for idx, c in enumerate(self.os_competencies or [], 1):
			if not c.competency or not c.competency.strip():
				frappe.throw(_("Operating Staff: Competency name cannot be empty (Row #{0}).").format(idx))
			if flt(c.weight, 2) <= 0:
				frappe.throw(_("Operating Staff: Weight for '{0}' must be greater than 0.").format(c.competency))

		for idx, c in enumerate(self.ps_competencies or [], 1):
			if not c.competency or not c.competency.strip():
				frappe.throw(_("Professional Staff: Competency name cannot be empty (Row #{0}).").format(idx))
			if flt(c.weight, 2) <= 0:
				frappe.throw(_("Professional Staff: Weight for '{0}' must be greater than 0.").format(c.competency))

	def on_update(self):
		frappe.clear_cache()

