import frappe
import json
from frappe.model.document import Document
from frappe.utils import flt, today, now_datetime

class PMSPlanAmendment(Document):
    def before_insert(self):
        # 1. Auto-increment amendment_number per performance_plan
        if self.performance_plan:
            max_num = frappe.db.sql("""
                SELECT MAX(amendment_number) FROM `tabPMS Plan Amendment`
                WHERE performance_plan = %s
            """, (self.performance_plan,))[0][0]
            self.amendment_number = (max_num or 0) + 1

        self.revision_date = today()

        # 2. Auto-fetch details from parent PMS Appraisal if missing
        if self.performance_plan:
            plan = frappe.get_doc("PMS Appraisal", self.performance_plan)
            self.employee = plan.employee
            self.employee_name = getattr(plan, "employee_name", None) or frappe.db.get_value("Employee", plan.employee, "employee_name")
            self.cycle = plan.cycle
            self.calendar_year = getattr(plan, "calendar_year", None) or frappe.db.get_value("PMS Appraisal Cycle", plan.cycle, "calendar_year")
            self.grade_group = plan.grade_group
            self.supervisor_snapshot = plan.supervisor_snapshot
            self.reviewer_snapshot = plan.reviewer_snapshot
            self.supervisor_2_snapshot = getattr(plan, "supervisor_2_snapshot", None)

            # 3. Snapshot current targets into previous_targets
            if not self.previous_targets:
                prev_targets_list = []
                for t in plan.targets:
                    prev_targets_list.append({
                        "target_description": t.target_description,
                        "weight": flt(t.weight),
                        "target_reviews": getattr(t, "target_reviews", None),
                        "reviewer_comments": getattr(t, "reviewer_comments", None)
                    })
                self.previous_targets = json.dumps(prev_targets_list, indent=2)

            # 4. Pre-fill revised_targets if empty
            if not self.revised_targets:
                for t in plan.targets:
                    self.append("revised_targets", {
                        "target_description": t.target_description,
                        "weight": flt(t.weight),
                        "target_reviews": getattr(t, "target_reviews", None),
                        "reviewer_comments": getattr(t, "reviewer_comments", None)
                    })

    def validate(self):
        if not self.is_new():
            db_plan = frappe.db.get_value("PMS Plan Amendment", self.name, "performance_plan")
            if db_plan and self.performance_plan != db_plan:
                frappe.throw("Performance Plan cannot be changed or edited.")

        if self.employee and not getattr(self, "employee_name", None):
            self.employee_name = frappe.db.get_value("Employee", self.employee, "employee_name")

        if self.cycle and not getattr(self, "calendar_year", None):
            self.calendar_year = frappe.db.get_value("PMS Appraisal Cycle", self.cycle, "calendar_year")
        elif self.performance_plan and not getattr(self, "calendar_year", None):
            self.calendar_year = frappe.db.get_value("PMS Appraisal", self.performance_plan, "calendar_year")

        # Compute weight totals
        if self.previous_targets:
            try:
                prev_list = json.loads(self.previous_targets)
                self.previous_total_weight = sum(flt(t.get("weight", 0)) for t in prev_list)
            except Exception:
                self.previous_total_weight = 0
        else:
            self.previous_total_weight = 0

        self.revised_total_weight = sum(flt(t.weight) for t in self.revised_targets)

        # Supervisor Comments & Reviewer Comments restriction:
        # Supervisor Comments can only be modified by assigned Supervisor or Admin.
        # Reviewer Comments can only be modified by assigned Reviewer or Admin.
        # Employee cannot modify either.
        user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
        roles = frappe.get_roles()
        is_admin = frappe.session.user == "Administrator" or "PMS HR Admin" in roles
        if not is_admin:
            is_supervisor_user = bool(user_emp and self.supervisor_snapshot and user_emp == self.supervisor_snapshot and user_emp != self.employee)
            is_reviewer_user = bool(user_emp and self.reviewer_snapshot and user_emp == self.reviewer_snapshot and user_emp != self.employee)
            if self.is_new():
                for t in self.revised_targets:
                    if not is_supervisor_user:
                        t.target_reviews = None
                    if not is_reviewer_user:
                        t.reviewer_comments = None
            else:
                old_reviews = frappe.get_all("PMS Target", filters={"parent": self.name}, fields=["name", "target_reviews", "reviewer_comments"])
                old_rev_map = {r["name"]: (r.get("target_reviews"), r.get("reviewer_comments")) for r in old_reviews}
                for t in self.revised_targets:
                    old_sup_rev, old_rev_com = old_rev_map.get(t.name, (None, None))
                    if not is_supervisor_user:
                        t.target_reviews = old_sup_rev
                    if not is_reviewer_user:
                        t.reviewer_comments = old_rev_com


