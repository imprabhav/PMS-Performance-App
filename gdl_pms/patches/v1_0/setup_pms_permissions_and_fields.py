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

    # 6. Sync PMS Workspace Sidebars
    try:
        sync_workspace_sidebars()
    except Exception as e:
        frappe.logger().warning(f"[GDL PMS Patch] sync_workspace_sidebars warning: {e}")

    # 7. Sync PMS Desktop Icons & Folder Items (Role-scoped, no Reports)
    try:
        sync_pms_desktop_icons()
    except Exception as e:
        frappe.logger().warning(f"[GDL PMS Patch] sync_pms_desktop_icons warning: {e}")

    frappe.db.commit()
    frappe.logger().info("[GDL PMS Patch] Consolidated setup patch completed successfully.")

def setup_roles():
    roles = [
        {"role_name": "PMS HR Admin", "desk_access": 1},
        {"role_name": "PMS Supervisor 2", "desk_access": 1},
        {"role_name": "PMS Reviewer", "desk_access": 1},
        {"role_name": "PMS Supervisor", "desk_access": 1},
        {"role_name": "PMS Employee", "desk_access": 1},
        {"role_name": "PMS PERC", "desk_access": 1},
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

    # Employee.employment_type (do not overwrite existing HRMS Link field if already present)
    if not frappe.db.exists("Custom Field", {"dt": "Employee", "fieldname": "employment_type"}) and not frappe.get_meta("Employee").has_field("employment_type"):
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
        "in_list_view": 0
    })

    # Employee.supervisor_2
    create_custom_field("Employee", {
        "fieldname": "supervisor_2",
        "label": "Supervisor 2",
        "fieldtype": "Link",
        "options": "Employee",
        "insert_after": "reviewer",
        "in_list_view": 0
    })

    # Ensure existing Custom Fields do not trigger duplicate tabEmployee2 join in List View
    for fn in ["reviewer", "supervisor_2"]:
        cf = frappe.db.get_value("Custom Field", {"dt": "Employee", "fieldname": fn})
        if cf:
            frappe.db.set_value("Custom Field", cf, "in_list_view", 0)

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

def _upsert_custom_docperm(doctype, role, perms):
    """Ensure a Custom DocPerm row exists with the given permission flags."""
    if not frappe.db.exists("Role", role) or not frappe.db.exists("DocType", doctype):
        return
    name = frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0})
    if not name:
        doc = frappe.get_doc({
            "doctype": "Custom DocPerm",
            "parent": doctype,
            "parenttype": "DocType",
            "parentfield": "permissions",
            "role": role,
            "permlevel": 0,
            **perms,
        })
        doc.insert(ignore_permissions=True)
    else:
        doc = frappe.get_doc("Custom DocPerm", name)
        changed = False
        for k, v in perms.items():
            if doc.get(k) != v:
                doc.set(k, v)
                changed = True
        if changed:
            doc.save(ignore_permissions=True)


