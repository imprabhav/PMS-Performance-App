# Copyright (c) 2026, GDL and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class PMSAppraisalCycle(Document):
	def onload(self):
		user = frappe.session.user
		if user != "Administrator":
			roles = frappe.get_roles(user)
			if "PMS HR Admin" not in roles:
				self.set("applicable_employees", [])
				return

		if not self.applicable_employees:
			self.populate_applicable_employees()

	def validate(self):
		if not self.status:
			self.status = "Draft"

		if not self.cycle_type:
			self.cycle_type = "Annual"

		if not self.grade_group:
			self.grade_group = "All"

		if not self.applicable_employees:
			self.populate_applicable_employees()

		if self.cycle_type == "Probation":
			if self.applicable_employees:
				# Validate that all employees in probation cycle have the same Date of Joining
				jds = {str(emp.date_of_joining) for emp in self.applicable_employees if emp.date_of_joining}
				if len(jds) > 1:
					frappe.throw(_("All employees in a Probation Cycle must have the exact same Date of Joining. Found multiple joining dates in applicable employees: {0}. Please filter by Start Date or select employees with matching joining date.").format(", ".join(sorted(jds))))
				elif len(jds) == 1:
					common_jd = list(jds)[0]
					if self.start_date and str(self.start_date) != common_jd:
						frappe.throw(_("Cycle Start Date ({0}) does not match the employees' Date of Joining ({1}). For a Probation Cycle, Start Date must match the Joining Date.").format(self.start_date, common_jd))
					if not self.start_date:
						self.start_date = common_jd

			if self.start_date:
				if not self.calendar_year:
					self.calendar_year = str(frappe.utils.getdate(self.start_date).year)
				if not self.end_date:
					self.end_date = frappe.utils.add_days(frappe.utils.add_months(self.start_date, 3), -1)
		else:
			if not self.calendar_year and self.start_date:
				self.calendar_year = str(frappe.utils.getdate(self.start_date).year)
			elif not self.calendar_year:
				self.calendar_year = str(frappe.utils.nowdate().split("-")[0])

			if self.calendar_year:
				if not self.start_date:
					self.start_date = f"{self.calendar_year}-01-01"
				self.end_date = f"{self.calendar_year}-12-31"

		if self.start_date and self.end_date:
			if frappe.utils.getdate(self.start_date) > frappe.utils.getdate(self.end_date):
				frappe.throw(_("Start Date cannot be after End Date."))

		# Performance Plan deadline validations
		if self.employee_submission_deadline and self.supervisor_approval_deadline:
			if frappe.utils.getdate(self.employee_submission_deadline) > frappe.utils.getdate(self.supervisor_approval_deadline):
				frappe.throw(_("Employee End Date for Submission ({0}) cannot be after Supervisor End Date for Approval ({1})").format(
					self.employee_submission_deadline, self.supervisor_approval_deadline
				))

		if self.supervisor_approval_deadline and self.reviewer_approval_deadline:
			if frappe.utils.getdate(self.supervisor_approval_deadline) > frappe.utils.getdate(self.reviewer_approval_deadline):
				frappe.throw(_("Supervisor End Date for Approval ({0}) cannot be after Reviewer End Date for Approval for Performance Plan ({1})").format(
					self.supervisor_approval_deadline, self.reviewer_approval_deadline
				))

		if self.start_date and self.employee_submission_deadline:
			if frappe.utils.getdate(self.start_date) > frappe.utils.getdate(self.employee_submission_deadline):
				frappe.throw(_("Employee End Date for Submission ({0}) cannot be before Cycle Start Date ({1})").format(
					self.employee_submission_deadline, self.start_date
				))

		if self.reviewer_approval_deadline and self.end_date:
			if frappe.utils.getdate(self.reviewer_approval_deadline) > frappe.utils.getdate(self.end_date):
				frappe.throw(_("Reviewer End Date for Approval for Performance Plan ({0}) cannot be after Cycle End Date ({1})").format(
					self.reviewer_approval_deadline, self.end_date
				))

		# Appraisal scoring deadline validations
		if self.self_scoring_start_date and self.self_scoring_end_date:
			if frappe.utils.getdate(self.self_scoring_start_date) > frappe.utils.getdate(self.self_scoring_end_date):
				frappe.throw(_("Self-Scoring Start Date ({0}) cannot be after Employee End Date for Self-Scoring ({1})").format(
					self.self_scoring_start_date, self.self_scoring_end_date
				))

		if self.self_scoring_end_date and self.supervisor_appraisal_end_date:
			if frappe.utils.getdate(self.self_scoring_end_date) > frappe.utils.getdate(self.supervisor_appraisal_end_date):
				frappe.throw(_("Employee End Date for Self-Scoring ({0}) cannot be after Supervisor End Date for Appraisal Review ({1})").format(
					self.self_scoring_end_date, self.supervisor_appraisal_end_date
				))

		if self.supervisor_appraisal_end_date and self.reviewer_appraisal_end_date:
			if frappe.utils.getdate(self.supervisor_appraisal_end_date) > frappe.utils.getdate(self.reviewer_appraisal_end_date):
				frappe.throw(_("Supervisor End Date for Appraisal Review ({0}) cannot be after Reviewer End Date for Appraisal Review ({1})").format(
					self.supervisor_appraisal_end_date, self.reviewer_appraisal_end_date
				))

		if self.start_date and self.self_scoring_start_date:
			if frappe.utils.getdate(self.start_date) > frappe.utils.getdate(self.self_scoring_start_date):
				frappe.throw(_("Self-Scoring Start Date ({0}) cannot be before Cycle Start Date ({1})").format(
					self.self_scoring_start_date, self.start_date
				))

		if self.reviewer_appraisal_end_date and self.end_date:
			if frappe.utils.getdate(self.reviewer_appraisal_end_date) > frappe.utils.getdate(self.end_date):
				frappe.throw(_("Reviewer End Date for Appraisal Review ({0}) cannot be after Cycle End Date ({1})").format(
					self.reviewer_appraisal_end_date, self.end_date
				))

		# Auto-populate applicable employees on save if empty, new, requested, or if cycle_type/grade_group changed
		should_repopulate = (
			not self.applicable_employees
			or getattr(self.flags, "sync_employees", False)
			or self.is_new()
			or self.has_value_changed("cycle_type")
			or self.has_value_changed("grade_group")
		)
		if should_repopulate:
			self.populate_applicable_employees()

	def on_update(self):
		# When HR Admin creates or saves appraisal cycle, only auto-create draft performance plans if cycle is ACTIVE
		if self.status in ["Active", "Planning Open"] and self.applicable_employees:
			self.create_draft_performance_plans()
			try:
				from gdl_pms.notification_service import notify_cycle_employees_to_plan
				notify_cycle_employees_to_plan(self)
			except Exception as e:
				frappe.logger().error(f"Failed to notify cycle employees to create plan: {str(e)}")

		self.sync_amendment_window_to_plans()

	def sync_amendment_window_to_plans(self):
		if not self.name or self.status == "Closed":
			return

		if self.amendment_window_open:
			plans = frappe.get_all(
				"PMS Appraisal",
				filters={
					"cycle": self.name,
					"plan_status": "Approved",
					"workflow_state": "Monitoring"
				},
				fields=["name", "employee", "amendment_window_open"]
			)
			for p in plans:
				if not p.amendment_window_open:
					frappe.db.set_value("PMS Appraisal", p.name, "amendment_window_open", 1, update_modified=False)

				existing = frappe.db.exists("PMS Plan Amendment", {
					"performance_plan": p.name,
					"status": ["in", ["Draft", "Pending Supervisor Approval", "Pending Reviewer Approval"]]
				})
				if not existing:
					emp_user = frappe.db.get_value("Employee", p.employee, "user_id")
					amendment = frappe.get_doc({
						"doctype": "PMS Plan Amendment",
						"performance_plan": p.name,
						"status": "Draft",
						"owner": emp_user or frappe.session.user
					})
					amendment.flags.ignore_permissions = True
					amendment.insert(ignore_permissions=True)
					frappe.db.commit()
		else:
			frappe.db.sql("""
				UPDATE `tabPMS Appraisal`
				SET amendment_window_open = 0
				WHERE cycle = %s AND amendment_window_open = 1
			""", (self.name,))
			frappe.db.commit()

	def create_draft_performance_plans(self):
		if self.status not in ["Active", "Planning Open"] or not self.applicable_employees:
			return

		created_count = 0
		for emp in self.applicable_employees:
			if not emp.employee:
				continue

			# Check if PMS Appraisal already exists for this employee and cycle
			existing = frappe.db.get_value(
				"PMS Appraisal",
				{"employee": emp.employee, "cycle": self.name},
				["name", "plan_status"],
				as_dict=True
			)

			if existing:
				plan_name = existing.name
				plan_status = existing.plan_status or "Draft"
				needs_update = False
				updates = {}
				if emp.performance_plan != plan_name:
					emp.performance_plan = plan_name
					updates["performance_plan"] = plan_name
					needs_update = True
				if emp.appraisal_status != plan_status:
					emp.appraisal_status = plan_status
					updates["appraisal_status"] = plan_status
					needs_update = True
				if needs_update and getattr(emp, "name", None):
					frappe.db.set_value("PMS Appraisal Cycle Employee", emp.name, updates, update_modified=False)
			else:
				try:
					appraisal = frappe.get_doc({
						"doctype": "PMS Appraisal",
						"employee": emp.employee,
						"employee_name": emp.employee_name,
						"cycle": self.name,
						"calendar_year": self.calendar_year,
						"cycle_end_date": self.end_date,
						"grade_group": emp.grade_group,
						"supervisor_snapshot": emp.supervisor,
						"supervisor_name": emp.supervisor_name,
						"reviewer_snapshot": emp.reviewer,
						"reviewer_name": emp.reviewer_name,
						"plan_status": "Draft",
						"workflow_state": "Planning Open",
						"appraisal_status": "Not Activated"
					})
					appraisal.flags.ignore_permissions = True
					appraisal.flags.ignore_mandatory = True
					appraisal.insert(ignore_permissions=True)
					created_count += 1

					emp.performance_plan = appraisal.name
					emp.appraisal_status = "Draft"
					if getattr(emp, "name", None):
						frappe.db.set_value("PMS Appraisal Cycle Employee", emp.name, {
							"appraisal_status": "Draft",
							"performance_plan": appraisal.name
						}, update_modified=False)
				except Exception as e:
					frappe.logger().error(f"Failed to auto-create draft plan for {emp.employee} in cycle {self.name}: {str(e)}")

		if created_count > 0:
			frappe.db.commit()

	def populate_applicable_employees(self):
		start_date = self.start_date if self.cycle_type == "Probation" else None
		data = _get_applicable_employees_internal(self.grade_group, self.name, self.cycle_type, start_date)
		self.applicable_employees = []
		for emp in data.get("employees", []):
			self.append("applicable_employees", {
				"employee": emp["employee"],
				"employee_name": emp["employee_name"],
				"date_of_joining": emp.get("date_of_joining"),
				"employment_type": emp.get("employment_type"),
				"grade_group": emp.get("grade_group"),
				"department": emp.get("department"),
				"designation": emp.get("designation"),
				"supervisor": emp.get("supervisor"),
				"supervisor_name": emp.get("supervisor_name"),
				"reviewer": emp.get("reviewer"),
				"reviewer_name": emp.get("reviewer_name"),
				"performance_plan": emp.get("performance_plan") or "",
				"appraisal_status": emp.get("appraisal_status") or "Not Created",
			})