@frappe.whitelist()
def submit_amendment(docname):
    doc = frappe.get_doc("PMS Plan Amendment", docname)
    
    if doc.status not in ["Draft", "Rejected", "Returned"]:
        frappe.throw("Only Draft or Returned amendments can be submitted for approval.")

    if not doc.reason or not doc.reason.strip():
        frappe.throw("Reason for Amendment is mandatory before submission.")

    # Check amendment window open on performance plan
    plan_window_open = frappe.db.get_value("PMS Appraisal", doc.performance_plan, "amendment_window_open")
    is_hr = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()
    if not plan_window_open and not is_hr:
        frappe.throw("The Amendment Window for this Performance Plan is currently closed by HR Admin.")

    # Validate weight sum against grade group
    from gdl_pms.competencies import get_grade_group_weights
    expected_weight = get_grade_group_weights(doc.grade_group)["work"]
    total_weight = sum(flt(t.weight) for t in doc.revised_targets)
    if flt(total_weight, 2) != flt(expected_weight, 2):
        frappe.throw(f"Total weight of revised targets must equal {expected_weight}. Current sum is {flt(total_weight, 2)}.")

    # Validate user is the employee or System Manager
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if doc.employee != user_emp and frappe.session.user != "Administrator" and "PMS HR Admin" not in frappe.get_roles():
        frappe.throw("Only the assigned Employee can submit this amendment request.")

    doc.status = "Pending Supervisor Approval"
    doc.append("approval_history", {
        "action": "Submitted for Approval",
        "user": frappe.session.user,
        "role": "Employee",
        "timestamp": now_datetime(),
        "status": "Pending Supervisor Approval",
        "remark": doc.reason
    })
    doc.save(ignore_permissions=True)
    return "Amendment submitted for Supervisor Approval"


