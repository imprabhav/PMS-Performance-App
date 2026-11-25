import frappe
from frappe.utils import flt

GRADE_WEIGHTS = {
    "PS_CS": {"work": 60, "competency": 40},
    "OS_ESP": {"work": 50, "competency": 50},
}

RATING_BANDS = [
    (95, 100, "Outstanding"),
    (85, 94.99, "Commendable"),
    (80, 84.99, "Good"),
    (65, 79.99, "Satisfactory"),
    (0, 64.99, "Unacceptable"),
]

def get_band(total):
    total = flt(total, 2)
    if total >= 95:
        return "Outstanding"
    if total >= 85:
        return "Commendable"
    if total >= 80:
        return "Good"
    if total >= 65:
        return "Satisfactory"
    return "Unacceptable"

def compute_final_score(appraisal):
    """
    Computes provisional or final score based on stage:
    - If in Reviewer phase or Disputed, uses reviewer scores (falling back to supervisor scores).
    - Otherwise (Supervisor evaluation), uses supervisor scores.
    """
    is_reviewer_phase = (
        appraisal.appraisal_status in [
            "Reviewer Resolved - Pending Employee Decision",
            "Appraisal Accepted",
            "Finalized & Locked",
            "Under PERC Review"
        ]
        or getattr(appraisal, "dispute_flag", 0) == 1
    )

    work_score = 0.0
    for t in appraisal.targets:
        if is_reviewer_phase and (t.reviewer_score is not None and flt(t.reviewer_score) > 0):
            work_score += flt(t.reviewer_score)
        else:
            work_score += flt(t.supervisor_score or 0)
            
    comp_score = 0.0
    for c in appraisal.competencies:
        if is_reviewer_phase and (c.reviewer_rating is not None and flt(c.reviewer_rating) > 0):
            comp_score += flt(c.reviewer_rating)
        else:
            comp_score += flt(c.supervisor_rating or 0)
            
    total = flt(work_score + comp_score, 2)
    appraisal.total_targets_score = flt(work_score, 2)
    appraisal.total_competency_score = flt(comp_score, 2)
    appraisal.total_score = total
    appraisal.rating_band = get_band(total)
    
    if total < 70:
        trigger_pip(appraisal.employee)
        
    return total

def trigger_pip(employee):
    frappe.logger().info(f"PIP triggered for employee {employee}")

def apply_perc_override(appraisal_name, final_score):
    """Called from PERC Case when a case is Resolved: overrides score and permanently locks the appraisal."""
    doc = frappe.get_doc("PMS Appraisal", appraisal_name)
    doc.total_score = flt(final_score, 2)
    doc.rating_band = get_band(doc.total_score)
    doc.locked = 1
    doc.workflow_state = "Appraisal Completed"
    doc.appraisal_status = "Finalized & Locked"
    doc.add_comment(
        "Comment",
        f"PERC Committee determined final score: {doc.total_score} ({doc.rating_band}). Appraisal finalized and locked."
    )
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    # Auto-sync final rating to Employee Master
    try:
        from gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal import (
            sync_appraisal_to_employee_master,
            _get_employee_email,
        )
        sync_appraisal_to_employee_master(doc)
        emp_email = _get_employee_email(doc.employee)
        if emp_email:
            from gdl_pms.email_service import notify_appraisal_locked
            notify_appraisal_locked(doc, emp_email, doc.total_score)
    except Exception as e:
        frappe.logger().error(f"PERC override post-lock email/sync error for {doc.name}: {str(e)}")

    try:
        from gdl_pms.notification_service import notify_in_app_appraisal_locked, _get_employee_user_id
        emp_user = _get_employee_user_id(doc.employee)
        if emp_user:
            notify_in_app_appraisal_locked(doc, emp_user, doc.total_score)
    except Exception as e:
        frappe.logger().error(f"PERC override in-app notification error for {doc.name}: {str(e)}")