def check_hr_admin_permission():
	user = frappe.session.user
	if user == "Administrator":
		return
	roles = frappe.get_roles(user)
	if "PMS HR Admin" not in roles:
		frappe.throw(
			_("Only PMS HR Admin is permitted to access cycle employee reporting hierarchy."),
			frappe.PermissionError
		)


@frappe.whitelist()
def get_applicable_employees_list(grade_group=None, cycle_name=None, cycle_type=None, start_date=None):
	"""
	Fetch all active employees applicable for the given grade group along with
	supervisor and reviewer hierarchy details.
	Restricted strictly to HR Admin / System Manager.
	"""
	check_hr_admin_permission()
	return _get_applicable_employees_internal(grade_group, cycle_name, cycle_type, start_date)


def _get_applicable_employees_internal(grade_group=None, cycle_name=None, cycle_type=None, start_date=None):
	if cycle_name:
		cycle_doc = frappe.db.get_value("PMS Appraisal Cycle", cycle_name, ["grade_group", "cycle_type", "start_date"], as_dict=True)
		if cycle_doc:
			if not grade_group:
				grade_group = cycle_doc.grade_group
			if not cycle_type:
				cycle_type = cycle_doc.cycle_type
			if not start_date and cycle_type == "Probation":
				start_date = cycle_doc.start_date

	grade_group = grade_group or "All"
	cycle_type = cycle_type or "Annual"

	filters = {"status": "Active"}
	if grade_group != "All":
		filters["grade_group"] = grade_group
	else:
		filters["grade_group"] = ["is", "set"]

	employees = frappe.get_all(
		"Employee",
		filters=filters,
		fields=[
			"name", "employee_name", "grade_group", "department",
			"designation", "reports_to", "reviewer",
			"employment_type", "date_of_joining", "final_confirmation_date", "contract_end_date"
		],
		order_by="employee_name asc"
	)

	# Filter employees based on Cycle Type & Employee Type:
	# - Probation: Only Probation employees (if start_date selected, only matching joining date)
	# - Annual: Full time employee and Contract employees
	joining_date_groups = {}
	if cycle_type == "Probation":
		probation_employees = [
			e for e in employees
			if (e.get("employment_type") == "Probation") or (not e.get("employment_type") and not e.get("final_confirmation_date") and not e.get("contract_end_date"))
		]
		for e in probation_employees:
			jd = str(e.get("date_of_joining") or "")
			group_key = jd if jd else "Not Specified"
			joining_date_groups.setdefault(group_key, []).append({
				"employee": e["name"],
				"employee_name": e["employee_name"],
				"date_of_joining": jd
			})

		if start_date:
			employees = [
				e for e in probation_employees
				if e.get("date_of_joining") and str(e.get("date_of_joining")) == str(start_date)
			]
		else:
			employees = probation_employees
	else:
		employees = [
			e for e in employees
			if (e.get("employment_type") in ["Full-time", "Full time employee", "Contract", "Regular"]) or (not e.get("employment_type") and (e.get("final_confirmation_date") or e.get("contract_end_date")))
		]

	# Collect supervisor and reviewer IDs to fetch their names in batch
	supervisor_ids = {e["reports_to"] for e in employees if e.get("reports_to")}
	reviewer_ids = {e["reviewer"] for e in employees if e.get("reviewer")}
	all_lead_ids = supervisor_ids.union(reviewer_ids)

	lead_names_map = {}
	if all_lead_ids:
		lead_records = frappe.get_all(
			"Employee",
			filters={"name": ["in", list(all_lead_ids)]},
			fields=["name", "employee_name"]
		)
		lead_names_map = {r["name"]: r["employee_name"] for r in lead_records}

	# Check existing PMS Appraisals if cycle_name is provided
	appraisal_status_map = {}
	appraisal_plan_map = {}
	if cycle_name:
		existing_appraisals = frappe.get_all(
			"PMS Appraisal",
			filters={"cycle": cycle_name},
			fields=["employee", "plan_status", "workflow_state", "name"]
		)
		appraisal_status_map = {a["employee"]: a["plan_status"] or "Draft" for a in existing_appraisals}
		appraisal_plan_map = {a["employee"]: a["name"] for a in existing_appraisals}

	result_list = []
	with_sup_count = 0
	with_rev_count = 0
	missing_hierarchy_list = []

	for emp in employees:
		sup_id = emp.get("reports_to")
		sup_name = lead_names_map.get(sup_id) if sup_id else None

		rev_id = emp.get("reviewer")
		rev_name = lead_names_map.get(rev_id) if rev_id else None

		if sup_id:
			with_sup_count += 1
		if rev_id:
			with_rev_count += 1

		if not sup_id or not rev_id:
			missing_reasons = []
			if not sup_id: missing_reasons.append("Supervisor")
			if not rev_id: missing_reasons.append("Reviewer")
			missing_hierarchy_list.append({
				"employee": emp["name"],
				"employee_name": emp["employee_name"],
				"missing": ", ".join(missing_reasons)
			})

		plan_status = appraisal_status_map.get(emp["name"], "Not Created")
		perf_plan = appraisal_plan_map.get(emp["name"], "")
		emp_type = emp.get("employment_type") or ("Contract" if emp.get("contract_end_date") else ("Full time employee" if emp.get("final_confirmation_date") else "Probation"))

		result_list.append({
			"employee": emp["name"],
			"employee_name": emp["employee_name"],
			"date_of_joining": emp.get("date_of_joining"),
			"employment_type": emp_type,
			"grade_group": emp.get("grade_group"),
			"department": emp.get("department"),
			"designation": emp.get("designation"),
			"supervisor": sup_id,
			"supervisor_name": sup_name or "Not Assigned",
			"reviewer": rev_id,
			"reviewer_name": rev_name or "Not Assigned",
			"appraisal_status": plan_status,
			"performance_plan": perf_plan
		})

	total_emp = len(employees)
	stats = {
		"total": total_emp,
		"with_supervisor": with_sup_count,
		"with_reviewer": with_rev_count,
		"missing_supervisor": total_emp - with_sup_count,
		"missing_reviewer": total_emp - with_rev_count,
		"missing_any_count": len(missing_hierarchy_list),
		"missing_hierarchy_list": missing_hierarchy_list
	}
	if cycle_type == "Probation":
		stats["joining_date_groups"] = joining_date_groups

	return {
		"employees": result_list,
		"stats": stats
	}


