"""
GDL Performance Management System - Central In-App Notification Service
================================================================================
Manages Frappe native in-app notifications (Notification Log with Bell Icon badge)
for PMS Appraisal Cycles, Performance Plans, and Appraisal workflow milestones.
"""

import frappe
from frappe import _


def _get_employee_user_id(emp_id):
	"""
	Helper to resolve an active Frappe User ID for a given Employee ID.
	"""
	if not emp_id:
		return None

	user_id = frappe.db.get_value("Employee", emp_id, "user_id")
	if not user_id:
		user_id = frappe.db.get_value("Employee", emp_id, "company_email")

	if user_id and frappe.db.exists("User", {"name": user_id, "enabled": 1}):
		return user_id

	return None


def send_in_app_notification(
	for_user,
	title,
	description,
	document_type=None,
	document_name=None,
	subject=None,
	dedupe=True,
	from_user=None
):
	"""
	Creates a Frappe native Notification Log for the given user.
	Triggers real-time notification badge on user's desk bell icon.
	"""
	if not for_user or not frappe.db.exists("User", {"name": for_user, "enabled": 1}):
		return None

	# If deduplication requested, prevent creating identical notification
	if dedupe:
		filters = {
			"for_user": for_user,
			"title": title
		}
		if document_type:
			filters["document_type"] = document_type
		if document_name:
			filters["document_name"] = document_name

		if frappe.db.exists("Notification Log", filters):
			return None

	sender = from_user or (frappe.session.user if getattr(frappe, "session", None) and frappe.session.user else "Administrator")

	try:
		notif = frappe.new_doc("Notification Log")
		notif.type = "Alert"
		notif.document_type = document_type
		notif.document_name = document_name
		notif.subject = subject or title
		notif.title = title
		notif.description = description
		notif.email_content = description
		notif.for_user = for_user
		notif.from_user = sender
		notif.read = 0
		notif.insert(ignore_permissions=True)
		return notif
	except Exception as e:
		frappe.logger("gdl_pms_notifications").error(f"Failed to create Notification Log for {for_user}: {str(e)}")
		return None


# ==============================================================================
# APPRAISAL CYCLE NOTIFICATIONS
# ==============================================================================

def notify_cycle_employees_to_plan(cycle_doc, force=False):
	"""
	Notifies all applicable employees in an appraisal cycle to create their Performance Plan.
	Called when HR Admin creates or saves an appraisal cycle.
	"""
	if isinstance(cycle_doc, str):
		cycle_doc = frappe.get_doc("PMS Appraisal Cycle", cycle_doc)

	if not cycle_doc:
		return 0

	# Don't notify on closed cycles
	if cycle_doc.status == "Closed":
		return 0

	cycle_title = cycle_doc.cycle_name or cycle_doc.name
	title = f"Create Performance Plan: {cycle_title}"
	subject = f"Action Required: Create Performance Plan for Cycle {cycle_title}"
	description = f"Appraisal cycle '{cycle_title}' has been initiated. Please create and submit your Performance Plan."

	notified_count = 0
	employees = getattr(cycle_doc, "applicable_employees", []) or []

	for row in employees:
		emp_id = getattr(row, "employee", None) or (row.get("employee") if isinstance(row, dict) else None)
		if not emp_id:
			continue

		# If already created an appraisal for this cycle and not forced, skip
		app_status = getattr(row, "appraisal_status", None) or (row.get("appraisal_status") if isinstance(row, dict) else None)
		if not force and app_status and app_status not in ["Not Created", "Draft"]:
			continue

		user_id = _get_employee_user_id(emp_id)
		if not user_id:
			continue

		notif = send_in_app_notification(
			for_user=user_id,
			title=title,
			description=description,
			document_type="PMS Appraisal Cycle",
			document_name=cycle_doc.name,
			subject=subject,
			dedupe=not force
		)
		if notif:
			notified_count += 1

	return notified_count


