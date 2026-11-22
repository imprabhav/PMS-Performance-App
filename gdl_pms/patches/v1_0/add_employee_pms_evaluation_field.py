import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

def execute():
    # Delete old misplaced fields if present
    frappe.db.delete("Custom Field", {"dt": "Employee", "fieldname": ["in", ["pms_evaluations_tab", "pms_evaluations_section", "pms_evaluations"]]})

    # 1. Dedicated Tab Break on Employee
    create_custom_field("Employee", {
        "fieldname": "pms_evaluations_tab",
        "label": "PMS Evaluations",
        "fieldtype": "Tab Break",
        "insert_after": "profile_tab"
    })

    # 2. Section Break inside the tab
    create_custom_field("Employee", {
        "fieldname": "pms_evaluations_section",
        "label": "PMS Evaluation History",
        "fieldtype": "Section Break",
        "insert_after": "pms_evaluations_tab"
    })

    # 3. Table field inside the section
    create_custom_field("Employee", {
        "fieldname": "pms_evaluations",
        "label": "PMS Evaluations",
        "fieldtype": "Table",
        "options": "Employee PMS Evaluation",
        "insert_after": "pms_evaluations_section"
    })

    frappe.clear_cache(doctype="Employee")
    frappe.db.commit()

