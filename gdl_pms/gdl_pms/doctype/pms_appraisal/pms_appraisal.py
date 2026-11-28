import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate, today, formatdate
import json
from gdl_pms import scoring_engine
from gdl_pms.competencies import get_competencies_for_grade_group

class PMSAppraisal(Document):
    def before_insert(self):
        # Auto-fetch latest active cycle if not set
        if not self.cycle:
            active_cycle = frappe.db.get_value(
                "PMS Appraisal Cycle",
                {"status": ["in", ["Active", "Planning Open", "Draft"]]},
                "name",
                order_by="creation desc"
            )
            if active_cycle:
                self.cycle = active_cycle

        if self.cycle:
            if not getattr(self, "calendar_year", None):
                self.calendar_year = frappe.db.get_value("PMS Appraisal Cycle", self.cycle, "calendar_year")
            if not getattr(self, "cycle_end_date", None):
                self.cycle_end_date = frappe.db.get_value("PMS Appraisal Cycle", self.cycle, "end_date")

        # Auto-fetch supervisor/reviewer snapshots and employee_name if employee is selected
        if self.employee:
            emp = frappe.get_doc("Employee", self.employee)
            self.employee_name = emp.employee_name
            self.supervisor_snapshot = emp.reports_to
            self.supervisor_name = frappe.db.get_value("Employee", emp.reports_to, "employee_name") if emp.reports_to else ""
            self.reviewer_snapshot = emp.reviewer
            self.reviewer_name = frappe.db.get_value("Employee", emp.reviewer, "employee_name") if emp.reviewer else ""
            self.supervisor_2_snapshot = emp.get("supervisor_2")
            self.supervisor_2_name = frappe.db.get_value("Employee", emp.get("supervisor_2"), "employee_name") if emp.get("supervisor_2") else ""
            if not self.grade_group:
                self.grade_group = emp.grade_group or "OS_ESP"

        if not self.competencies or len(self.competencies) == 0:
            self.competencies = []
            for item in get_competencies_for_grade_group(self.grade_group):
                self.append("competencies", {
                    "competency": item["competency"],
                    "definition": item["definition"],
                    "weight": item["weight"]
                })

    def onload(self):
        if self.employee:
            if not self.grade_group:
                self.grade_group = frappe.db.get_value("Employee", self.employee, "grade_group") or "OS_ESP"
            if not self.employee_name:
                self.employee_name = frappe.db.get_value("Employee", self.employee, "employee_name")
            if self.supervisor_snapshot and not getattr(self, "supervisor_name", None):
                self.supervisor_name = frappe.db.get_value("Employee", self.supervisor_snapshot, "employee_name")
            if self.reviewer_snapshot and not getattr(self, "reviewer_name", None):
                self.reviewer_name = frappe.db.get_value("Employee", self.reviewer_snapshot, "employee_name")
            if self.supervisor_2_snapshot and not getattr(self, "supervisor_2_name", None):
                self.supervisor_2_name = frappe.db.get_value("Employee", self.supervisor_2_snapshot, "employee_name")

        # Ensure competencies are populated and have definitions loaded
        expected_comps = get_competencies_for_grade_group(self.grade_group)
        if not self.competencies or len(self.competencies) == 0:
            for item in expected_comps:
                self.append("competencies", {
                    "competency": item["competency"],
                    "definition": item["definition"],
                    "weight": item["weight"]
                })
        else:
            comp_dict = {c["competency"]: c for c in expected_comps}
            for idx, c in enumerate(self.competencies or []):
                if c.competency in comp_dict:
                    if not getattr(c, "definition", None):
                        c.definition = comp_dict[c.competency]["definition"]
                    if not c.weight:
                        c.weight = comp_dict[c.competency]["weight"]
                elif idx < len(expected_comps) and not getattr(c, "definition", None):
                    c.definition = expected_comps[idx]["definition"]

    def validate(self):
        if self.cycle:
            if not getattr(self, "calendar_year", None):
                self.calendar_year = frappe.db.get_value("PMS Appraisal Cycle", self.cycle, "calendar_year")
            if not getattr(self, "cycle_end_date", None):
                self.cycle_end_date = frappe.db.get_value("PMS Appraisal Cycle", self.cycle, "end_date")

        if self.employee:
            if not self.grade_group:
                self.grade_group = frappe.db.get_value("Employee", self.employee, "grade_group") or "OS_ESP"
            if not self.employee_name:
                self.employee_name = frappe.db.get_value("Employee", self.employee, "employee_name")
            if self.supervisor_snapshot and not getattr(self, "supervisor_name", None):
                self.supervisor_name = frappe.db.get_value("Employee", self.supervisor_snapshot, "employee_name")
            if self.reviewer_snapshot and not getattr(self, "reviewer_name", None):
                self.reviewer_name = frappe.db.get_value("Employee", self.reviewer_snapshot, "employee_name")
            if self.supervisor_2_snapshot and not getattr(self, "supervisor_2_name", None):
                self.supervisor_2_name = frappe.db.get_value("Employee", self.supervisor_2_snapshot, "employee_name")

        expected_comps = get_competencies_for_grade_group(self.grade_group)
        if self.is_new() or self.plan_status == "Draft":
            if not self.competencies or len(self.competencies) == 0:
                self.competencies = []
                for item in expected_comps:
                    self.append("competencies", {
                        "competency": item["competency"],
                        "definition": item["definition"],
                        "weight": item["weight"]
                    })
        comp_dict = {c["competency"]: c for c in expected_comps}
        for idx, c in enumerate(self.competencies or []):
            if c.competency in comp_dict:
                if not getattr(c, "definition", None):
                    c.definition = comp_dict[c.competency]["definition"]
                if not c.weight:
                    c.weight = comp_dict[c.competency]["weight"]
            elif idx < len(expected_comps) and not getattr(c, "definition", None):
                c.definition = expected_comps[idx]["definition"]

        # 1. Lock Protection: Prevent any modification if locked
        if not self.is_new() and self.db_get("locked"):
            if not getattr(self, "_allow_unlock", False):
                frappe.throw("This Appraisal is Finalized & Locked and cannot be modified.")

        # 2. Document-level permission safety net: Supervisor 2 is strictly read-only
        user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
        roles = frappe.get_roles()
        is_admin = frappe.session.user == "Administrator" or "PMS HR Admin" in roles
        if not is_admin and user_emp:
            if self.supervisor_2_snapshot == user_emp and user_emp not in [self.employee, self.supervisor_snapshot, self.reviewer_snapshot]:
                frappe.throw("Supervisor 2 has read-only access and cannot edit or modify Performance Plans or Appraisals.", frappe.PermissionError)
            elif "PMS Supervisor 2" in roles and user_emp not in [self.employee, self.supervisor_snapshot, self.reviewer_snapshot]:
                frappe.throw("Supervisor 2 has read-only access and cannot edit or modify Performance Plans or Appraisals.", frappe.PermissionError)

        # 2b. Supervisor Comments & Reviewer Comments restriction:
        # Supervisor Comments can only be modified by assigned Supervisor or Admin.
        # Reviewer Comments can only be modified by assigned Reviewer or Admin.
        # Employee cannot modify either.
        if not is_admin:
            is_supervisor_user = bool(user_emp and self.supervisor_snapshot and user_emp == self.supervisor_snapshot and user_emp != self.employee)
            is_reviewer_user = bool(user_emp and self.reviewer_snapshot and user_emp == self.reviewer_snapshot and user_emp != self.employee)
            if self.is_new():
                for t in self.targets:
                    if not is_supervisor_user:
                        t.target_reviews = None
                    if not is_reviewer_user:
                        t.reviewer_comments = None
            else:
                old_reviews = frappe.get_all("PMS Target", filters={"parent": self.name}, fields=["name", "target_reviews", "reviewer_comments"])
                old_rev_map = {r["name"]: (r.get("target_reviews"), r.get("reviewer_comments")) for r in old_reviews}
                for t in self.targets:
                    old_sup_rev, old_rev_com = old_rev_map.get(t.name, (None, None))
                    if not is_supervisor_user:
                        t.target_reviews = old_sup_rev
                    if not is_reviewer_user:
                        t.reviewer_comments = old_rev_com

        # 3. Prevent direct editing of targets when plan was ALREADY Approved & Monitoring in DB
        if not self.is_new() and self.db_get("plan_status") == "Approved" and self.db_get("workflow_state") == "Monitoring":
            if not getattr(self, "_allow_target_update", False) and frappe.session.user != "Administrator" and "PMS HR Admin" not in frappe.get_roles():
                db_targets = frappe.get_all("PMS Target", filters={"parent": self.name}, fields=["target_description", "weight", "remark"], order_by="idx asc")
                current_targets = [{"target_description": t.target_description, "weight": flt(t.weight, 2), "remark": getattr(t, "remark", None)} for t in self.targets]
                db_targets_formatted = [{"target_description": t.target_description, "weight": flt(t.weight, 2), "remark": getattr(t, "remark", None)} for t in db_targets]
                if current_targets != db_targets_formatted:
                    frappe.throw("Direct editing of targets is locked for Approved Performance Plans. Please use the 'Request Amendment' action.")


        # 5. Validate that Performance Plan can only be created for an Active / Planning Open cycle
        if self.is_new() and self.cycle:
            cycle_status = frappe.db.get_value("PMS Appraisal Cycle", self.cycle, "status")
            if cycle_status not in ["Draft", "Active", "Planning Open", "Monitoring", "Self-Rating Open"]:
                frappe.throw(f"Performance Plans can only be created for Active Appraisal Cycles. Selected cycle '{self.cycle}' is currently in '{cycle_status}' status.")

        # 6. Validate target weights on save
        from gdl_pms.competencies import get_grade_group_weights
        expected_weight = get_grade_group_weights(self.grade_group)["work"]
        total_weight = sum(flt(t.weight) for t in self.targets)
        if self.plan_status not in ["Draft", "Rejected", "Returned", "Returned by Supervisor", "Returned by Reviewer"]:
            if flt(total_weight, 2) != flt(expected_weight, 2):
                frappe.throw(f"Total target weight must be exactly {expected_weight}. Current sum is {flt(total_weight, 2)}.")
        else:
            if flt(total_weight, 2) > flt(expected_weight, 2):
                frappe.throw(f"Total target weight cannot exceed {expected_weight}%. Current sum is {flt(total_weight, 2)}.")

        # 7. Validate score limits for Appraisal Phase
        for t in self.targets:
            w = flt(t.weight)
            if t.self_score is not None and t.self_score != "":
                if flt(t.self_score) < 0 or flt(t.self_score) > w:
                    frappe.throw(f"Target '{t.target_description}': Self Score ({t.self_score}) cannot exceed row weight ({w}) or be negative.")
            if t.supervisor_score is not None and t.supervisor_score != "":
                if flt(t.supervisor_score) < 0 or flt(t.supervisor_score) > w:
                    frappe.throw(f"Target '{t.target_description}': Supervisor Score ({t.supervisor_score}) cannot exceed row weight ({w}) or be negative.")
            if t.reviewer_score is not None and t.reviewer_score != "":
                if flt(t.reviewer_score) < 0 or flt(t.reviewer_score) > w:
                    frappe.throw(f"Target '{t.target_description}': Reviewer Score ({t.reviewer_score}) cannot exceed row weight ({w}) or be negative.")

        for c in self.competencies:
            cw = flt(c.weight)
            if c.self_rating is not None and c.self_rating != "":
                if flt(c.self_rating) < 0 or flt(c.self_rating) > cw:
                    frappe.throw(f"Competency '{c.competency}': Self Rating ({c.self_rating}) cannot exceed weight ({cw}) or be negative.")
            if c.supervisor_rating is not None and c.supervisor_rating != "":
                if flt(c.supervisor_rating) < 0 or flt(c.supervisor_rating) > cw:
                    frappe.throw(f"Competency '{c.competency}': Supervisor Rating ({c.supervisor_rating}) cannot exceed weight ({cw}) or be negative.")
            if c.reviewer_rating is not None and c.reviewer_rating != "":
                if flt(c.reviewer_rating) < 0 or flt(c.reviewer_rating) > cw:
                    frappe.throw(f"Competency '{c.competency}': Reviewer Rating ({c.reviewer_rating}) cannot exceed weight ({cw}) or be negative.")

        # 7. Validate that Supporting Docs (evidence) on Targets is strictly PDF
        for t in self.targets:
            if t.evidence:
                c = str(t.evidence).split("?")[0].strip().lower()
                if not c.endswith(".pdf"):
                    frappe.throw(
                        _("Only PDF files are allowed for Supporting Docs in Target #{0}. Attached file: {1}").format(t.idx or 1, t.evidence)
                    )

        # 8. Strict Role-Based Score Validation during Appraisal Phase
        if not self.is_new() and self.appraisal_status and self.appraisal_status != "Not Activated":
            roles = frappe.get_roles()
            is_admin = frappe.session.user == "Administrator" or "PMS HR Admin" in roles
            user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")

            if not is_admin:
                is_supervisor_user = (user_emp and user_emp == self.supervisor_snapshot)
                is_reviewer_user = (user_emp and user_emp == self.reviewer_snapshot)
                is_employee_user = (user_emp and user_emp == self.employee)

                doc_before = self.get_doc_before_save()
                prev_status = doc_before.appraisal_status if doc_before else self.appraisal_status

                db_targets = {
                    t.name: t for t in frappe.get_all(
                        "PMS Target",
                        filters={"parent": self.name},
                        fields=["name", "self_score", "self_remark", "supervisor_score", "supervisor_remark", "reviewer_score", "reviewer_remark", "target_description", "weight"]
                    )
                }
                db_comps = {
                    c.name: c for c in frappe.get_all(
                        "PMS Competency Score",
                        filters={"parent": self.name},
                        fields=["name", "self_rating", "self_remark", "supervisor_rating", "supervisor_remark", "reviewer_rating", "reviewer_remark"]
                    )
                }

                for t in self.targets:
                    db_t = db_targets.get(t.name)
                    if db_t:
                        # Target Description and Weight cannot be modified in Appraisal phase
                        if (t.target_description or "").strip() != (db_t.target_description or "").strip() or flt(t.weight) != flt(db_t.weight):
                            frappe.throw("Target description and weight are locked and cannot be modified during appraisal phase.")

                        # Reviewer score/remark can ONLY be modified by assigned Reviewer
                        if flt(t.reviewer_score) != flt(db_t.reviewer_score) or (t.reviewer_remark or "") != (db_t.reviewer_remark or ""):
                            if not is_reviewer_user:
                                frappe.throw("Only the assigned Reviewer can enter or edit Reviewer scores and remarks.", frappe.PermissionError)
                            elif prev_status not in ["Disputed - Pending Reviewer", "Pending Reviewer Review", "Under PERC Review"]:
                                frappe.throw(f"Reviewer scores cannot be edited in '{prev_status}' stage.", frappe.PermissionError)

                        # Supervisor score/remark can ONLY be modified by assigned Supervisor
                        if flt(t.supervisor_score) != flt(db_t.supervisor_score) or (t.supervisor_remark or "") != (db_t.supervisor_remark or ""):
                            if not is_supervisor_user:
                                frappe.throw("Only the assigned Supervisor can enter or edit Supervisor scores and remarks.", frappe.PermissionError)
                            elif prev_status != "Pending Supervisor Review":
                                frappe.throw("Supervisor scores cannot be edited outside of the 'Pending Supervisor Review' stage.", frappe.PermissionError)

                        # Self score/remark can ONLY be modified by assigned Employee
                        if flt(t.self_score) != flt(db_t.self_score) or (t.self_remark or "") != (db_t.self_remark or ""):
                            if not is_employee_user:
                                frappe.throw("Only the Employee can enter or edit Self Assessment scores and remarks.", frappe.PermissionError)
                            elif prev_status != "Self-Assessment Pending":
                                frappe.throw("Self Assessment scores cannot be edited after submission.", frappe.PermissionError)

                for c in self.competencies:
                    db_c = db_comps.get(c.name)
                    if db_c:
                        # Reviewer rating/remark can ONLY be modified by assigned Reviewer
                        if flt(c.reviewer_rating) != flt(db_c.reviewer_rating) or (c.reviewer_remark or "") != (db_c.reviewer_remark or ""):
                            if not is_reviewer_user:
                                frappe.throw("Only the assigned Reviewer can enter or edit Reviewer rating and remarks.", frappe.PermissionError)
                            elif prev_status not in ["Disputed - Pending Reviewer", "Pending Reviewer Review", "Under PERC Review"]:
                                frappe.throw(f"Reviewer ratings cannot be edited in '{prev_status}' stage.", frappe.PermissionError)

                        # Supervisor rating/remark can ONLY be modified by assigned Supervisor
                        if flt(c.supervisor_rating) != flt(db_c.supervisor_rating) or (c.supervisor_remark or "") != (db_c.supervisor_remark or ""):
                            if not is_supervisor_user:
                                frappe.throw("Only the assigned Supervisor can enter or edit Supervisor rating and remarks.", frappe.PermissionError)
                            elif prev_status != "Pending Supervisor Review":
                                frappe.throw("Supervisor ratings cannot be edited outside of the 'Pending Supervisor Review' stage.", frappe.PermissionError)

                        # Self rating/remark can ONLY be modified by assigned Employee
                        if flt(c.self_rating) != flt(db_c.self_rating) or (c.self_remark or "") != (db_c.self_remark or ""):
                            if not is_employee_user:
                                frappe.throw("Only the Employee can enter or edit Self Rating and remarks.", frappe.PermissionError)
                            elif prev_status != "Self-Assessment Pending":
                                frappe.throw("Self Rating cannot be edited after submission.", frappe.PermissionError)

        # 9. Live Running Score Computation for Appraisal Phase
        if self.appraisal_status and self.appraisal_status != "Not Activated":
            from gdl_pms import scoring_engine
            is_rev_stage = (
                self.appraisal_status in [
                    "Reviewer Resolved - Pending Employee Decision",
                    "Under PERC Review",
                    "Appraisal Accepted",
                    "Finalized & Locked"
                ]
                or getattr(self, "dispute_flag", 0) == 1
            )
            is_sup_stage = self.appraisal_status in ["Pending Supervisor Review", "Pending Employee Acceptance"]

            if is_rev_stage:
                t_score = sum(flt(t.reviewer_score) if (t.reviewer_score is not None and t.reviewer_score != "" and flt(t.reviewer_score) > 0) else flt(t.supervisor_score or 0) for t in self.targets)
                c_score = sum(flt(c.reviewer_rating) if (c.reviewer_rating is not None and c.reviewer_rating != "" and flt(c.reviewer_rating) > 0) else flt(c.supervisor_rating or 0) for c in self.competencies)
            elif is_sup_stage:
                t_score = sum(flt(t.supervisor_score or 0) for t in self.targets)
                c_score = sum(flt(c.supervisor_rating or 0) for c in self.competencies)
            else:
                # Self-Assessment Pending
                t_score = sum(flt(t.self_score or 0) for t in self.targets)
                c_score = sum(flt(c.self_rating or 0) for c in self.competencies)

            self.total_targets_score = flt(t_score, 2)
            self.total_competency_score = flt(c_score, 2)
            if self.appraisal_status != "Self-Assessment Pending" or not self.total_score:
                self.total_score = flt(t_score + c_score, 2)
                self.rating_band = scoring_engine.get_band(self.total_score)