@frappe.whitelist()
def sync_cycle_employees(cycle_name):
	"""
	Whitelisted method for HR Admin to re-sync employees on an existing cycle.
	"""
	check_hr_admin_permission()
	doc = frappe.get_doc("PMS Appraisal Cycle", cycle_name)
	doc.flags.sync_employees = True
	doc.populate_applicable_employees()
	doc.save(ignore_permissions=True)
	doc.create_draft_performance_plans()
	frappe.db.commit()
	return get_applicable_employees_list(doc.grade_group, doc.name, doc.cycle_type)


@frappe.whitelist()
def notify_cycle_employees(cycle_name):
	"""
	Whitelisted method for HR Admin to explicitly notify applicable employees to create performance plans.
	"""
	check_hr_admin_permission()
	from gdl_pms.notification_service import notify_cycle_employees_to_plan
	count = notify_cycle_employees_to_plan(cycle_name, force=False)
	return _("Notified {0} employee(s) to create their Performance Plan.").format(count)


@frappe.whitelist()
def get_cycle_plans_for_appraisal_activation(cycle_name):
	"""
	Returns all performance plans under the cycle with status and eligibility details
	so HR Admin can filter and select plans in the activation dialog.
	"""
	check_hr_admin_permission()
	plans = frappe.get_all(
		"PMS Appraisal",
		filters={"cycle": cycle_name},
		fields=["name", "employee", "employee_name", "grade_group", "plan_status", "workflow_state", "appraisal_status"],
		order_by="employee_name asc"
	)
	for p in plans:
		p["is_eligible"] = bool(p.plan_status in ["Approved", "Monitoring"] and p.workflow_state == "Monitoring")
		p["is_already_active"] = bool(p.workflow_state in ["Appraisal Open", "Appraisal Completed", "Disputed", "Closed"])
	return plans


