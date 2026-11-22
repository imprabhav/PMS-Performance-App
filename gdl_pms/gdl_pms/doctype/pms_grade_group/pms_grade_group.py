import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

class PMSGradeGroup(Document):
    def validate(self):
        tw = flt(self.target_weight, 2)
        cw = flt(self.competency_weight, 2)

        if tw < 0 or cw < 0:
            frappe.throw(_("Weights cannot be negative."))

        if flt(tw + cw, 2) != 100.0:
            frappe.throw(
                _("Target Weight ({0}%) + Competency Weight ({1}%) must equal 100%. Current sum is {2}%.")
                .format(tw, cw, flt(tw + cw, 2))
            )

        if self.competencies and len(self.competencies) > 0:
            total_comp = sum(flt(c.weight, 2) for c in self.competencies)
            if flt(total_comp, 2) != cw:
                frappe.throw(
                    _("The sum of weights in the Competencies table ({0}%) must equal the Competency Weight ({1}%).")
                    .format(flt(total_comp, 2), cw)
                )