# ==============================================================================
# APPRAISAL PHASE LIFECYCLE APIS
# ==============================================================================

@frappe.whitelist()
def activate_appraisal_phase(docname):
    """
    Triggered by HR Admin on an Approved Performance Plan in Monitoring stage.
    Transitions plan into the Appraisal Phase with mapped Competencies.
    """
    roles = frappe.get_roles()
    is_hr = frappe.session.user == "Administrator" or "PMS HR Admin" in roles
    if not is_hr:
        frappe.throw("Only HR Admin or System Manager can activate the Appraisal Phase.")

    doc = frappe.get_doc("PMS Appraisal", docname)
    if doc.plan_status != "Approved" or doc.workflow_state != "Monitoring":
        frappe.throw("Appraisal Phase can only be activated for Approved Performance Plans in Monitoring stage.")

    # Ensure mapped competencies based on Grade Group
    expected_comps = get_competencies_for_grade_group(doc.grade_group)

    if not doc.competencies or len(doc.competencies) == 0:
        doc.competencies = []
        for item in expected_comps:
            doc.append("competencies", {
                "competency": item["competency"],
                "definition": item["definition"],
                "weight": item["weight"]
            })
    else:
        # Validate or sync competency weights and definitions
        comp_map = {item["competency"]: item for item in expected_comps}
        for idx, c in enumerate(doc.competencies):
            if c.competency in comp_map:
                c.weight = comp_map[c.competency]["weight"]
                if not getattr(c, "definition", None):
                    c.definition = comp_map[c.competency]["definition"]
            elif idx < len(expected_comps):
                c.weight = expected_comps[idx]["weight"]
                if not getattr(c, "definition", None):
                    c.definition = expected_comps[idx]["definition"]
                    c.definition = expected_comps[idx]["definition"]

    doc.workflow_state = "Appraisal Open"
    doc.appraisal_status = "Self-Assessment Pending"
    doc.add_comment("Comment", f"Appraisal Phase activated by HR Admin ({frappe.session.user}).")
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return "Appraisal Phase Activated"


