import frappe

PMS_ROLE_ROUTES = [
    ("HR Admin", "desk/pms-hr", "PMS HR"),
    ("Reviewer", "desk/pms-reviewer", "PMS Reviewer"),
    ("Supervisor 2", "desk/pms-supervisor-2", "PMS Supervisor 2"),
    ("Supervisor", "desk/pms-supervisor", "PMS Supervisor"),
    ("Employee", "desk/pms-employee", "PMS Employee"),
]

PMS_ALLOWED_WORKSPACES = {
    "HR Admin": ["PMS HR"],
    "Reviewer": ["PMS Reviewer", "PMS Employee"],
    "Supervisor 2": ["PMS Supervisor 2", "PMS Employee"],
    "Supervisor": ["PMS Supervisor", "PMS Employee"],
    "Employee": ["PMS Employee"],
}

def get_user_pms_info(user=None):
    if not user:
        user = frappe.session.user
    if not user or user in ("Guest", "Administrator"):
        return None

    roles = set(frappe.get_roles(user))
    
    # Do not restrict System Managers or Administrators
    if "System Manager" in roles or "Administrator" in roles:
        return None

    for role, route, ws_name in PMS_ROLE_ROUTES:
        if role in roles:
            return {
                "primary_role": role,
                "route": route,
                "slug": route.replace("desk/", "").replace("app/", ""),
                "workspace": ws_name,
                "roles": roles
            }
    return None

def on_session_creation(login_manager):
    """
    Safe login hook: does not force PMS redirect so multi-app users land on Desk / All Apps.
    """
    pass

def boot_session(bootinfo):
    """
    Enriches bootinfo with PMS competencies data.
    Ensures PMS workspaces use the dedicated GDL PMS sidebar while
    preserving all standard ERPNext, HRMS, and custom app desktop icons and workspaces.
    """
    try:
        from gdl_pms.competencies import get_all_competencies_and_weights
        bootinfo["pms_competencies_data"] = get_all_competencies_and_weights()
    except Exception:
        pass

    try:
        # Ensure PMS workspaces display the rich GDL PMS sidebar with full tabs and icons
        if "workspace_sidebar_item" in bootinfo and isinstance(bootinfo["workspace_sidebar_item"], dict):
            gdl_pms_sidebar = bootinfo["workspace_sidebar_item"].get("gdl pms")
            if gdl_pms_sidebar:
                for ws in [
                    "pms hr", "pms-hr",
                    "pms employee", "pms-employee",
                    "pms supervisor", "pms-supervisor",
                    "pms reviewer", "pms-reviewer",
                    "pms supervisor 2", "pms-supervisor-2",
                    "pms perc", "pms-perc"
                ]:
                    bootinfo["workspace_sidebar_item"][ws] = gdl_pms_sidebar

        # Hide duplicate standalone PMS * Dashboard icons on Desktop so only GDL PMS folder appears
        if "desktop_icons" in bootinfo and isinstance(bootinfo["desktop_icons"], list):
            duplicate_pms_icons = {
                "PMS HR Dashboard",
                "PMS Employee Dashboard",
                "PMS Supervisor Dashboard",
                "PMS Supervisor 2 Dashboard",
                "PMS Reviewer Dashboard",
            }
            bootinfo["desktop_icons"] = [
                d for d in bootinfo["desktop_icons"]
                if d.get("name") not in duplicate_pms_icons and d.get("label") not in duplicate_pms_icons
            ]
    except Exception as e:
        frappe.log_error(f"Error in GDL PMS boot_session: {str(e)}")

def set_user_default_workspace(doc, method=None):
    """
    Safe fallback: does not overwrite user's existing default workspace.
    """
    pass