def setup_permissions():
    # Clean up legacy non-PMS role Custom DocPerms on PMS DocTypes so only dedicated PMS * roles control access
    pms_doctypes = [
        "PMS Appraisal Cycle",
        "PMS Appraisal",
        "PMS Target",
        "PMS Competency Score",
        "PMS Manage Competencies",
        "PMS Competency Item",
        "PMS Plan Amendment",
        "PMS Grade Group",
        "PMS Calendar",
        "PERC Case",
    ]
    legacy_roles = ["Employee", "Supervisor", "Supervisor 2", "Reviewer", "HR Admin", "HR Manager", "System Manager"]
    for dt in pms_doctypes:
        for role in legacy_roles:
            stale = frappe.get_all("Custom DocPerm", filters={"parent": dt, "role": role}, pluck="name")
            for name in stale:
                frappe.delete_doc("Custom DocPerm", name, ignore_permissions=True)

    # Grant Page read permissions to PMS roles
    page_roles = ["Desk User", "PMS Employee", "PMS Supervisor", "PMS Supervisor 2", "PMS Reviewer", "PMS HR Admin", "PMS PERC", "All"]
    for role in page_roles:
        _upsert_custom_docperm("Page", role, {
            "read": 1, "select": 1, "write": 0, "create": 0,
            "delete": 0, "report": 0, "export": 0, "share": 0,
        })

    # Grant PMS HR Admin read permissions to standard DocTypes
    for dt in ["Employee", "Department", "Designation"]:
        _upsert_custom_docperm(dt, "PMS HR Admin", {"read": 1})

    # Grant PMS Employee role read access to Employee
    _upsert_custom_docperm("Employee", "PMS Employee", {"read": 1})

    # PMS Appraisal Cycle: full CRUD strictly for PMS HR Admin; read-only for other PMS roles
    cycle_admin_perms = {
        "read": 1, "write": 1, "create": 1, "delete": 1,
        "report": 1, "export": 1, "print": 1, "share": 1,
    }
    _upsert_custom_docperm("PMS Appraisal Cycle", "PMS HR Admin", cycle_admin_perms)
    for role in ["PMS Employee", "PMS Supervisor", "PMS Reviewer", "PMS Supervisor 2", "PMS PERC"]:
        _upsert_custom_docperm("PMS Appraisal Cycle", role, {"read": 1, "write": 0, "create": 0, "delete": 0})

    # PMS Appraisal: full CRUD for PMS HR Admin; CRUD (no delete) for primary parties; read for PMS Supervisor 2 / PMS PERC
    appraisal_admin_perms = {
        "read": 1, "write": 1, "create": 1, "delete": 1,
        "report": 1, "export": 1, "print": 1, "share": 1,
    }
    _upsert_custom_docperm("PMS Appraisal", "PMS HR Admin", appraisal_admin_perms)
    for role in ["PMS Employee", "PMS Supervisor", "PMS Reviewer"]:
        _upsert_custom_docperm("PMS Appraisal", role, {"read": 1, "write": 1, "create": 1, "delete": 0, "report": 1})
    for role in ["PMS Supervisor 2", "PMS PERC"]:
        _upsert_custom_docperm("PMS Appraisal", role, {"read": 1, "write": 0, "create": 0, "delete": 0, "report": 1})

    # Child tables of PMS Appraisal
    for dt in ["PMS Target", "PMS Competency Score"]:
        for role in ["PMS HR Admin", "PMS Employee", "PMS Supervisor", "PMS Reviewer"]:
            _upsert_custom_docperm(dt, role, {"read": 1, "write": 1, "create": 1, "delete": 1})
        for role in ["PMS Supervisor 2", "PMS PERC"]:
            _upsert_custom_docperm(dt, role, {"read": 1, "write": 0, "create": 0, "delete": 0})

    # Manage Competencies: full CRUD strictly for PMS HR Admin
    for dt in ["PMS Manage Competencies", "PMS Competency Item"]:
        _upsert_custom_docperm(dt, "PMS HR Admin", {"read": 1, "write": 1, "create": 1, "delete": 1})

    # PMS Plan Amendment
    _upsert_custom_docperm("PMS Plan Amendment", "PMS HR Admin", appraisal_admin_perms)
    for role in ["PMS Employee", "PMS Supervisor", "PMS Reviewer"]:
        _upsert_custom_docperm("PMS Plan Amendment", role, {"read": 1, "write": 1, "create": 1, "delete": 0, "report": 1})
    _upsert_custom_docperm("PMS Plan Amendment", "PMS Supervisor 2", {"read": 1, "write": 0, "create": 0, "delete": 0})

    # PMS Grade Group
    _upsert_custom_docperm("PMS Grade Group", "PMS HR Admin", {"read": 1, "write": 1, "create": 1, "delete": 1})
    for role in ["PMS Employee", "PMS Supervisor", "PMS Reviewer", "PMS Supervisor 2", "PMS PERC"]:
        _upsert_custom_docperm("PMS Grade Group", role, {"read": 1, "write": 0, "create": 0, "delete": 0})

    # PMS Calendar: strictly PMS HR Admin
    _upsert_custom_docperm("PMS Calendar", "PMS HR Admin", {"read": 1, "write": 1, "create": 1, "delete": 1})

    # PERC Case
    _upsert_custom_docperm("PERC Case", "PMS HR Admin", appraisal_admin_perms)
    for role in ["PMS PERC", "PMS Employee", "PMS Supervisor", "PMS Reviewer", "PMS Supervisor 2"]:
        _upsert_custom_docperm("PERC Case", role, {"read": 1, "write": 1, "create": 1, "delete": 0, "report": 1})

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

