import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

def execute():
    """Consolidated post-migration patch for GDL PMS roles, custom fields, and permissions."""
    frappe.logger().info("[GDL PMS Patch] Running consolidated setup patch...")

    # 1. Setup Roles
    setup_roles()

    # 2. Setup Custom Fields on Employee
    setup_custom_fields()

    # 3. Setup Permissions
    setup_permissions()

    # 4. Setup Property Setters
    setup_property_setters()

    # 5. Setup Print Formats
    try:
        from gdl_pms.setup_print_formats import run as setup_print_formats
        setup_print_formats()
    except Exception as e:
        frappe.logger().warning(f"[GDL PMS Patch] setup_print_formats warning: {e}")

    frappe.db.commit()
    frappe.logger().info("[GDL PMS Patch] Consolidated setup patch completed successfully.")

def setup_roles():
    roles = [
        {"role_name": "HR Admin", "desk_access": 1},
        {"role_name": "Supervisor 2", "desk_access": 1},
        {"role_name": "Reviewer", "desk_access": 1},
        {"role_name": "Supervisor", "desk_access": 1},
        {"role_name": "Employee", "desk_access": 1},
    ]
    for r in roles:
        if not frappe.db.exists("Role", r["role_name"]):
            frappe.get_doc({
                "doctype": "Role",
                "role_name": r["role_name"],
                "desk_access": r["desk_access"]
            }).insert(ignore_permissions=True)
            frappe.logger().info(f"[GDL PMS] Created Role: {r['role_name']}")

def setup_custom_fields():
    # Employee.grade_group
    create_custom_field("Employee", {
        "fieldname": "grade_group",
        "label": "Grade Group",
        "fieldtype": "Link",
        "options": "PMS Grade Group",
        "insert_after": "department",
        "reqd": 1,
        "in_list_view": 1
    })

    # Employee.employment_type
    create_custom_field("Employee", {
        "fieldname": "employment_type",
        "label": "Employee Type",
        "fieldtype": "Select",
        "options": "Full time employee\nContract\nProbation",
        "insert_after": "grade_group",
        "reqd": 1,
        "in_list_view": 1
    })

    # Employee.reviewer
    create_custom_field("Employee", {
        "fieldname": "reviewer",
        "label": "Reviewer",
        "fieldtype": "Link",
        "options": "Employee",
        "insert_after": "reports_to",
        "in_list_view": 1
    })

    # Employee.supervisor_2
    create_custom_field("Employee", {
        "fieldname": "supervisor_2",
        "label": "Supervisor 2",
        "fieldtype": "Link",
        "options": "Employee",
        "insert_after": "reviewer",
        "in_list_view": 1
    })

    # Employee.pms_evaluations_tab
    create_custom_field("Employee", {
        "fieldname": "pms_evaluations_tab",
        "label": "PMS Evaluations",
        "fieldtype": "Tab Break",
        "insert_after": "profile_tab"
    })

    # Employee.pms_evaluations_section
    create_custom_field("Employee", {
        "fieldname": "pms_evaluations_section",
        "label": "PMS Evaluation History",
        "fieldtype": "Section Break",
        "insert_after": "pms_evaluations_tab"
    })

    # Employee.pms_evaluations
    create_custom_field("Employee", {
        "fieldname": "pms_evaluations",
        "label": "PMS Evaluations",
        "fieldtype": "Table",
        "options": "Employee PMS Evaluation",
        "insert_after": "pms_evaluations_section"
    })

def setup_permissions():
    # Grant Page read permissions to PMS roles
    page_roles = ["Desk User", "Employee", "Supervisor", "Supervisor 2", "Reviewer", "HR Admin", "All"]
    for role in page_roles:
        if not frappe.db.exists("Role", role):
            continue
        exists = frappe.db.exists("Custom DocPerm", {"parent": "Page", "role": role})
        if not exists:
            frappe.get_doc({
                "doctype": "Custom DocPerm",
                "parent": "Page",
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": role,
                "read": 1,
                "select": 1,
                "write": 0,
                "create": 0,
                "delete": 0,
                "report": 0,
                "export": 0,
                "share": 0
            }).insert(ignore_permissions=True)
        else:
            doc = frappe.get_doc("Custom DocPerm", exists)
            doc.read = 1
            doc.select = 1
            doc.save(ignore_permissions=True)

    # Grant HR Admin read permissions to standard DocTypes
    hr_read_doctypes = ["Employee", "Department", "Designation"]
    for dt in hr_read_doctypes:
        exists = frappe.db.exists("Custom DocPerm", {"parent": dt, "role": "HR Admin"})
        if not exists:
            frappe.get_doc({
                "doctype": "Custom DocPerm",
                "parent": dt,
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": "HR Admin",
                "read": 1
            }).insert(ignore_permissions=True)
        else:
            perm = frappe.get_doc("Custom DocPerm", exists)
            perm.read = 1
            perm.save(ignore_permissions=True)

    # Grant Employee role read access to linked doctypes
    emp_read_doctypes = ["Employee", "PMS Appraisal Cycle"]
    for dt in emp_read_doctypes:
        exists = frappe.db.exists("Custom DocPerm", {"parent": dt, "role": "Employee"})
        if not exists:
            frappe.get_doc({
                "doctype": "Custom DocPerm",
                "parent": dt,
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": "Employee",
                "read": 1
            }).insert(ignore_permissions=True)

    # Employee permissions for Appraisal DocTypes
    emp_crud_doctypes = ["PMS Appraisal", "PMS Target", "PMS Competency Score"]
    for dt in emp_crud_doctypes:
        exists = frappe.db.exists("Custom DocPerm", {"parent": dt, "role": "Employee"})
        if not exists:
            frappe.get_doc({
                "doctype": "Custom DocPerm",
                "parent": dt,
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": "Employee",
                "read": 1,
                "write": 1,
                "create": 1,
                "report": 1
            }).insert(ignore_permissions=True)

    # HR Admin permissions for Manage Competencies
    for dt in ["PMS Manage Competencies", "PMS Competency Item"]:
        exists = frappe.db.exists("Custom DocPerm", {"parent": dt, "role": "HR Admin"})
        if not exists:
            frappe.get_doc({
                "doctype": "Custom DocPerm",
                "parent": dt,
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": "HR Admin",
                "read": 1,
                "write": 1,
                "create": 1
            }).insert(ignore_permissions=True)

def setup_property_setters():
    # Make 'grade_group' on PMS Appraisal read-only
    make_property_setter("PMS Appraisal", "grade_group", "read_only", 1, "Check")

    # Set precision of weight to 2 decimal places
    make_property_setter("PMS Target", "weight", "precision", "2", "Select")
    make_property_setter("PMS Competency Score", "weight", "precision", "2", "Select")

    # Ignore user permissions on snapshot fields
    for dt in ["PMS Appraisal", "PMS Plan Amendment"]:
        for f in ["employee", "supervisor_snapshot", "reviewer_snapshot", "supervisor_2_snapshot"]:
            if frappe.db.exists("DocField", {"parent": dt, "fieldname": f}):
                frappe.db.set_value("DocField", {"parent": dt, "fieldname": f}, "ignore_user_permissions", 1)