def notify_cycle_employees_appraisal_open(cycle_doc, activated_plan_names):
	"""
	Notifies employees and supervisors when the Appraisal Phase (Self-Rating) is activated for a cycle.
	"""
	if isinstance(cycle_doc, str):
		cycle_doc = frappe.get_doc("PMS Appraisal Cycle", cycle_doc)

	if not cycle_doc or not activated_plan_names:
		return 0

	cycle_title = cycle_doc.cycle_name or cycle_doc.name
	emp_title = f"Appraisal Phase Active: {cycle_title}"
	emp_subject = f"Action Required: Submit Self-Assessment for {cycle_title}"
	emp_desc = f"Appraisal evaluation phase for '{cycle_title}' is now open. Please complete and submit your self-assessment."

	notified_count = 0
	plans = frappe.get_all(
		"PMS Appraisal",
		filters={"name": ["in", list(activated_plan_names)]},
		fields=["name", "employee", "employee_name", "supervisor_snapshot"]
	)

	for p in plans:
		emp_user = _get_employee_user_id(p.employee)
		if emp_user:
			send_in_app_notification(
				for_user=emp_user,
				title=emp_title,
				description=emp_desc,
				document_type="PMS Appraisal",
				document_name=p.name,
				subject=emp_subject,
				dedupe=True
			)
			notified_count += 1

		if p.supervisor_snapshot:
			sup_user = _get_employee_user_id(p.supervisor_snapshot)
			if sup_user:
				send_in_app_notification(
					for_user=sup_user,
					title=f"Appraisal Open: {p.employee_name}",
					description=f"Appraisal phase has opened for {p.employee_name}. Self-assessment is in progress.",
					document_type="PMS Appraisal",
					document_name=p.name,
					subject=f"Appraisal Evaluation Open for {p.employee_name}",
					dedupe=True
				)

	return notified_count


# ==============================================================================
# PMS APPRAISAL WORKFLOW NOTIFICATIONS
# ==============================================================================

def notify_in_app_plan_submitted(appraisal_doc, supervisor_user):
	"""Employee submits targets -> notify supervisor"""
	emp_name = appraisal_doc.get("employee_name") or appraisal_doc.get("employee")
	title = f"Plan Review Required: {emp_name}"
	subject = f"Action Required: Performance Plan Submitted by {emp_name}"
	description = f"{emp_name} has submitted their Performance Plan ({appraisal_doc.name}) for your review and approval."
	return send_in_app_notification(
		for_user=supervisor_user,
		title=title,
		description=description,
		document_type="PMS Appraisal",
		document_name=appraisal_doc.name,
		subject=subject,
		dedupe=False
	)


def notify_in_app_plan_forwarded_reviewer(appraisal_doc, reviewer_user):
	"""Supervisor approves plan -> forwarded to reviewer"""
	emp_name = appraisal_doc.get("employee_name") or appraisal_doc.get("employee")
	title = f"Plan Review Required (2nd Level): {emp_name}"
	subject = f"Action Required: Performance Plan Forwarded ({emp_name})"
	description = f"Performance Plan for {emp_name} ({appraisal_doc.name}) was approved by supervisor and forwarded for your reviewer approval."
	return send_in_app_notification(
		for_user=reviewer_user,
		title=title,
		description=description,
		document_type="PMS Appraisal",
		document_name=appraisal_doc.name,
		subject=subject,
		dedupe=False
	)


def notify_in_app_plan_approved(appraisal_doc, employee_user):
	"""Plan approved -> notify employee"""
	title = f"Performance Plan Approved ({appraisal_doc.name})"
	subject = f"Approved: Performance Plan ({appraisal_doc.name})"
	description = f"Your Performance Plan for cycle '{appraisal_doc.cycle_name or appraisal_doc.cycle}' has been approved and is now active in Monitoring phase."
	return send_in_app_notification(
		for_user=employee_user,
		title=title,
		description=description,
		document_type="PMS Appraisal",
		document_name=appraisal_doc.name,
		subject=subject,
		dedupe=False
	)


def notify_in_app_plan_returned(appraisal_doc, employee_user, remark, returned_by_role="Supervisor"):
	"""Plan returned -> notify employee"""
	title = f"Performance Plan Returned by {returned_by_role}"
	subject = f"Revision Required: Performance Plan ({appraisal_doc.name})"
	desc_remark = f" Reason: '{remark}'" if remark else ""
	description = f"Your Performance Plan has been returned by your {returned_by_role} for revision.{desc_remark} Please update and re-submit."
	return send_in_app_notification(
		for_user=employee_user,
		title=title,
		description=description,
		document_type="PMS Appraisal",
		document_name=appraisal_doc.name,
		subject=subject,
		dedupe=False
	)


def notify_in_app_self_assessment_submitted(appraisal_doc, supervisor_user):
	"""Employee submits self-assessment -> notify supervisor"""
	emp_name = appraisal_doc.get("employee_name") or appraisal_doc.get("employee")
	title = f"Self-Assessment Completed: {emp_name}"
	subject = f"Action Required: Self-Assessment Submitted by {emp_name}"
	description = f"{emp_name} has submitted their Self-Assessment for appraisal {appraisal_doc.name}. Your supervisor evaluation scoring is now required."
	return send_in_app_notification(
		for_user=supervisor_user,
		title=title,
		description=description,
		document_type="PMS Appraisal",
		document_name=appraisal_doc.name,
		subject=subject,
		dedupe=False
	)