def sync_workspace_sidebars():
    """Ensure all individual PMS Workspace Sidebars match GDL PMS with full tabs and colored icons."""
    if not frappe.db.exists("Workspace Sidebar", "GDL PMS"):
        return
    gdl_pms_ws = frappe.get_doc("Workspace Sidebar", "GDL PMS")
    for ws_name in ["PMS HR", "PMS Employee", "PMS Supervisor", "PMS Reviewer", "PMS Supervisor 2", "PMS PERC"]:
        if frappe.db.exists("Workspace Sidebar", ws_name):
            doc = frappe.get_doc("Workspace Sidebar", ws_name)
            doc.items = []
            for it in gdl_pms_ws.items:
                doc.append("items", {
                    "label": it.label,
                    "link_to": it.link_to,
                    "link_type": it.link_type,
                    "type": it.type,
                    "icon": it.icon,
                    "child": it.child,
                    "collapsible": it.collapsible,
                    "indent": it.indent,
                    "keep_closed": it.keep_closed,
                    "url": it.url,
                    "show_arrow": it.show_arrow,
                    "filters": it.filters,
                    "route_options": it.route_options,
                    "navigate_to_tab": it.navigate_to_tab
                })
            doc.save(ignore_permissions=True)

def sync_pms_desktop_icons():
    """Hide duplicate PMS Dashboard icons, scope role dashboards, and add non-report sidebar tabs to GDL PMS folder."""
    for dup_icon in [
        "PMS HR Dashboard",
        "PMS Employee Dashboard",
        "PMS Supervisor Dashboard",
        "PMS Supervisor 2 Dashboard",
        "PMS Reviewer Dashboard",
    ]:
        if frappe.db.exists("Desktop Icon", dup_icon):
            frappe.db.set_value("Desktop Icon", dup_icon, "hidden", 1)

    ws_role_map = {
        "PMS HR": ["HR Admin", "HR Manager", "System Manager"],
        "PMS Employee": ["Employee", "Supervisor", "Supervisor 2", "Reviewer"],
        "PMS Supervisor": ["Supervisor"],
        "PMS Supervisor 2": ["Supervisor 2"],
        "PMS Reviewer": ["Reviewer"],
        "PMS PERC": ["PERC Member", "System Manager"],
    }

    for icon_name, roles in ws_role_map.items():
        if frappe.db.exists("Desktop Icon", icon_name):
            doc = frappe.get_doc("Desktop Icon", icon_name)
            doc.parent_icon = "GDL PMS"
            doc.roles = []
            for r in roles:
                if frappe.db.exists("Role", r):
                    doc.append("roles", {"role": r})
            doc.save(ignore_permissions=True)

    sidebar_tab_icons = [
        {
            "label": "PMS Cycle",
            "link": "/desk/pms-appraisal-cycle",
            "icon": "calendar",
            "roles": ["HR Admin", "HR Manager", "System Manager", "Employee", "Supervisor", "Supervisor 2", "Reviewer"],
        },
        {
            "label": "PMS Performance Plan",
            "link": "/desk/pms-appraisal?plan=1",
            "icon": "clipboard",
            "roles": ["HR Admin", "HR Manager", "System Manager", "Employee", "Supervisor", "Supervisor 2", "Reviewer"],
        },
        {
            "label": "PMS Appraisal Form",
            "link": "/desk/pms-appraisal",
            "icon": "clipboard-check",
            "roles": ["HR Admin", "HR Manager", "System Manager", "Employee", "Supervisor", "Supervisor 2", "Reviewer"],
        },
        {
            "label": "PMS Plan Amendment",
            "link": "/desk/pms-plan-amendment",
            "icon": "edit-3",
            "roles": ["HR Admin", "HR Manager", "System Manager", "Employee", "Supervisor", "Supervisor 2", "Reviewer"],
        },
        {
            "label": "PERC Case",
            "link": "/desk/perc-case",
            "icon": "shield",
            "roles": ["HR Admin", "HR Manager", "System Manager", "PERC Member"],
        },
        {
            "label": "Manage Competencies",
            "link": "/desk/pms-manage-competencies",
            "icon": "settings",
            "roles": ["HR Admin", "HR Manager", "System Manager"],
        },
    ]

    for item in sidebar_tab_icons:
        if frappe.db.exists("Desktop Icon", item["label"]):
            doc = frappe.get_doc("Desktop Icon", item["label"])
        else:
            doc = frappe.new_doc("Desktop Icon")
            doc.label = item["label"]

        doc.icon_type = "Link"
        doc.link_type = "External"
        doc.link = item["link"]
        doc.parent_icon = "GDL PMS"
        doc.app = "gdl_pms"
        doc.icon = item["icon"]
        doc.hidden = 0
        doc.roles = []
        for r in item["roles"]:
            if frappe.db.exists("Role", r):
                doc.append("roles", {"role": r})
        doc.save(ignore_permissions=True)