@frappe.whitelist()
def activate_cycle_appraisals(cycle_name, status_filter=None, selected_plans=None):
	"""
	Bulk activates the Appraisal Phase (Self-Rating) for all eligible or selected performance plans
	in the specified appraisal cycle.
	"""
	check_hr_admin_permission()
	cycle = frappe.get_doc("PMS Appraisal Cycle", cycle_name)
	if cycle.status == "Closed":
		frappe.throw(_("Cannot activate appraisals in a Closed cycle."))

	if isinstance(selected_plans, str):
		import json
		try:
			selected_plans = json.loads(selected_plans)
		except Exception:
			selected_plans = [p.strip() for p in selected_plans.split(",") if p.strip()]

	from gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal import activate_appraisal_phase

	filters = {"cycle": cycle_name}
	if selected_plans:
		filters["name"] = ["in", selected_plans]
	elif status_filter and status_filter != "All":
		if status_filter == "Approved":
			filters["plan_status"] = "Approved"
			filters["workflow_state"] = "Monitoring"
		elif status_filter == "Draft":
			filters["plan_status"] = "Draft"

	plans = frappe.get_all(
		"PMS Appraisal",
		filters=filters,
		fields=["name", "employee", "employee_name", "plan_status", "workflow_state", "appraisal_status"]
	)

	if not plans:
		return {
			"activated_count": 0,
			"already_activated": 0,
			"skipped_not_approved": 0,
			"message": _("No matching performance plans found for cycle {0}.").format(cycle_name)
		}

	activated_count = 0
	skipped_not_approved = 0
	already_activated = 0
	activated_plan_names = []

	for p in plans:
		if p.workflow_state in ["Appraisal Open", "Appraisal Completed", "Disputed", "Closed"]:
			already_activated += 1
			continue

		if p.plan_status not in ["Approved", "Monitoring"] or p.workflow_state != "Monitoring":
			skipped_not_approved += 1
			continue

		try:
			activate_appraisal_phase(p.name)
			activated_count += 1
			activated_plan_names.append(p.name)
		except Exception as e:
			frappe.logger().error(f"Failed to activate appraisal phase for {p.name}: {str(e)}")

	# Update child table on cycle doc to reflect new appraisal_status
	if activated_count > 0:
		for row in cycle.applicable_employees:
			if row.performance_plan in activated_plan_names:
				row.appraisal_status = "Self-Assessment Pending"
				if getattr(row, "name", None):
					frappe.db.set_value("PMS Appraisal Cycle Employee", row.name, "appraisal_status", "Self-Assessment Pending", update_modified=False)

		# Update cycle status to Self-Rating Open if currently Active
		if cycle.status == "Active":
			cycle.db_set("status", "Self-Rating Open", update_modified=False)

		frappe.db.commit()

		# Send in-app and email notifications
		try:
			from gdl_pms.notification_service import notify_cycle_employees_appraisal_open
			notify_cycle_employees_appraisal_open(cycle, activated_plan_names)
		except Exception as e:
			frappe.logger().error(f"Failed sending appraisal open notifications for cycle {cycle_name}: {str(e)}")

	msg = _("Activated Appraisal Phase for {0} plan(s).").format(activated_count)
	if already_activated:
		msg += _(" ({0} already activated).").format(already_activated)
	if skipped_not_approved:
		msg += _(" ({0} skipped because plan is not yet Approved/Monitoring).").format(skipped_not_approved)

	return {
		"activated_count": activated_count,
		"already_activated": already_activated,
		"skipped_not_approved": skipped_not_approved,
		"message": msg
	}