@frappe.whitelist()
def submit_self_assessment(docname, employee_remarks=None, target_data=None, competency_data=None):
    """
    Stage 1: Employee enters self-scores, remarks, and evidence, then submits to Supervisor.
    """
    doc = frappe.get_doc("PMS Appraisal", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    is_admin = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()

    if doc.employee != user_emp and not is_admin:
        frappe.throw("Only the assigned Employee can submit their Self-Assessment.")

    if doc.appraisal_status != "Self-Assessment Pending":
        frappe.throw(f"Self-Assessment cannot be submitted in status '{doc.appraisal_status}'.")

    # Update targets if passed
    if target_data:
        if isinstance(target_data, str):
            target_data = json.loads(target_data)
        for idx, t_in in enumerate(target_data):
            if idx < len(doc.targets):
                if "self_score" in t_in and t_in["self_score"] is not None and t_in["self_score"] != "":
                    doc.targets[idx].self_score = flt(t_in["self_score"])
                if "self_remark" in t_in:
                    doc.targets[idx].self_remark = t_in["self_remark"]
                if "evidence" in t_in:
                    ev = t_in["evidence"]
                    if ev:
                        c = str(ev).split("?")[0].strip().lower()
                        if not c.endswith(".pdf"):
                            frappe.throw(
                                _("Only PDF files are allowed for Supporting Docs in Target #{0}. Attached file: {1}").format(idx + 1, ev)
                            )
                    doc.targets[idx].evidence = ev

    # Update competencies if passed
    if competency_data:
        if isinstance(competency_data, str):
            competency_data = json.loads(competency_data)
        for idx, c_in in enumerate(competency_data):
            if idx < len(doc.competencies):
                if "self_rating" in c_in and c_in["self_rating"] is not None and c_in["self_rating"] != "":
                    doc.competencies[idx].self_rating = flt(c_in["self_rating"])
                if "self_remark" in c_in:
                    doc.competencies[idx].self_remark = c_in["self_remark"]

    if employee_remarks:
        doc.employee_overall_remarks = employee_remarks

    # Populate targets and competency scores
    work_score = sum(flt(t.self_score or 0) for t in doc.targets)
    comp_score = sum(flt(c.self_rating or 0) for c in doc.competencies)
    doc.total_targets_score = flt(work_score, 2)
    doc.total_competency_score = flt(comp_score, 2)

    doc.appraisal_status = "Pending Supervisor Review"
    doc.add_comment("Comment", f"Self-Assessment submitted by {doc.employee_name}.")
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    try:
        from gdl_pms.email_service import notify_self_assessment_submitted
        sup_email = _get_employee_email(doc.supervisor_snapshot)
        if sup_email:
            notify_self_assessment_submitted(doc, sup_email)
    except Exception as e:
        frappe.logger().error(f"Failed sending self-assessment email: {str(e)}")

    try:
        from gdl_pms.notification_service import notify_in_app_self_assessment_submitted, _get_employee_user_id
        sup_user = _get_employee_user_id(doc.supervisor_snapshot)
        if sup_user:
            notify_in_app_self_assessment_submitted(doc, sup_user)
    except Exception as e:
        frappe.logger().error(f"Failed sending self-assessment in-app notification: {str(e)}")

    return "Self-Assessment Submitted"


@frappe.whitelist()
def submit_supervisor_review(docname, supervisor_remarks=None, target_data=None, competency_data=None):
    """
    Stage 2: Supervisor enters scores and remarks, computes provisional score, and submits to Employee.
    """
    doc = frappe.get_doc("PMS Appraisal", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    is_admin = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()

    if doc.supervisor_snapshot != user_emp and not is_admin:
        frappe.throw("Only the assigned Supervisor can submit this appraisal evaluation.")

    if doc.appraisal_status != "Pending Supervisor Review":
        frappe.throw(f"Supervisor evaluation cannot be submitted in status '{doc.appraisal_status}'.")

    if target_data:
        if isinstance(target_data, str):
            target_data = json.loads(target_data)
        for idx, t_in in enumerate(target_data):
            if idx < len(doc.targets):
                if "supervisor_score" in t_in and t_in["supervisor_score"] is not None and t_in["supervisor_score"] != "":
                    doc.targets[idx].supervisor_score = flt(t_in["supervisor_score"])
                if "supervisor_remark" in t_in:
                    doc.targets[idx].supervisor_remark = t_in["supervisor_remark"]

    if competency_data:
        if isinstance(competency_data, str):
            competency_data = json.loads(competency_data)
        for idx, c_in in enumerate(competency_data):
            if idx < len(doc.competencies):
                if "supervisor_rating" in c_in and c_in["supervisor_rating"] is not None and c_in["supervisor_rating"] != "":
                    doc.competencies[idx].supervisor_rating = flt(c_in["supervisor_rating"])
                if "supervisor_remark" in c_in:
                    doc.competencies[idx].supervisor_remark = c_in["supervisor_remark"]

    if supervisor_remarks:
        doc.supervisor_overall_remarks = supervisor_remarks

    # Compute provisional total score & rating band
    work_score = sum(flt(t.supervisor_score or 0) for t in doc.targets)
    comp_score = sum(flt(c.supervisor_rating or 0) for c in doc.competencies)
    doc.total_targets_score = flt(work_score, 2)
    doc.total_competency_score = flt(comp_score, 2)
    doc.total_score = flt(work_score + comp_score, 2)
    doc.rating_band = scoring_engine.get_band(doc.total_score)

    doc.appraisal_status = "Pending Employee Acceptance"
    doc.add_comment("Comment", f"Supervisor evaluation submitted by {frappe.session.user}. Provisional Score: {doc.total_score} ({doc.rating_band}).")
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    try:
        from gdl_pms.email_service import notify_supervisor_scores_submitted
        emp_email = _get_employee_email(doc.employee)
        if emp_email:
            notify_supervisor_scores_submitted(doc, emp_email)
    except Exception as e:
        frappe.logger().error(f"Failed sending supervisor review email: {str(e)}")

    try:
        from gdl_pms.notification_service import notify_in_app_supervisor_scores_submitted, _get_employee_user_id
        emp_user = _get_employee_user_id(doc.employee)
        if emp_user:
            notify_in_app_supervisor_scores_submitted(doc, emp_user)
    except Exception as e:
        frappe.logger().error(f"Failed sending supervisor review in-app notification: {str(e)}")

    return "Supervisor Assessment Submitted"


@frappe.whitelist()
def accept_supervisor_scores(docname):
    """
    Stage 3A: Employee accepts Supervisor's evaluation.
    Forwarded to Reviewer for scoring/review (Normal Flow, dispute_flag = 0).
    """
    doc = frappe.get_doc("PMS Appraisal", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    is_admin = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()

    if doc.employee != user_emp and not is_admin:
        frappe.throw("Only the assigned Employee can accept their appraisal.")

    if doc.appraisal_status != "Pending Employee Acceptance":
        frappe.throw(f"Action not valid in status '{doc.appraisal_status}'.")

    doc.dispute_flag = 0
    doc.appraisal_status = "Pending Reviewer Review"
    doc.add_comment("Comment", f"Supervisor evaluation accepted by employee {doc.employee_name}. Forwarded to Reviewer ({doc.reviewer_name or doc.reviewer_snapshot}) for review and scoring.")
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    try:
        rev_email = _get_employee_email(doc.reviewer_snapshot)
        if rev_email:
            frappe.sendmail(
                recipients=[rev_email],
                subject=f"[GDL PMS] Performance Appraisal Pending Review - {doc.employee_name} ({doc.cycle})",
                message=f"Dear Reviewer,<br><br>The Performance Appraisal for <b>{doc.employee_name}</b> has been accepted by the employee and forwarded to you for review and scoring.<br><br>Please review and submit your evaluation in the PMS portal."
            )
    except Exception as e:
        frappe.logger().error(f"Failed sending reviewer email notification: {str(e)}")

    return "Forwarded to Reviewer"


@frappe.whitelist()
def raise_dispute(docname, dispute_reason):
    """
    Stage 3B: Employee raises a dispute against Supervisor's evaluation, sending case to Reviewer.
    """
    if not dispute_reason or not str(dispute_reason).strip():
        frappe.throw("Dispute reason is mandatory.")

    doc = frappe.get_doc("PMS Appraisal", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    is_admin = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()

    if doc.employee != user_emp and not is_admin:
        frappe.throw("Only the assigned Employee can raise a dispute.")

    if doc.appraisal_status != "Pending Employee Acceptance":
        frappe.throw(f"Dispute cannot be raised in status '{doc.appraisal_status}'.")

    doc.dispute_flag = 1
    doc.dispute_reason = dispute_reason
    doc.appraisal_status = "Disputed - Pending Reviewer"
    doc.add_comment("Comment", f"Dispute raised by employee {doc.employee_name}: \"{dispute_reason}\". Escalated to Reviewer ({doc.reviewer_name or doc.reviewer_snapshot}).")
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    try:
        from gdl_pms.email_service import notify_dispute_raised
        rev_email = _get_employee_email(doc.reviewer_snapshot)
        if rev_email:
            notify_dispute_raised(doc, rev_email, dispute_reason)
    except Exception as e:
        frappe.logger().error(f"Failed sending dispute email: {str(e)}")

    try:
        from gdl_pms.notification_service import notify_in_app_dispute_raised, _get_employee_user_id
        rev_user = _get_employee_user_id(doc.reviewer_snapshot)
        if rev_user:
            notify_in_app_dispute_raised(doc, rev_user, dispute_reason)
    except Exception as e:
        frappe.logger().error(f"Failed sending dispute in-app notification: {str(e)}")

    return "Dispute Raised & Escalated to Reviewer"


@frappe.whitelist()
def submit_reviewer_decision(docname, reviewer_remarks=None, target_data=None, competency_data=None):
    """
    Stage 4: Reviewer evaluates disputed appraisal, submits score validations/overrides.
    """
    doc = frappe.get_doc("PMS Appraisal", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    is_admin = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()

    if doc.reviewer_snapshot != user_emp and not is_admin:
        frappe.throw("Only the assigned Reviewer can resolve this dispute.")

    if doc.appraisal_status not in ["Disputed - Pending Reviewer", "Pending Reviewer Review"]:
        frappe.throw(f"Reviewer decision cannot be submitted in status '{doc.appraisal_status}'.")

    if target_data:
        if isinstance(target_data, str):
            target_data = json.loads(target_data)
        for idx, t_in in enumerate(target_data):
            if idx < len(doc.targets):
                if "reviewer_score" in t_in and t_in["reviewer_score"] is not None and t_in["reviewer_score"] != "":
                    doc.targets[idx].reviewer_score = flt(t_in["reviewer_score"])
                if "reviewer_remark" in t_in:
                    doc.targets[idx].reviewer_remark = t_in["reviewer_remark"]

    if competency_data:
        if isinstance(competency_data, str):
            competency_data = json.loads(competency_data)
        for idx, c_in in enumerate(competency_data):
            if idx < len(doc.competencies):
                if "reviewer_rating" in c_in and c_in["reviewer_rating"] is not None and c_in["reviewer_rating"] != "":
                    doc.competencies[idx].reviewer_rating = flt(c_in["reviewer_rating"])
                if "reviewer_remark" in c_in:
                    doc.competencies[idx].reviewer_remark = c_in["reviewer_remark"]

    if reviewer_remarks:
        doc.reviewer_overall_remarks = reviewer_remarks

    # Re-compute total score based on reviewer decisions
    work_score = sum(flt(t.reviewer_score) if (t.reviewer_score is not None and t.reviewer_score != "" and flt(t.reviewer_score) > 0) else flt(t.supervisor_score or 0) for t in doc.targets)
    comp_score = sum(flt(c.reviewer_rating) if (c.reviewer_rating is not None and c.reviewer_rating != "" and flt(c.reviewer_rating) > 0) else flt(c.supervisor_rating or 0) for c in doc.competencies)
    doc.total_targets_score = flt(work_score, 2)
    doc.total_competency_score = flt(comp_score, 2)
    doc.total_score = flt(work_score + comp_score, 2)
    doc.rating_band = scoring_engine.get_band(doc.total_score)

    doc.appraisal_status = "Reviewer Resolved - Pending Employee Decision"
    doc.add_comment("Comment", f"Reviewer dispute resolution submitted by {frappe.session.user}. Validated Score: {doc.total_score} ({doc.rating_band}).")
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return "Reviewer Decision Submitted"


@frappe.whitelist()
def accept_reviewer_decision(docname):
    """
    Stage 5A: Employee accepts Reviewer's dispute decision.
    """
    doc = frappe.get_doc("PMS Appraisal", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    is_admin = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()

    if doc.employee != user_emp and not is_admin:
        frappe.throw("Only the assigned Employee can accept the reviewer decision.")

    if doc.appraisal_status != "Reviewer Resolved - Pending Employee Decision":
        frappe.throw(f"Action not valid in status '{doc.appraisal_status}'.")

    doc.appraisal_status = "Appraisal Accepted"
    doc.add_comment("Comment", f"Reviewer decision accepted by employee {doc.employee_name}.")
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return "Reviewer Decision Accepted"


@frappe.whitelist()
def request_perc_review(docname, justification):
    """
    Stage 5B: Employee disagrees with Reviewer and requests formal PERC escalation.
    Creates a linked PERC Case record.
    """
    if not justification or not str(justification).strip():
        frappe.throw("Justification for PERC request is mandatory.")

    doc = frappe.get_doc("PMS Appraisal", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    is_admin = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()

    if doc.employee != user_emp and not is_admin:
        frappe.throw("Only the assigned Employee can request a PERC review.")

    if doc.appraisal_status != "Reviewer Resolved - Pending Employee Decision":
        frappe.throw(f"PERC request cannot be raised in status '{doc.appraisal_status}'.")

    # Check or create PERC Case
    existing_perc = frappe.db.get_value("PERC Case", {"appraisal": docname}, "name")
    if not existing_perc:
        perc = frappe.get_doc({
            "doctype": "PERC Case",
            "appraisal": doc.name,
            "raised_by": doc.employee,
            "justification": justification,
            "status": "Open"
        }).insert(ignore_permissions=True)
        doc.perc_case = perc.name
    else:
        doc.perc_case = existing_perc

    doc.appraisal_status = "Under PERC Review"
    doc.add_comment("Comment", f"PERC Review requested by employee {doc.employee_name}. Case {doc.perc_case} opened. Justification: \"{justification}\".")
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    try:
        from gdl_pms.notification_service import notify_in_app_perc_requested, get_hr_users
        notify_in_app_perc_requested(doc, doc.perc_case, justification)
        hr_emails = [
            frappe.db.get_value("User", u, "email") or u
            for u in get_hr_users()
        ]
        if hr_emails:
            from gdl_pms.email_service import notify_perc_requested
            notify_perc_requested(doc, doc.perc_case, justification, hr_emails)
    except Exception as e:
        frappe.logger().error(f"Failed sending PERC request notifications: {str(e)}")

    return doc.perc_case


@frappe.whitelist()
def lock_appraisal(docname, final_score=None):
    """
    Stage 6: HR Admin reviews appraisal (post-acceptance or post-PERC), updates final score if needed, and locks it permanently.
    """
    roles = frappe.get_roles()
    is_hr = frappe.session.user == "Administrator" or "PMS HR Admin" in roles
    if not is_hr:
        frappe.throw("Only HR Admin or System Manager can lock appraisals.")

    doc = frappe.get_doc("PMS Appraisal", docname)
    if doc.appraisal_status not in ["Appraisal Accepted", "Under PERC Review", "Reviewer Resolved - Pending Employee Decision"]:
        frappe.throw(f"Cannot lock appraisal in status '{doc.appraisal_status}'.")

    if final_score is not None and final_score != "":
        doc.total_score = flt(final_score, 2)
        doc.rating_band = scoring_engine.get_band(doc.total_score)

    doc.locked = 1
    doc.workflow_state = "Appraisal Completed"
    doc.appraisal_status = "Finalized & Locked"
    doc.add_comment("Comment", f"Appraisal finalized and locked by HR Admin ({frappe.session.user}). Final Score: {doc.total_score} ({doc.rating_band}).")
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    try:
        from gdl_pms.email_service import notify_appraisal_locked
        emp_email = _get_employee_email(doc.employee)
        if emp_email:
            notify_appraisal_locked(doc, emp_email, doc.total_score)
    except Exception as e:
        frappe.logger().error(f"Failed sending appraisal locked email: {str(e)}")

    try:
        from gdl_pms.notification_service import notify_in_app_appraisal_locked, _get_employee_user_id
        emp_user = _get_employee_user_id(doc.employee)
        if emp_user:
            notify_in_app_appraisal_locked(doc, emp_user, doc.total_score)
    except Exception as e:
        frappe.logger().error(f"Failed sending appraisal locked in-app notification: {str(e)}")

    # Auto-upload final rating to Employee Master
    try:
        sync_appraisal_to_employee_master(doc)
    except Exception as e:
        frappe.logger().error(f"Failed auto-syncing appraisal {doc.name} to employee master: {str(e)}")

    return "Appraisal Finalized & Locked"


@frappe.whitelist()
def sync_appraisal_to_employee_master(docname):
    """
    Uploads/syncs the finalized PMS Appraisal rating into Employee Master under Employee PMS Evaluation table.
    """
    doc = frappe.get_doc("PMS Appraisal", docname) if isinstance(docname, str) else docname

    if not doc.employee:
        frappe.throw("No employee linked to this appraisal.")

    if not doc.locked and doc.appraisal_status != "Finalized & Locked":
        frappe.throw(f"Appraisal {doc.name} is not finalized yet. Current status: {doc.appraisal_status}")

    # Fetch Cycle Details if available
    cycle_doc = None
    if doc.cycle:
        cycle_doc = frappe.db.get_value(
            "PMS Appraisal Cycle",
            doc.cycle,
            ["cycle_type", "start_date", "end_date", "calendar_year", "name"],
            as_dict=True
        )

    # 1. PMS Year
    pms_year = doc.calendar_year
    if not pms_year and cycle_doc and cycle_doc.calendar_year:
        pms_year = cycle_doc.calendar_year
    if not pms_year and doc.cycle_end_date:
        pms_year = getdate(doc.cycle_end_date).year
    if not pms_year:
        pms_year = getdate().year
    try:
        pms_year = int(pms_year)
    except Exception:
        pms_year = getdate().year

    # 2. PMS Cycle
    cycle_type = (cycle_doc.cycle_type if cycle_doc and cycle_doc.cycle_type else "Annual")
    if cycle_type not in ["Annual", "Mid-Year", "Quarterly", "Probation"]:
        cycle_type = "Annual"

    # 3. Evaluation Period
    eval_period = ""
    start_d = cycle_doc.start_date if cycle_doc and cycle_doc.start_date else None
    end_d = cycle_doc.end_date if cycle_doc and cycle_doc.end_date else doc.cycle_end_date
    if start_d and end_d:
        try:
            start_fmt = formatdate(start_d, "MMMM yyyy")
            end_fmt = formatdate(end_d, "MMMM yyyy")
            eval_period = f"{start_fmt}–{end_fmt}" if start_fmt != end_fmt else start_fmt
        except Exception:
            eval_period = f"{start_d} to {end_d}"
    else:
        eval_period = f"January–December {pms_year}"

    # 4. Overall Rating & Description
    score_val = doc.total_score or 0
    overall_rating = int(round(flt(score_val)))
    rating_desc = doc.rating_band or scoring_engine.get_band(score_val)

    # 5. Approvers & Final Approver
    sup_emp = doc.supervisor_snapshot
    rev_emp = doc.reviewer_snapshot

    # Current user's linked employee as Final Approver, or Administrator
    final_approver = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not final_approver and rev_emp:
        final_approver = rev_emp

    approval_date = today()
    remarks = f"Overall PMS Score: {flt(score_val, 2)} ({rating_desc}). Finalized in cycle {doc.cycle or ''}."

    # Update Employee Document
    emp = frappe.get_doc("Employee", doc.employee)

    # Check if entry for this appraisal or cycle already exists
    matched_row = None
    for row in (emp.get("pms_evaluations") or []):
        if row.appraisal_reference == doc.name:
            matched_row = row
            break
        elif row.pms_year == pms_year and row.pms_cycle == cycle_type:
            matched_row = row
            break

    if matched_row:
        matched_row.employee = doc.employee
        matched_row.pms_year = pms_year
        matched_row.pms_cycle = cycle_type
        matched_row.evaluation_period = eval_period
        matched_row.overall_rating = overall_rating
        matched_row.rating_description = rating_desc
        matched_row.supervisor = sup_emp
        matched_row.reviewer = rev_emp
        matched_row.final_approver = final_approver
        matched_row.final_approval_date = approval_date
        matched_row.remarks = remarks
        matched_row.appraisal_reference = doc.name
    else:
        emp.append("pms_evaluations", {
            "employee": doc.employee,
            "pms_year": pms_year,
            "pms_cycle": cycle_type,
            "evaluation_period": eval_period,
            "overall_rating": overall_rating,
            "rating_description": rating_desc,
            "supervisor": sup_emp,
            "reviewer": rev_emp,
            "final_approver": final_approver,
            "final_approval_date": approval_date,
            "remarks": remarks,
            "appraisal_reference": doc.name
        })

    emp.save(ignore_permissions=True)
    frappe.db.commit()

    return f"Successfully uploaded evaluation for {emp.employee_name or doc.employee} to Employee Master."


# ==============================================================================
# PLANNING & AMENDMENT METHODS (Preserved & Maintained)
# ==============================================================================

@frappe.whitelist()
def open_amendment_window(docname):
    roles = frappe.get_roles()
    is_hr = frappe.session.user == "Administrator" or "PMS HR Admin" in roles
    if not is_hr:
        frappe.throw("Only HR Admin or System Manager can open the Amendment Window.")

    doc = frappe.get_doc("PMS Appraisal", docname)
    if doc.plan_status != "Approved" or doc.workflow_state != "Monitoring":
        frappe.throw("Amendment Window can only be opened for Approved Performance Plans in Monitoring stage.")

    doc.amendment_window_open = 1
    doc.save(ignore_permissions=True)

    # Automatically create a draft PMS Plan Amendment for this performance plan if none exists
    existing_pending = frappe.db.exists("PMS Plan Amendment", {
        "performance_plan": doc.name,
        "status": ["in", ["Draft", "Pending Supervisor Approval", "Pending Reviewer Approval"]]
    })

    created_amendment_name = existing_pending
    if not existing_pending:
        emp_user = frappe.db.get_value("Employee", doc.employee, "user_id")
        amendment = frappe.get_doc({
            "doctype": "PMS Plan Amendment",
            "performance_plan": doc.name,
            "status": "Draft",
            "owner": emp_user or frappe.session.user
        })
        amendment.flags.ignore_permissions = True
        amendment.insert(ignore_permissions=True)
        frappe.db.commit()
        created_amendment_name = amendment.name
        doc.add_comment("Comment", f"Amendment Window opened by {frappe.session.user} (HR Admin). Draft amendment {amendment.name} created automatically for employee.")
    else:
        doc.add_comment("Comment", f"Amendment Window opened by {frappe.session.user} (HR Admin). Active amendment {existing_pending} already exists.")

    return {
        "message": "Amendment Window Opened",
        "amendment": created_amendment_name
    }


@frappe.whitelist()
def close_amendment_window(docname):
    roles = frappe.get_roles()
    is_hr = frappe.session.user == "Administrator" or "PMS HR Admin" in roles
    if not is_hr:
        frappe.throw("Only HR Admin or System Manager can close the Amendment Window.")

    doc = frappe.get_doc("PMS Appraisal", docname)
    doc.amendment_window_open = 0
    doc.save(ignore_permissions=True)
    doc.add_comment("Comment", f"Amendment Window closed by {frappe.session.user} (HR Admin).")
    return "Amendment Window Closed"


@frappe.whitelist()
def request_amendment(docname):
    doc = frappe.get_doc("PMS Appraisal", docname)

    if doc.plan_status != "Approved" or doc.workflow_state != "Monitoring":
        frappe.throw("Amendments can only be requested for Approved plans in Monitoring stage.")

    is_hr = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()
    if not doc.amendment_window_open and not is_hr:
        frappe.throw("The Amendment Window for this Performance Plan is currently closed by HR Admin.")

    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if doc.employee != user_emp and not is_hr:
        frappe.throw("Only the assigned Employee can request an amendment.")

    existing_pending = frappe.db.exists("PMS Plan Amendment", {
        "performance_plan": doc.name,
        "status": ["in", ["Draft", "Pending Supervisor Approval", "Pending Reviewer Approval"]]
    })
    if existing_pending:
        return existing_pending

    emp_user = frappe.db.get_value("Employee", doc.employee, "user_id")
    amendment = frappe.get_doc({
        "doctype": "PMS Plan Amendment",
        "performance_plan": doc.name,
        "status": "Draft",
        "owner": emp_user or frappe.session.user
    })
    amendment.flags.ignore_permissions = True
    amendment.insert(ignore_permissions=True)
    frappe.db.commit()
    return amendment.name


def _get_employee_email(emp_id):
    """Helper to fetch user_id/email for an employee"""
    if not emp_id:
        return None
    return frappe.db.get_value("Employee", emp_id, "user_id") or frappe.db.get_value("Employee", emp_id, "company_email")


@frappe.whitelist()
def get_employee_details(employee=None):
    if not employee:
        employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not employee:
        return None
        
    emp_data = frappe.db.get_value(
        "Employee",
        employee,
        ["name", "employee_name", "designation", "department", "grade_group", "reports_to", "reviewer", "supervisor_2"],
        as_dict=True
    )
    if emp_data:
        grade = emp_data.get("grade_group") or "OS_ESP"
        emp_data["grade_group"] = grade
        emp_data["is_ps"] = (grade == "PS_CS")
        emp_data["is_os"] = (grade == "OS_ESP")
        emp_data["category_code"] = "PS" if grade == "PS_CS" else "OS"
        emp_data["category_name"] = "PS (Professional Staff)" if grade == "PS_CS" else "OS (Operating Staff)"
        from gdl_pms.competencies import get_grade_group_weights
        weights = get_grade_group_weights(grade)
        emp_data["target_weight"] = weights["work"]
        emp_data["competency_weight"] = weights["competency"]
        emp_data["comp_per_row"] = 8 if grade == "PS_CS" else 10
        emp_data["supervisor_name"] = frappe.db.get_value("Employee", emp_data.get("reports_to"), "employee_name") if emp_data.get("reports_to") else ""
        emp_data["reviewer_name"] = frappe.db.get_value("Employee", emp_data.get("reviewer"), "employee_name") if emp_data.get("reviewer") else ""
        emp_data["supervisor_2_name"] = frappe.db.get_value("Employee", emp_data.get("supervisor_2"), "employee_name") if emp_data.get("supervisor_2") else ""
    return emp_data

@frappe.whitelist()
def get_cycles_for_employee(doctype, txt, searchfield, start, page_len, filters=None, as_dict=False, **kwargs):
    if isinstance(filters, str):
        try:
            filters = json.loads(filters)
        except Exception:
            filters = {}
    filters = filters or {}
    employee = filters.get("employee")
    if not employee:
        employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")

    allowed_statuses = ["Active", "Planning Open", "Monitoring", "Self-Rating Open"]
    conditions = ["c.status IN %(statuses)s"]
    values = {
        "statuses": tuple(allowed_statuses),
        "txt": f"%{txt}%",
        "start": int(start or 0),
        "page_len": int(page_len or 20),
    }

    if txt:
        conditions.append("(c.name LIKE %(txt)s OR c.cycle_name LIKE %(txt)s)")

    if employee:
        emp_grade = frappe.db.get_value("Employee", employee, "grade_group")
        values["employee"] = employee
        values["grade_group"] = emp_grade or "OS_ESP"
        conditions.append("""(
            c.name IN (SELECT parent FROM `tabPMS Appraisal Cycle Employee` WHERE employee = %(employee)s)
            OR (
                NOT EXISTS (SELECT 1 FROM `tabPMS Appraisal Cycle Employee` WHERE parent = c.name)
                AND (c.grade_group = 'All' OR c.grade_group = %(grade_group)s)
            )
        )""")

    where_clause = " AND ".join(conditions)
    query_sql = f"""
        SELECT c.name, c.cycle_name
        FROM `tabPMS Appraisal Cycle` c
        WHERE {where_clause}
        ORDER BY c.creation DESC
        LIMIT %(start)s, %(page_len)s
    """
    results = frappe.db.sql(query_sql, values, as_dict=as_dict)
    return results


@frappe.whitelist()
def get_current_employee():
    return get_employee_details()

@frappe.whitelist()
def is_authorized_to_approve(docname):
    doc = frappe.get_doc("PMS Appraisal", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    is_sys_mgr = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()
    
    if doc.plan_status == "Pending Supervisor Approval":
        return bool(doc.supervisor_snapshot == user_emp or is_sys_mgr)
    elif doc.plan_status == "Pending Reviewer Approval":
        return bool(doc.reviewer_snapshot == user_emp or is_sys_mgr)
        
    return False


@frappe.whitelist()
def send_for_approval(docname):
    doc = frappe.get_doc("PMS Appraisal", docname)
    
    if doc.plan_status not in ["Draft", "Rejected", "Returned", "Returned by Supervisor", "Returned by Reviewer"]:
        frappe.throw("Only Draft or Returned plans can be sent for approval.")
        
    from gdl_pms.competencies import get_grade_group_weights
    expected_weight = get_grade_group_weights(doc.grade_group)["work"]
    total_weight = sum(flt(t.weight) for t in doc.targets)
    if flt(total_weight, 2) != flt(expected_weight, 2):
        frappe.throw(f"Total target weight must be exactly {expected_weight}. Current sum is {flt(total_weight, 2)}.")

    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    roles = frappe.get_roles()
    is_admin = frappe.session.user == "Administrator" or "PMS HR Admin" in roles
    is_supervisor = bool(user_emp and doc.supervisor_snapshot and user_emp == doc.supervisor_snapshot)
    if doc.employee != user_emp and not is_supervisor and not is_admin:
        frappe.throw("Not authorized.")

    is_resubmit = bool(getattr(doc, "first_submission_done", 0) or doc.plan_revision_remark or doc.plan_rejection_remark or doc.plan_status in ["Returned", "Rejected", "Returned by Supervisor", "Returned by Reviewer"])

    if not doc.plan_agreement:
        if not is_resubmit:
            frappe.throw("Please tick one of the Performance Plan discussion & agreement declaration options before submitting for approval.")
        else:
            frappe.throw("Please tick the declaration ('I have discussed and understood the Performance Plan above and agree to the goals on which my performance would be evaluated.') before resubmitting.")

    if doc.plan_revision_remark or doc.plan_revision_changes:
        doc.add_comment("Comment", f"Performance Plan resubmitted after revisions. Agreement declaration: \"{doc.plan_agreement}\".")
        doc.plan_revision_remark = None
        doc.plan_revision_changes = None
        doc.revised_by_role = None
    elif doc.plan_status in ["Rejected", "Returned", "Returned by Supervisor", "Returned by Reviewer"]:
        doc.add_comment("Comment", f"Performance Plan resubmitted after return. Agreement declaration: \"{doc.plan_agreement}\".")
    elif doc.plan_agreement == "Initial Proposed":
        doc.add_comment("Comment", f"Initial Performance Plan submitted by Employee ({doc.employee_name or doc.employee}) proposed to be discussed with Supervisor.")
    else:
        doc.add_comment("Comment", f"Performance Plan submitted for approval by Employee ({doc.employee_name or doc.employee}).")

    if doc.plan_agreement == "Disagreed":
        doc.plan_status = "Pending Supervisor Approval"
        doc.add_comment("Comment", f"Performance Plan submitted to Supervisor {doc.supervisor_name or doc.supervisor_snapshot} for discussion and approval. Note: Submitter indicated disagreement with the goals on which performance would be evaluated.")
    else:
        doc.plan_status = "Pending Supervisor Approval"

    doc.first_submission_done = 1
    doc.workflow_state = "Planning Open"
    doc.plan_rejection_remark = None
    doc.save(ignore_permissions=True)

    try:
        from gdl_pms.email_service import notify_plan_submitted
        target_approver = doc.supervisor_snapshot
        approver_email = _get_employee_email(target_approver)
        if approver_email:
            notify_plan_submitted(doc, approver_email)
    except Exception as e:
        frappe.logger().error(f"Failed sending plan submission email: {str(e)}")

    try:
        from gdl_pms.notification_service import notify_in_app_plan_submitted, _get_employee_user_id
        target_approver = doc.supervisor_snapshot
        approver_user = _get_employee_user_id(target_approver)
        if approver_user:
            notify_in_app_plan_submitted(doc, approver_user)
    except Exception as e:
        frappe.logger().error(f"Failed sending plan submission in-app notification: {str(e)}")

    # If employee disagreed with the goals, notify HR Admin / HR Manager to involve support in finalization
    if doc.plan_agreement == "Disagreed":
        try:
            from gdl_pms.notification_service import notify_in_app_plan_disagreed_hr, get_hr_users
            notify_in_app_plan_disagreed_hr(doc)
            from gdl_pms.email_service import notify_plan_disagreed_hr
            hr_users = get_hr_users()
            hr_emails = [frappe.db.get_value("User", u, "email") or u for u in hr_users if "@" in (frappe.db.get_value("User", u, "email") or u)]
            if hr_emails:
                notify_plan_disagreed_hr(doc, hr_emails)
        except Exception as e:
            frappe.logger().error(f"Failed sending plan disagreement notification to HR: {str(e)}")

    return f"Sent for {doc.plan_status}"


@frappe.whitelist()
def return_to_employee_with_edits(docname, remark=None, targets=None):
    return return_plan(docname, remark, targets=targets)


@frappe.whitelist()
def approve_plan(docname, comment=None, targets=None):
    doc = frappe.get_doc("PMS Appraisal", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    is_sys_mgr = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()

    approver_name = frappe.db.get_value("Employee", user_emp, "employee_name") if user_emp else frappe.session.user
    comment_suffix = f': "{comment}"' if comment else ""

    if targets:
        import json
        parsed = json.loads(targets) if isinstance(targets, str) else targets
        target_map = {}
        for t in (parsed or []):
            t_dict = t.as_dict() if hasattr(t, "as_dict") else (t if isinstance(t, dict) else {})
            if t_dict.get("name"):
                target_map[t_dict.get("name")] = t_dict
        for t in doc.targets:
            if t.name in target_map:
                if doc.plan_status == "Pending Supervisor Approval" or is_sys_mgr:
                    if "target_reviews" in target_map[t.name]:
                        t.target_reviews = target_map[t.name].get("target_reviews")
                if doc.plan_status == "Pending Reviewer Approval" or is_sys_mgr:
                    if "reviewer_comments" in target_map[t.name]:
                        t.reviewer_comments = target_map[t.name].get("reviewer_comments")

    if doc.plan_status == "Pending Supervisor Approval":
        if doc.supervisor_snapshot != user_emp and not is_sys_mgr:
            frappe.throw("Only the assigned Supervisor can approve this plan.")
        if doc.reviewer_snapshot:
            doc.plan_status = "Pending Reviewer Approval"
            doc.workflow_state = "Planning Open"
            doc.add_comment("Comment", f"Performance Plan approved by Supervisor {approver_name} ({frappe.session.user}){comment_suffix}. Forwarded for Reviewer Approval.")
        else:
            doc.plan_status = "Approved"
            doc.workflow_state = "Monitoring"
            doc.add_comment("Comment", f"Performance Plan approved by Supervisor {approver_name} ({frappe.session.user}){comment_suffix}. Plan is now Approved & Active.")
            
    elif doc.plan_status == "Pending Reviewer Approval":
        if doc.reviewer_snapshot != user_emp and not is_sys_mgr:
            frappe.throw("Only the assigned Reviewer can approve this plan.")
        doc.plan_status = "Approved"
        doc.workflow_state = "Monitoring"
        doc.add_comment("Comment", f"Performance Plan approved by Reviewer {approver_name} ({frappe.session.user}){comment_suffix}. Plan is now Approved & Active.")
    else:
        frappe.throw("Plan is not pending your approval.")

    doc.save(ignore_permissions=True)

    try:
        from gdl_pms.email_service import (
            notify_plan_approved,
            notify_plan_submitted,
            notify_plan_approved_pending_agreement
        )
        from gdl_pms.notification_service import (
            notify_in_app_plan_approved,
            notify_in_app_plan_forwarded_reviewer,
            notify_in_app_plan_approved_pending_agreement,
            _get_employee_user_id
        )
        if doc.plan_status == "Pending Reviewer Approval":
            rev_email = _get_employee_email(doc.reviewer_snapshot)
            if rev_email:
                notify_plan_submitted(doc, rev_email)
            rev_user = _get_employee_user_id(doc.reviewer_snapshot)
            if rev_user:
                notify_in_app_plan_forwarded_reviewer(doc, rev_user)
        elif doc.plan_status == "Approved":
            emp_email = _get_employee_email(doc.employee)
            emp_user = _get_employee_user_id(doc.employee)
            if doc.plan_agreement != "Agreed":
                # In case agreed declaration was not ticked by employee when Reviewer approves, share link to tick that
                if emp_email:
                    notify_plan_approved_pending_agreement(doc, emp_email)
                if emp_user:
                    notify_in_app_plan_approved_pending_agreement(doc, emp_user)
            else:
                if emp_email:
                    notify_plan_approved(doc, emp_email)
                if emp_user:
                    notify_in_app_plan_approved(doc, emp_user)
    except Exception as e:
        frappe.logger().error(f"Failed sending plan approval notifications: {str(e)}")

    return "Plan Approved"


@frappe.whitelist()
def confirm_plan_agreement(docname):
    """Allows an employee (or HR Admin) to confirm agreement declaration on an approved plan."""
    doc = frappe.get_doc("PMS Appraisal", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    is_admin = frappe.session.user == "Administrator" or "PMS HR Admin" in frappe.get_roles()

    if doc.employee != user_emp and not is_admin:
        frappe.throw("Only the employee can confirm agreement to their Performance Plan.")

    doc.plan_agreement = "Agreed"
    doc.add_comment("Comment", f"Performance Plan agreement confirmed by Employee ({doc.employee_name or doc.employee}): \"I have discussed and understood the Performance Plan above and agree to the goals on which my performance would be evaluated.\"")
    doc.save(ignore_permissions=True)
    return "Agreement Confirmed"


def compute_target_diff(old_targets, new_targets):
    """
    Compares old_targets from DB with new_targets submitted by Supervisor/Reviewer.
    Returns a list of human-readable differences.
    """
    diffs = []
    old_by_name = {t.get("name"): t for t in old_targets if t.get("name")}
    old_len = len(old_targets)

    for idx, new_t in enumerate(new_targets, 1):
        new_desc = (new_t.get("target_description") or "").strip()
        new_w = flt(new_t.get("weight"), 2)
        target_name = new_t.get("name")

        matched_old = None
        if target_name and target_name in old_by_name:
            matched_old = old_by_name[target_name]
        elif idx <= old_len and not target_name:
            matched_old = old_targets[idx - 1]

        if matched_old:
            old_desc = (matched_old.get("target_description") or "").strip()
            old_w = flt(matched_old.get("weight"), 2)
            old_rev = (matched_old.get("target_reviews") or "").strip()
            new_rev = (new_t.get("target_reviews") or "").strip()
            old_rev_c = (matched_old.get("reviewer_comments") or "").strip()
            new_rev_c = (new_t.get("reviewer_comments") or "").strip()
            row_changes = []
            if old_desc != new_desc:
                row_changes.append(f'Description modified ("{old_desc}" ➔ "{new_desc}")')
            if old_w != new_w:
                row_changes.append(f"Weight changed ({old_w} ➔ {new_w})")
            if old_rev != new_rev:
                row_changes.append(f'Supervisor Comments updated ("{old_rev}" ➔ "{new_rev}")')
            if old_rev_c != new_rev_c:
                row_changes.append(f'Reviewer Comments updated ("{old_rev_c}" ➔ "{new_rev_c}")')
            if row_changes:
                diffs.append(f"Target #{idx} ('{new_desc}'): {', '.join(row_changes)}")
        else:
            diffs.append(f"Added new Target #{idx}: '{new_desc}' (Weight: {new_w})")

    new_names = {t.get("name") for t in new_targets if t.get("name")}
    if len(new_targets) < old_len:
        for old_t in old_targets:
            if old_t.get("name") and old_t.get("name") not in new_names:
                diffs.append(f"Removed Target: '{(old_t.get('target_description') or '').strip()}' (Weight: {flt(old_t.get('weight'), 2)})")

    if not diffs:
        diffs.append("Targets or weightages were adjusted.")

    return diffs


@frappe.whitelist()
def return_plan(docname, remark, targets=None):
    if not remark:
        frappe.throw("Return remark / reason is mandatory.")

    doc = frappe.get_doc("PMS Appraisal", docname)
    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    roles = frappe.get_roles()
    is_sys_mgr = frappe.session.user == "Administrator" or "PMS HR Admin" in roles

    if doc.plan_status == "Pending Supervisor Approval":
        if doc.supervisor_snapshot != user_emp and not is_sys_mgr:
            frappe.throw("Only the assigned Supervisor can return this plan.")
        role_label = "Supervisor"
        new_status = "Returned by Supervisor"
    elif doc.plan_status == "Pending Reviewer Approval":
        if doc.reviewer_snapshot != user_emp and not is_sys_mgr:
            frappe.throw("Only the assigned Reviewer can return this plan.")
        role_label = "Reviewer"
        new_status = "Returned by Reviewer"
    else:
        frappe.throw("Plan is not pending your approval.")

    rejector_name = frappe.db.get_value("Employee", user_emp, "employee_name") if user_emp else frappe.session.user

    parsed_targets = None
    if targets:
        if isinstance(targets, str):
            try:
                parsed_targets = json.loads(targets)
            except Exception:
                parsed_targets = None
        elif isinstance(targets, list):
            parsed_targets = targets

    old_targets = frappe.get_all(
        "PMS Target",
        filters={"parent": docname},
        fields=["name", "target_description", "weight", "target_reviews", "reviewer_comments", "idx"],
        order_by="idx asc"
    )

    has_edits = False
    if parsed_targets is not None:
        db_fmt = [{"desc": (t.get("target_description") or "").strip(), "w": flt(t.get("weight"), 2), "rev": (t.get("target_reviews") or "").strip(), "rev_c": (t.get("reviewer_comments") or "").strip()} for t in old_targets]
        new_fmt = [{"desc": (t.get("target_description") or "").strip(), "w": flt(t.get("weight"), 2), "rev": (t.get("target_reviews") or "").strip(), "rev_c": (t.get("reviewer_comments") or "").strip()} for t in parsed_targets]
        if db_fmt != new_fmt:
            has_edits = True

    if has_edits:
        from gdl_pms.competencies import get_grade_group_weights
        expected_weight = get_grade_group_weights(doc.grade_group)["work"]
        total_w = sum(flt(t.get("weight")) for t in parsed_targets)
        if abs(flt(total_w, 2) - flt(expected_weight, 2)) > 0.01:
            frappe.throw(f"Total target weight must be exactly {expected_weight}. Current sum is {flt(total_w, 2)}.")

        diff_lines = compute_target_diff(old_targets, parsed_targets)
        changes_summary = "\n".join(f"• {d}" for d in diff_lines)

        doc.set("targets", [])
        for t in parsed_targets:
            doc.append("targets", {
                "target_description": t.get("target_description"),
                "weight": flt(t.get("weight")),
                "target_reviews": t.get("target_reviews"),
                "reviewer_comments": t.get("reviewer_comments"),
                "remark": t.get("remark")
            })

        doc.plan_status = new_status
        doc.workflow_state = "Planning Open"
        doc.revised_by_role = role_label
        doc.plan_revision_remark = remark
        doc.plan_revision_changes = changes_summary
        doc.plan_rejection_remark = remark
        doc.plan_agreement = None

        doc.add_comment(
            "Comment",
            f"Performance Plan returned with modifications by {role_label} {rejector_name} ({frappe.session.user}).\n\nRemarks: \"{remark}\"\n\nModifications:\n{changes_summary}"
        )
    else:
        doc.plan_status = new_status
        doc.workflow_state = "Planning Open"
        doc.revised_by_role = role_label
        doc.plan_rejection_remark = remark
        doc.plan_revision_remark = None
        doc.plan_revision_changes = None
        doc.plan_agreement = None

        doc.add_comment(
            "Comment",
            f"Performance Plan returned by {role_label} {rejector_name} ({frappe.session.user}). Return Reason: \"{remark}\""
        )

    doc.save(ignore_permissions=True)

    try:
        from gdl_pms.email_service import notify_plan_returned
        from gdl_pms.notification_service import notify_in_app_plan_returned, _get_employee_user_id
        emp_email = _get_employee_email(doc.employee)
        if emp_email:
            notify_plan_returned(doc, emp_email, remark, returned_by_role=role_label)
        emp_user = _get_employee_user_id(doc.employee)
        if emp_user:
            notify_in_app_plan_returned(doc, emp_user, remark, returned_by_role=role_label)
    except Exception as e:
        frappe.logger().error(f"Failed sending plan return notifications: {str(e)}")

    return "Plan Returned"


@frappe.whitelist()
def reject_plan(docname, remark):
    return return_plan(docname, remark, targets=None)


@frappe.whitelist()
def bulk_approve_plan(docnames):
    if isinstance(docnames, str):
        docnames = json.loads(docnames)

    if not docnames:
        return "No plans selected."

    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    roles = frappe.get_roles()
    is_sys_mgr = frappe.session.user == "Administrator" or "PMS HR Admin" in roles

    approved_count = 0
    errors = []

    for docname in docnames:
        doc_data = frappe.db.get_value(
            "PMS Appraisal",
            docname,
            ["plan_status", "supervisor_snapshot", "reviewer_snapshot", "employee_name"],
            as_dict=True
        )
        if not doc_data:
            continue

        status = doc_data.plan_status
        emp_name = doc_data.employee_name or docname

        if status == "Pending Supervisor Approval":
            if doc_data.supervisor_snapshot != user_emp and not is_sys_mgr:
                errors.append(f"{emp_name} ({docname}): Only the assigned Supervisor can approve.")
                continue
        elif status == "Pending Reviewer Approval":
            if doc_data.reviewer_snapshot != user_emp and not is_sys_mgr:
                errors.append(f"{emp_name} ({docname}): Only the assigned Reviewer can approve.")
                continue
        else:
            errors.append(f"{emp_name} ({docname}): Cannot approve plan in '{status}' status.")
            continue

        try:
            approve_plan(docname)
            approved_count += 1
        except Exception as e:
            errors.append(f"{emp_name} ({docname}): {str(e)}")
            frappe.log_error(f"Failed to bulk approve {docname}: {str(e)}")

    if approved_count > 0:
        frappe.db.commit()

    if errors:
        msg = f"Successfully approved {approved_count} plan(s).<br><br>The following could not be approved:<br>" + "<br>".join(f"• {err}" for err in errors)
        if approved_count == 0:
            frappe.throw(msg, title=_("Bulk Approval Failed"))
        else:
            frappe.msgprint(msg, title=_("Bulk Approval Notice"), indicator="orange")

    return f"Approved {approved_count} plans."


@frappe.whitelist()
def bulk_reject_plan(docnames, remark):
    if isinstance(docnames, str):
        docnames = json.loads(docnames)

    if not docnames:
        return "No plans selected."

    if not remark:
        frappe.throw("Return remark / reason is mandatory.")

    user_emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    roles = frappe.get_roles()
    is_sys_mgr = frappe.session.user == "Administrator" or "PMS HR Admin" in roles

    rejected_count = 0
    errors = []

    for docname in docnames:
        doc_data = frappe.db.get_value(
            "PMS Appraisal",
            docname,
            ["plan_status", "supervisor_snapshot", "reviewer_snapshot", "employee_name"],
            as_dict=True
        )
        if not doc_data:
            continue

        status = doc_data.plan_status
        emp_name = doc_data.employee_name or docname

        if status == "Pending Supervisor Approval":
            if doc_data.supervisor_snapshot != user_emp and not is_sys_mgr:
                errors.append(f"{emp_name} ({docname}): Only the assigned Supervisor can return.")
                continue
        elif status == "Pending Reviewer Approval":
            if doc_data.reviewer_snapshot != user_emp and not is_sys_mgr:
                errors.append(f"{emp_name} ({docname}): Only the assigned Reviewer can return.")
                continue
        else:
            errors.append(f"{emp_name} ({docname}): Cannot return plan in '{status}' status.")
            continue

        try:
            reject_plan(docname, remark)
            rejected_count += 1
        except Exception as e:
            errors.append(f"{emp_name} ({docname}): {str(e)}")
            frappe.log_error(f"Failed to bulk return {docname}: {str(e)}")

    if rejected_count > 0:
        frappe.db.commit()

    if errors:
        msg = f"Successfully returned {rejected_count} plan(s).<br><br>The following could not be returned:<br>" + "<br>".join(f"• {err}" for err in errors)
        if rejected_count == 0:
            frappe.throw(msg, title=_("Bulk Return Failed"))
        else:
            frappe.msgprint(msg, title=_("Bulk Return Notice"), indicator="orange")

    return f"Returned {rejected_count} plans."


@frappe.whitelist()
def bulk_return_plan(docnames, remark):
    return bulk_reject_plan(docnames, remark)


def get_permission_query_conditions(user):
    if not user:
        user = frappe.session.user

    if user == "Administrator" or "PMS HR Admin" in frappe.get_roles(user):
        return ""

    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return "1=2"

    return f"""(`tabPMS Appraisal`.employee = '{employee}' or `tabPMS Appraisal`.supervisor_snapshot = '{employee}' or `tabPMS Appraisal`.reviewer_snapshot = '{employee}' or `tabPMS Appraisal`.supervisor_2_snapshot = '{employee}' or `tabPMS Appraisal`.employee in (select name from `tabEmployee` where supervisor_2 = '{employee}'))"""


def has_permission(doc, ptype="read", user=None):
    if not user:
        user = frappe.session.user

    roles = frappe.get_roles(user)
    if user == "Administrator" or "PMS HR Admin" in roles:
        return True

    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return False

    is_supervisor_2 = (doc.supervisor_2_snapshot == employee or frappe.db.get_value("Employee", doc.employee, "supervisor_2") == employee)
    is_primary_party = (doc.employee == employee or doc.supervisor_snapshot == employee or doc.reviewer_snapshot == employee)

    if ptype == "read":
        if is_primary_party or is_supervisor_2:
            return True
        return False
    else:
        # Non-read permissions (write, delete, create, submit, etc.)
        if is_supervisor_2 and not is_primary_party:
            return False
        if is_primary_party:
            return True
        return False


@frappe.whitelist()
def get_plan_history(docname):
    """
    Returns complete chronological audit history for a PMS Appraisal Performance Plan:
    1. Plan Creation & Initial Draft
    2. Employee Submissions for Approval
    3. Supervisor / Reviewer Re-edits / Analysis returns (Rule 4) with revision remarks
    4. Plan Approvals (Supervisor & Reviewer) with comments
    5. Plan Rejections (Supervisor & Reviewer) with rejection remarks
    6. Amendments (PMS Plan Amendment):
       - Creation / request date & reason
       - Supervisor & Reviewer amendment approval / rejection logs & remarks
       - Date applied to parent plan
    """
    if not docname or not frappe.db.exists("PMS Appraisal", docname):
        return []

    doc = frappe.get_doc("PMS Appraisal", docname)
    history = []

    def get_full_name(user_id):
        if not user_id:
            return ""
        full_name = frappe.db.get_value("User", user_id, "full_name")
        return full_name or user_id

    # 1. Plan Creation Event
    creator_name = get_full_name(doc.owner) or doc.employee_name or doc.employee
    history.append({
        "timestamp": str(doc.creation),
        "formatted_date": frappe.utils.format_datetime(doc.creation, "dd MMM yyyy, hh:mm a"),
        "event_type": "creation",
        "title": "Performance Plan Created",
        "actor_name": creator_name,
        "actor_role": "Employee",
        "badge_text": "Draft Created",
        "badge_color": "gray",
        "comment": "",
        "details": "Performance Plan initialized in Draft status.",
        "icon": "fa-file-text-o"
    })

    # 2. Extract Events from tabComment
    comments = frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "PMS Appraisal",
            "reference_name": docname
        },
        fields=["name", "content", "comment_by", "comment_email", "creation"],
        order_by="creation asc"
    )

    seen_approval_supervisor = False
    seen_approval_reviewer = False
    seen_rejection = False
    seen_re_edit = False

    for c in comments:
        content = (c.content or "").strip()
        if not content:
            continue

        c_time = str(c.creation)
        formatted_c_time = frappe.utils.format_datetime(c.creation, "dd MMM yyyy, hh:mm a")
        author_name = c.comment_by or get_full_name(c.comment_email) or c.comment_email or ""

        # A: Targets/weights modified by Supervisor or Reviewer (Rule 4)
        if "targets/weights were modified by" in content or "Returned to employee" in content or "Plan returned to Employee" in content:
            role = "Supervisor" if "Supervisor" in content else ("Reviewer" if "Reviewer" in content else "Supervisor")
            note = ""
            if '": "' in content:
                parts = content.split('": "', 1)
                note = parts[1].rsplit('"', 1)[0]
            elif 'Reason: "' in content:
                parts = content.split('Reason: "', 1)
                note = parts[1].rsplit('"', 1)[0]
            elif ': "' in content:
                parts = content.split(': "', 1)
                note = parts[1].rsplit('"', 1)[0]

            seen_re_edit = True
            history.append({
                "timestamp": c_time,
                "formatted_date": formatted_c_time,
                "event_type": "re_edit",
                "title": f"Plan Re-edited / Returned by {role}",
                "actor_name": author_name,
                "actor_role": role,
                "badge_text": f"Re-edited by {role}",
                "badge_color": "orange",
                "comment": note,
                "details": content,
                "icon": "fa-pencil-square-o"
            })

        # B: Submissions for Approval
        elif "submitted the plan for approval" in content or "submitted for approval" in content or "re-submitted the plan" in content:
            history.append({
                "timestamp": c_time,
                "formatted_date": formatted_c_time,
                "event_type": "submission",
                "title": "Submitted for Approval",
                "actor_name": author_name or doc.employee_name or doc.employee,
                "actor_role": "Employee",
                "badge_text": "Submitted",
                "badge_color": "blue",
                "comment": "",
                "details": content,
                "icon": "fa-paper-plane-o"
            })

        # C: Approvals
        elif "approved by Supervisor" in content:
            seen_approval_supervisor = True
            comment_text = ""
            if 'Comment: "' in content:
                comment_text = content.split('Comment: "', 1)[1].rsplit('"', 1)[0]
            elif ': "' in content:
                comment_text = content.split(': "', 1)[1].rsplit('"', 1)[0]

            history.append({
                "timestamp": c_time,
                "formatted_date": formatted_c_time,
                "event_type": "supervisor_approval",
                "title": "Plan Approved by Supervisor",
                "actor_name": author_name or doc.supervisor_name or doc.supervisor_snapshot,
                "actor_role": "Supervisor",
                "badge_text": "Supervisor Approved",
                "badge_color": "green",
                "comment": comment_text,
                "details": content,
                "icon": "fa-check-circle-o"
            })

        elif "approved by Reviewer" in content:
            seen_approval_reviewer = True
            comment_text = ""
            if 'Comment: "' in content:
                comment_text = content.split('Comment: "', 1)[1].rsplit('"', 1)[0]
            elif ': "' in content:
                comment_text = content.split(': "', 1)[1].rsplit('"', 1)[0]

            history.append({
                "timestamp": c_time,
                "formatted_date": formatted_c_time,
                "event_type": "reviewer_approval",
                "title": "Plan Approved by Reviewer",
                "actor_name": author_name or doc.reviewer_name or doc.reviewer_snapshot,
                "actor_role": "Reviewer",
                "badge_text": "Reviewer Approved",
                "badge_color": "green",
                "comment": comment_text,
                "details": content,
                "icon": "fa-check-circle"
            })

        # D: Returns / Rejections
        elif "rejected by" in content or "Plan rejected" in content or "returned by" in content or "Plan returned" in content:
            role = "Reviewer" if "Reviewer" in content else "Supervisor"
            seen_rejection = True
            rejection_reason = ""
            if 'Reason: "' in content:
                rejection_reason = content.split('Reason: "', 1)[1].rsplit('"', 1)[0]
            elif 'Remark: "' in content:
                rejection_reason = content.split('Remark: "', 1)[1].rsplit('"', 1)[0]
            elif ': "' in content:
                rejection_reason = content.split(': "', 1)[1].rsplit('"', 1)[0]

            history.append({
                "timestamp": c_time,
                "formatted_date": formatted_c_time,
                "event_type": "rejection",
                "title": f"Plan Returned by {role}",
                "actor_name": author_name,
                "actor_role": role,
                "badge_text": f"Returned by {role}",
                "badge_color": "orange",
                "comment": rejection_reason or content,
                "details": content,
                "icon": "fa-undo"
            })

        # E: Amendment applied comment
        elif "Plan Amendment #" in content:
            history.append({
                "timestamp": c_time,
                "formatted_date": formatted_c_time,
                "event_type": "amendment_applied",
                "title": "Plan Amendment Applied",
                "actor_name": author_name or "System",
                "actor_role": "System",
                "badge_text": "Amendment Applied",
                "badge_color": "teal",
                "comment": "",
                "details": content,
                "icon": "fa-refresh"
            })

    # 3. Amendments from tabPMS Plan Amendment & Child Logs
    amendments = frappe.get_all(
        "PMS Plan Amendment",
        filters={"performance_plan": docname},
        fields=["name", "amendment_number", "revision_date", "reason", "status", "supervisor_remark", "reviewer_remark", "creation", "owner"],
        order_by="amendment_number asc"
    )

    for amd in amendments:
        logs = frappe.get_all(
            "PMS Amendment Log",
            filters={"parent": amd.name},
            fields=["name", "action", "user", "role", "timestamp", "status", "remark"],
            order_by="timestamp asc"
        )

        if logs:
            for l in logs:
                l_time = str(l.timestamp or amd.creation)
                formatted_l_time = frappe.utils.format_datetime(l.timestamp or amd.creation, "dd MMM yyyy, hh:mm a")
                u_name = get_full_name(l.user) or l.user or ""
                act = l.action or ""
                b_color = "purple"
                b_text = f"Amendment #{amd.amendment_number}"
                icon = "fa-pencil"

                if "Approved" in act:
                    b_color = "green"
                    b_text = f"Amendment #{amd.amendment_number} Approved"
                    icon = "fa-check"
                elif "Rejected" in act or "Returned" in act:
                    b_color = "orange"
                    b_text = f"Amendment #{amd.amendment_number} Returned"
                    icon = "fa-undo"
                elif "Submitted" in act:
                    b_color = "purple"
                    b_text = f"Amendment #{amd.amendment_number} Requested"
                    icon = "fa-file-text"

                history.append({
                    "timestamp": l_time,
                    "formatted_date": formatted_l_time,
                    "event_type": "amendment_log",
                    "title": f"Plan Amendment #{amd.amendment_number} ({amd.name}): {act}",
                    "actor_name": u_name,
                    "actor_role": l.role or "Employee",
                    "badge_text": b_text,
                    "badge_color": b_color,
                    "comment": l.remark or "",
                    "details": f"Reason: {amd.reason}" if amd.reason else "",
                    "link": f"/app/pms-plan-amendment/{amd.name}",
                    "icon": icon
                })
        else:
            # Fallback if no child logs
            amd_time = str(amd.creation)
            formatted_amd_time = frappe.utils.format_datetime(amd.creation, "dd MMM yyyy, hh:mm a")
            creator = get_full_name(amd.owner) or amd.owner
            history.append({
                "timestamp": amd_time,
                "formatted_date": formatted_amd_time,
                "event_type": "amendment",
                "title": f"Plan Amendment #{amd.amendment_number} ({amd.name})",
                "actor_name": creator,
                "actor_role": "Employee",
                "badge_text": f"Amendment: {amd.status}",
                "badge_color": "green" if amd.status == "Approved" else ("red" if amd.status == "Rejected" else "purple"),
                "comment": amd.reason or "",
                "details": f"Supervisor Remark: {amd.supervisor_remark or 'None'} | Reviewer Remark: {amd.reviewer_remark or 'None'}",
                "link": f"/app/pms-plan-amendment/{amd.name}",
                "icon": "fa-file-text-o"
            })

    # 4. State Fallbacks for Older Records
    if doc.plan_status in ["Approved", "Monitoring", "Appraisal Open", "Appraisal Completed"]:
        if not seen_approval_supervisor:
            history.append({
                "timestamp": str(doc.modified or doc.creation),
                "formatted_date": frappe.utils.format_datetime(doc.modified or doc.creation, "dd MMM yyyy, hh:mm a"),
                "event_type": "supervisor_approval",
                "title": "Plan Approved by Supervisor",
                "actor_name": doc.supervisor_name or doc.supervisor_snapshot or "Supervisor",
                "actor_role": "Supervisor",
                "badge_text": "Supervisor Approved",
                "badge_color": "green",
                "comment": "",
                "details": "Performance Plan approved by Supervisor.",
                "icon": "fa-check-circle-o"
            })
        if doc.reviewer_snapshot and not seen_approval_reviewer:
            history.append({
                "timestamp": str(doc.modified or doc.creation),
                "formatted_date": frappe.utils.format_datetime(doc.modified or doc.creation, "dd MMM yyyy, hh:mm a"),
                "event_type": "reviewer_approval",
                "title": "Plan Approved by Reviewer",
                "actor_name": doc.reviewer_name or doc.reviewer_snapshot or "Reviewer",
                "actor_role": "Reviewer",
                "badge_text": "Reviewer Approved",
                "badge_color": "green",
                "comment": "",
                "details": "Performance Plan approved by Reviewer. Plan Activated.",
                "icon": "fa-check-circle"
            })

    if doc.plan_status in ["Rejected", "Returned", "Returned by Supervisor", "Returned by Reviewer"] and not seen_rejection:
        ret_title = doc.plan_status if doc.plan_status in ["Returned by Supervisor", "Returned by Reviewer"] else "Plan Returned"
        ret_badge = doc.plan_status if doc.plan_status in ["Returned by Supervisor", "Returned by Reviewer"] else "Plan Returned"
        ret_color = "red" if "Reviewer" in doc.plan_status else "orange"
        ret_role = "Reviewer" if "Reviewer" in doc.plan_status else ("Supervisor" if "Supervisor" in doc.plan_status else "Supervisor/Reviewer")
        history.append({
            "timestamp": str(doc.modified or doc.creation),
            "formatted_date": frappe.utils.format_datetime(doc.modified or doc.creation, "dd MMM yyyy, hh:mm a"),
            "event_type": "rejection",
            "title": ret_title,
            "actor_name": doc.supervisor_name or doc.reviewer_name or "Approver",
            "actor_role": ret_role,
            "badge_text": ret_badge,
            "badge_color": ret_color,
            "comment": doc.plan_rejection_remark or doc.plan_revision_remark or "Return remark not recorded",
            "details": doc.plan_rejection_remark or doc.plan_revision_remark or "",
            "icon": "fa-undo"
        })

    if doc.plan_status == "Draft" and doc.plan_revision_remark and not seen_re_edit:
        re_edit_details = doc.plan_revision_changes if getattr(doc, "plan_revision_changes", None) else "Targets/weights adjusted and returned to Employee for analysis."
        history.append({
            "timestamp": str(doc.modified or doc.creation),
            "formatted_date": frappe.utils.format_datetime(doc.modified or doc.creation, "dd MMM yyyy, hh:mm a"),
            "event_type": "re_edit",
            "title": f"Plan Re-edited / Returned by {doc.revised_by_role or 'Supervisor'}",
            "actor_name": doc.supervisor_name or doc.reviewer_name or (doc.revised_by_role or "Supervisor"),
            "actor_role": doc.revised_by_role or "Supervisor",
            "badge_text": f"Re-edited by {doc.revised_by_role or 'Supervisor'}",
            "badge_color": "orange",
            "comment": doc.plan_revision_remark,
            "details": re_edit_details,
            "icon": "fa-pencil-square-o"
        })

    # 5. Sort chronologically (oldest to newest)
    history.sort(key=lambda x: str(x.get("timestamp") or ""))
    return history


@frappe.whitelist()
def get_user_performance_context():
    """
    Returns performance context for current user:
    - employee_id & employee_name
    - can_see_team: whether user is supervisor/reviewer or has team members
    - is_supervisor, is_reviewer, is_admin
    - pending_plan_count: count of team plans pending this user's approval
    - pending_appraisal_count: count of team appraisals pending this user's evaluation/review
    """
    user = frappe.session.user
    roles = frappe.get_roles(user)

    emp = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        ["name", "employee_name"],
        as_dict=True
    )
    emp_id = emp.name if emp else None
    emp_name = emp.employee_name if emp else None

    is_supervisor = "PMS Supervisor" in roles
    is_supervisor_2 = "PMS Supervisor 2" in roles
    is_reviewer = "PMS Reviewer" in roles
    is_admin = user == "Administrator" or "PMS HR Admin" in roles

    has_subordinates = False
    if emp_id:
        has_subordinates = frappe.db.sql("""
            select count(*) from `tabEmployee`
            where status = 'Active' and (reports_to = %(emp)s or reviewer = %(emp)s or supervisor_2 = %(emp)s)
        """, {"emp": emp_id})[0][0] > 0

    can_see_team = has_subordinates or is_supervisor or is_supervisor_2 or is_reviewer or is_admin

    pending_plan_count = 0
    pending_appraisal_count = 0
    pending_amendment_count = 0

    if can_see_team:
        if emp_id:
            plan_conditions = []
            if is_supervisor or is_admin:
                plan_conditions.append("(supervisor_snapshot = %(emp)s and plan_status = 'Pending Supervisor Approval')")
            if is_reviewer or is_admin:
                plan_conditions.append("(reviewer_snapshot = %(emp)s and plan_status = 'Pending Reviewer Approval')")
            if is_supervisor_2 or is_admin:
                plan_conditions.append("((supervisor_2_snapshot = %(emp)s or employee in (select name from `tabEmployee` where supervisor_2 = %(emp)s)) and plan_status in ('Pending Supervisor Approval', 'Pending Reviewer Approval'))")

            if plan_conditions:
                cond_str = " or ".join(plan_conditions)
                pending_plan_count = frappe.db.sql(f"""
                    select count(*) from `tabPMS Appraisal`
                    where employee != %(emp)s and ({cond_str})
                """, {"emp": emp_id})[0][0]
        elif is_admin:
            pending_plan_count = frappe.db.sql("""
                select count(*) from `tabPMS Appraisal`
                where plan_status in ('Pending Supervisor Approval', 'Pending Reviewer Approval')
            """)[0][0]

        if emp_id:
            appr_conditions = []
            if is_supervisor or is_admin:
                appr_conditions.append("(supervisor_snapshot = %(emp)s and appraisal_status in ('Pending Supervisor Evaluation', 'Pending Supervisor Review'))")
            if is_reviewer or is_admin:
                appr_conditions.append("(reviewer_snapshot = %(emp)s and appraisal_status in ('Pending Reviewer Review', 'Pending Reviewer Evaluation'))")
            if is_supervisor_2 or is_admin:
                appr_conditions.append("((supervisor_2_snapshot = %(emp)s or employee in (select name from `tabEmployee` where supervisor_2 = %(emp)s)) and appraisal_status in ('Pending Supervisor Evaluation', 'Pending Supervisor Review', 'Pending Reviewer Review', 'Pending Reviewer Evaluation'))")

            if appr_conditions:
                cond_str = " or ".join(appr_conditions)
                pending_appraisal_count = frappe.db.sql(f"""
                    select count(*) from `tabPMS Appraisal`
                    where employee != %(emp)s and ({cond_str})
                """, {"emp": emp_id})[0][0]
        elif is_admin:
            pending_appraisal_count = frappe.db.sql("""
                select count(*) from `tabPMS Appraisal`
                where appraisal_status in ('Pending Supervisor Evaluation', 'Pending Supervisor Review', 'Pending Reviewer Review', 'Pending Reviewer Evaluation')
            """)[0][0]

        if emp_id:
            amend_conditions = []
            if is_supervisor or is_admin:
                amend_conditions.append("(supervisor_snapshot = %(emp)s and status = 'Pending Supervisor Approval')")
            if is_reviewer or is_admin:
                amend_conditions.append("(reviewer_snapshot = %(emp)s and status = 'Pending Reviewer Approval')")
            if is_supervisor_2 or is_admin:
                amend_conditions.append("((supervisor_2_snapshot = %(emp)s or employee in (select name from `tabEmployee` where supervisor_2 = %(emp)s)) and status in ('Pending Supervisor Approval', 'Pending Reviewer Approval'))")

            if amend_conditions:
                cond_str = " or ".join(amend_conditions)
                pending_amendment_count = frappe.db.sql(f"""
                    select count(*) from `tabPMS Plan Amendment`
                    where employee != %(emp)s and ({cond_str})
                """, {"emp": emp_id})[0][0]
        elif is_admin:
            pending_amendment_count = frappe.db.sql("""
                select count(*) from `tabPMS Plan Amendment`
                where status in ('Pending Supervisor Approval', 'Pending Reviewer Approval')
            """)[0][0]

    return {
        "employee_id": emp_id,
        "employee_name": emp_name,
        "can_see_team": can_see_team,
        "is_supervisor": is_supervisor,
        "is_supervisor_2": is_supervisor_2,
        "is_reviewer": is_reviewer,
        "is_admin": is_admin,
        "pending_plan_count": pending_plan_count,
        "pending_appraisal_count": pending_appraisal_count,
        "pending_amendment_count": pending_amendment_count
    }