def notify_in_app_supervisor_scores_submitted(appraisal_doc, employee_user):
	"""Supervisor submits evaluation -> notify employee"""
	title = f"Appraisal Evaluation Scores Ready ({appraisal_doc.name})"
	subject = f"Review Ready: Supervisor Evaluation Completed ({appraisal_doc.name})"
	description = "Your supervisor has submitted evaluation scores for your appraisal. Please log in to review and accept or dispute."
	return send_in_app_notification(
		for_user=employee_user,
		title=title,
		description=description,
		document_type="PMS Appraisal",
		document_name=appraisal_doc.name,
		subject=subject,
		dedupe=False
	)


def notify_in_app_dispute_raised(appraisal_doc, reviewer_user, reason):
	"""Employee disputes score -> notify reviewer"""
	emp_name = appraisal_doc.get("employee_name") or appraisal_doc.get("employee")
	title = f"Appraisal Dispute Raised: {emp_name}"
	subject = f"Dispute Alert: Appraisal Score Disputed by {emp_name}"
	desc_reason = f" Reason: '{reason}'" if reason else ""
	description = f"{emp_name} has raised a dispute regarding their supervisor's appraisal scoring.{desc_reason} Your intervention as Reviewer is required."
	return send_in_app_notification(
		for_user=reviewer_user,
		title=title,
		description=description,
		document_type="PMS Appraisal",
		document_name=appraisal_doc.name,
		subject=subject,
		dedupe=False
	)


def notify_in_app_appraisal_locked(appraisal_doc, employee_user, final_score):
	"""Appraisal locked -> notify employee"""
	score_str = f"{final_score:.2f}" if (final_score is not None and isinstance(final_score, (int, float))) else str(final_score or "")
	title = f"Appraisal Finalized & Locked ({appraisal_doc.name})"
	subject = f"Completed: Appraisal Finalized ({appraisal_doc.name})"
	description = f"Your performance appraisal ({appraisal_doc.name}) has been officially finalized, verified, and locked. Final Score: {score_str}."
	return send_in_app_notification(
		for_user=employee_user,
		title=title,
		description=description,
		document_type="PMS Appraisal",
		document_name=appraisal_doc.name,
		subject=subject,
		dedupe=False
	)


def get_hr_users():
	"""Helper to get all active HR Admin and HR Manager users."""
	users = frappe.get_all(
		"Has Role",
		filters={"role": ["in", ["HR Admin", "HR Manager"]], "parenttype": "User"},
		pluck="parent"
	)
	active_users = []
	for u in set(users):
		if frappe.db.get_value("User", u, "enabled"):
			active_users.append(u)
	if not active_users and frappe.db.exists("User", "hr.admin@gdl.bt"):
		active_users.append("hr.admin@gdl.bt")
	return active_users


def notify_in_app_plan_disagreed_hr(appraisal_doc):
	"""Employee submits plan with goal disagreement -> notify HR Admin / HR Manager to involve support"""
	emp_name = appraisal_doc.get("employee_name") or appraisal_doc.get("employee")
	emp_id = appraisal_doc.get("employee")
	title = f"Plan Disagreement Alert: {emp_name}"
	subject = f"Action Required: Performance Plan Disagreement by {emp_name} ({emp_id})"
	description = f"{emp_name} ({emp_id}) has submitted their Performance Plan ({appraisal_doc.name}) indicating disagreement with the proposed goals. HR support is requested to assist in finalizing the performance plan with the Reviewer and Supervisor."
	notified = 0
	for hr_user in get_hr_users():
		send_in_app_notification(
			for_user=hr_user,
			title=title,
			description=description,
			document_type="PMS Appraisal",
			document_name=appraisal_doc.name,
			subject=subject,
			dedupe=False
		)
		notified += 1
	return notified


def notify_in_app_plan_approved_pending_agreement(appraisal_doc, employee_user):
	"""Reviewer approved plan but agreement declaration is pending -> notify employee with link"""
	rev_name = appraisal_doc.get("reviewer_name") or appraisal_doc.get("reviewer_snapshot") or "Reviewer"
	title = f"Action Required: Confirm Plan Agreement ({appraisal_doc.name})"
	subject = f"Action Required: Confirm Agreement for Approved Performance Plan ({appraisal_doc.name})"
	description = f"Your Performance Plan ({appraisal_doc.name}) has been approved by Reviewer {rev_name}. Please review the finalized goals and click here to tick the agreement declaration: 'I have discussed and understood the Performance Plan above and agree to the goals on which my performance would be evaluated.'"
	return send_in_app_notification(
		for_user=employee_user,
		title=title,
		description=description,
		document_type="PMS Appraisal",
		document_name=appraisal_doc.name,
		subject=subject,
		dedupe=False
	)