@frappe.whitelist()
def sync_cycle_evaluations_to_employee_master(cycle_name):
	"""
	Bulk uploads/syncs all finalized appraisals in this cycle into their respective Employee Masters.
	"""
	check_hr_admin_permission()
	from gdl_pms.gdl_pms.doctype.pms_appraisal.pms_appraisal import sync_appraisal_to_employee_master

	appraisals = frappe.get_all(
		"PMS Appraisal",
		filters={"cycle": cycle_name, "docstatus": 0},
		fields=["name", "employee", "total_score", "locked", "appraisal_status"]
	)

	synced_count = 0
	skipped_count = 0
	errors = []

	for app in appraisals:
		if not app.locked and app.appraisal_status != "Finalized & Locked":
			skipped_count += 1
			continue
		try:
			sync_appraisal_to_employee_master(app.name)
			synced_count += 1
		except Exception as e:
			errors.append(f"{app.name}: {str(e)}")

	msg = _("Successfully synced {0} evaluation(s) to Employee Master.").format(synced_count)
	if skipped_count:
		msg += " " + _("({0} plan(s) skipped because they are not yet Finalized & Locked).").format(skipped_count)

	return {
		"synced_count": synced_count,
		"skipped_count": skipped_count,
		"errors": errors,
		"message": msg
	}



def get_permission_query_conditions(user):
	if not user: user = frappe.session.user
	if user == "Administrator": return ""
	
	roles = frappe.get_roles(user)
	if "PMS HR Admin" in roles:
		return ""
	
	# Allow all authenticated PMS participants to view draft and active/published cycles
	allowed_roles = {"PMS Employee", "PMS Supervisor", "PMS Reviewer", "PMS Supervisor 2", "PMS PERC"}
	if any(r in allowed_roles for r in roles):
		return "`tabPMS Appraisal Cycle`.status IN ('Draft', 'Active', 'Planning Open', 'Monitoring', 'Self-Rating Open', 'Closed')"
		
	return "1=0"


def has_permission(doc, ptype="read", user=None):
	if not user: user = frappe.session.user
	if user == "Administrator": return True
	
	roles = frappe.get_roles(user)
	if "PMS HR Admin" in roles:
		return True
		
	if ptype == "read":
		allowed_roles = {"PMS Employee", "PMS Supervisor", "PMS Reviewer", "PMS Supervisor 2", "PMS PERC"}
		if any(r in allowed_roles for r in roles):
			return True
	
	return False