@frappe.whitelist()
def approve_amendment(docname, revised_targets=None):
    doc = frappe.get_doc("PMS Plan Amendment", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    is_sys_mgr = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()

    if revised_targets:
        parsed = json.loads(revised_targets) if isinstance(revised_targets, str) else revised_targets
        
        # Check if description or weight was provided and changed
        has_desc_or_weight = any("target_description" in t or "weight" in t for t in parsed)
        if has_desc_or_weight:
            old_desc_weights = [((t.target_description or "").strip(), flt(t.weight, 2)) for t in doc.revised_targets]
            new_desc_weights = [((t.get("target_description") or "").strip(), flt(t.get("weight"), 2)) for t in parsed]
            if len(old_desc_weights) != len(new_desc_weights) or old_desc_weights != new_desc_weights:
                frappe.throw("Cannot approve an amendment with modified targets or weights. Modifications must be returned to the employee for review and acceptance.")

        # Update target_reviews and reviewer_comments based on status/role
        target_map = {t.get("name"): t for t in parsed if t.get("name")}
        for t in doc.revised_targets:
            if t.name in target_map:
                if doc.status == "Pending Supervisor Approval" or is_sys_mgr:
                    if "target_reviews" in target_map[t.name]:
                        t.target_reviews = target_map[t.name].get("target_reviews")
                if doc.status == "Pending Reviewer Approval" or is_sys_mgr:
                    if "reviewer_comments" in target_map[t.name]:
                        t.reviewer_comments = target_map[t.name].get("reviewer_comments")

    if doc.status == "Pending Supervisor Approval":
        if doc.supervisor_snapshot != user_emp and not is_sys_mgr:
            frappe.throw("Only the assigned Supervisor can approve this amendment.")
            
        doc.append("approval_history", {
            "action": "Approved by Supervisor",
            "user": frappe.session.user,
            "role": "Supervisor",
            "timestamp": now_datetime(),
            "status": "Approved" if not doc.reviewer_snapshot else "Pending Reviewer Approval",
            "remark": doc.supervisor_remark or "Approved"
        })

        if doc.reviewer_snapshot:
            doc.status = "Pending Reviewer Approval"
        else:
            doc.status = "Approved"
            apply_amendment_to_plan(doc)

    elif doc.status == "Pending Reviewer Approval":
        if doc.reviewer_snapshot != user_emp and not is_sys_mgr:
            frappe.throw("Only the assigned Reviewer can approve this amendment.")

        doc.status = "Approved"
        doc.append("approval_history", {
            "action": "Approved by Reviewer",
            "user": frappe.session.user,
            "role": "Reviewer",
            "timestamp": now_datetime(),
            "status": "Approved",
            "remark": doc.reviewer_remark or "Approved"
        })
        apply_amendment_to_plan(doc)
    else:
        frappe.throw("This amendment is not pending your approval.")

    doc.save(ignore_permissions=True)
    return f"Amendment {doc.status}"


@frappe.whitelist()
def reject_amendment(docname, remark, revised_targets=None):
    if not remark or not remark.strip():
        frappe.throw("Return remark is mandatory.")

    doc = frappe.get_doc("PMS Plan Amendment", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    is_sys_mgr = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()

    has_modifications = False
    if revised_targets:
        parsed = json.loads(revised_targets) if isinstance(revised_targets, str) else revised_targets
        
        # Check if targets were actually modified compared to existing doc.revised_targets
        old_fmt = [{"desc": (t.target_description or "").strip(), "w": flt(t.weight, 2), "rev": (t.target_reviews or "").strip(), "rev_c": (t.reviewer_comments or "").strip()} for t in doc.revised_targets]
        new_fmt = [{"desc": (t.get("target_description") or "").strip(), "w": flt(t.get("weight"), 2), "rev": (t.get("target_reviews") or "").strip(), "rev_c": (t.get("reviewer_comments") or "").strip()} for t in parsed]
        if old_fmt != new_fmt:
            has_modifications = True
            
            # Validate total weight matches expected weight
            from gdl_pms.competencies import get_grade_group_weights
            expected_weight = get_grade_group_weights(doc.grade_group)["work"]
            total_w = sum(flt(t.get("weight")) for t in parsed)
            if abs(flt(total_w, 2) - flt(expected_weight, 2)) > 0.01:
                frappe.throw(f"Total target weight must be exactly {expected_weight}. Current sum is {flt(total_w, 2)}.")

            doc.set("revised_targets", [])
            for t in parsed:
                doc.append("revised_targets", {
                    "target_description": t.get("target_description"),
                    "weight": flt(t.get("weight")),
                    "target_reviews": t.get("target_reviews"),
                    "reviewer_comments": t.get("reviewer_comments"),
                    "remark": t.get("remark")
                })
            doc.revised_total_weight = sum(flt(t.weight) for t in doc.revised_targets)
        else:
            target_map = {t.get("name"): t for t in parsed if t.get("name")}
            for t in doc.revised_targets:
                if t.name in target_map:
                    if doc.status == "Pending Supervisor Approval" or is_sys_mgr:
                        if "target_reviews" in target_map[t.name]:
                            t.target_reviews = target_map[t.name].get("target_reviews")
                    if doc.status == "Pending Reviewer Approval" or is_sys_mgr:
                        if "reviewer_comments" in target_map[t.name]:
                            t.reviewer_comments = target_map[t.name].get("reviewer_comments")

    if doc.status == "Pending Supervisor Approval":
        if doc.supervisor_snapshot != user_emp and not is_sys_mgr:
            frappe.throw("Only the assigned Supervisor can return this amendment.")
        doc.supervisor_remark = remark
        role_label = "Supervisor"
    elif doc.status == "Pending Reviewer Approval":
        if doc.reviewer_snapshot != user_emp and not is_sys_mgr:
            frappe.throw("Only the assigned Reviewer can return this amendment.")
        doc.reviewer_remark = remark
        role_label = "Reviewer"
    else:
        frappe.throw("This amendment is not pending your approval.")

    doc.status = "Draft"
    action_label = f"Returned with modifications by {role_label}" if has_modifications else f"Returned by {role_label}"
    doc.append("approval_history", {
        "action": action_label,
        "user": frappe.session.user,
        "role": role_label,
        "timestamp": now_datetime(),
        "status": "Draft",
        "remark": remark
    })
    doc.save(ignore_permissions=True)
    return "Amendment Returned and routed back to Employee (Draft)"


@frappe.whitelist()
def return_amendment(docname, remark, revised_targets=None):
    return reject_amendment(docname, remark, revised_targets=revised_targets)


def apply_amendment_to_plan(doc):
    """
    On final approval of an amendment:
    Replace live targets on parent PMS Appraisal with revised_targets.
    Keep workflow_state = 'Monitoring' and plan_status = 'Approved'.
    """
    plan = frappe.get_doc("PMS Appraisal", doc.performance_plan)
    plan._allow_target_update = True
    plan.targets = []
    for t in doc.revised_targets:
        plan.append("targets", {
            "target_description": t.target_description,
            "weight": flt(t.weight),
            "target_reviews": getattr(t, "target_reviews", None),
            "reviewer_comments": getattr(t, "reviewer_comments", None),
            "remark": getattr(t, "remark", None)
        })
    # Ensure parent stays in Monitoring and Approved state, and close the amendment window
    plan.plan_status = "Approved"
    plan.workflow_state = "Monitoring"
    plan.amendment_window_open = 0
    plan.add_comment(
        "Comment",
        f"Plan Amendment #{doc.amendment_number} ({doc.name}) applied. Revision Date: {doc.revision_date}. Reason: \"{doc.reason}\"."
    )
    plan.save(ignore_permissions=True)
    frappe.logger().info(f"Successfully applied Amendment {doc.name} targets to Performance Plan {plan.name}")


def get_permission_query_conditions(user):
    if not user:
        user = frappe.session.user

    if user == "Administrator" or "PMS HR Admin" in frappe.get_roles(user):
        return ""

    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return "1=2"

    return f"""(`tabPMS Plan Amendment`.employee = '{employee}' or `tabPMS Plan Amendment`.supervisor_snapshot = '{employee}' or `tabPMS Plan Amendment`.reviewer_snapshot = '{employee}' or `tabPMS Plan Amendment`.supervisor_2_snapshot = '{employee}' or `tabPMS Plan Amendment`.employee in (select name from `tabEmployee` where supervisor_2 = '{employee}'))"""


def has_permission(doc, ptype="read", user=None):
    if not user:
        user = frappe.session.user

    roles = frappe.get_roles(user)
    if user == "Administrator" or "PMS HR Admin" in roles:
        return True

    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return False

    is_supervisor_2 = (getattr(doc, "supervisor_2_snapshot", None) == employee or frappe.db.get_value("Employee", doc.employee, "supervisor_2") == employee)
    is_primary_party = (doc.employee == employee or doc.supervisor_snapshot == employee or doc.reviewer_snapshot == employee)

    if ptype == "read":
        if is_primary_party or is_supervisor_2:
            return True
        return False
    else:
        if is_supervisor_2 and not is_primary_party:
            return False
        if is_primary_party:
            return True
        return False
