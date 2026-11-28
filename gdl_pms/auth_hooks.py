import frappe

PMS_ROLE_ROUTES = [
    ("PMS HR Admin", "desk/pms-hr", "PMS HR"),
    ("PMS Reviewer", "desk/pms-reviewer", "PMS Reviewer"),
    ("PMS Supervisor 2", "desk/pms-supervisor-2", "PMS Supervisor 2"),
    ("PMS Supervisor", "desk/pms-supervisor", "PMS Supervisor"),
    ("PMS PERC", "desk/pms-perc", "PMS PERC"),
    ("PMS Employee", "desk/pms-employee", "PMS Employee"),
]

PMS_ALLOWED_WORKSPACES = {
    "PMS HR Admin": ["PMS HR", "PMS Employee", "PMS Supervisor", "PMS Supervisor 2", "PMS Reviewer"],
    "PMS Reviewer": ["PMS Reviewer", "PMS Employee"],
    "PMS Supervisor 2": ["PMS Supervisor 2", "PMS Employee"],
    "PMS Supervisor": ["PMS Supervisor", "PMS Employee"],
    "PMS PERC": ["PMS PERC"],
    "PMS Employee": ["PMS Employee"],
}

PMS_ROLES_SET = {"PMS HR Admin", "PMS Employee", "PMS Supervisor", "PMS Supervisor 2", "PMS Reviewer", "PMS PERC"}

def get_user_pms_info(user=None):
    if not user:
        user = frappe.session.user
    if not user or user in ("Guest", "Administrator"):
        return None

    roles = set(frappe.get_roles(user))
    
    # Do not restrict Administrator
    if "Administrator" in roles:
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
    Hides GDL PMS from Desk completely for users without any dedicated PMS role.
    """
    try:
        user = frappe.session.user
        roles = set(frappe.get_roles(user)) if user and user != "Guest" else set()
        has_pms_access = (user == "Administrator") or bool(roles & PMS_ROLES_SET)

        if not has_pms_access:
            if "app_data" in bootinfo and isinstance(bootinfo["app_data"], list):
                bootinfo["app_data"] = [
                    a for a in bootinfo["app_data"]
                    if not (isinstance(a, dict) and a.get("app_name") == "gdl_pms")
                ]
            if "desktop_icons" in bootinfo and isinstance(bootinfo["desktop_icons"], list):
                pms_icon_names = {
                    "GDL PMS", "PMS HR Dashboard", "PMS Employee Dashboard",
                    "PMS Supervisor Dashboard", "PMS Supervisor 2 Dashboard",
                    "PMS Reviewer Dashboard", "PMS HR", "PMS Employee",
                    "PMS Supervisor", "PMS Supervisor 2", "PMS Reviewer", "PMS PERC",
                }
                bootinfo["desktop_icons"] = [
                    d for d in bootinfo["desktop_icons"]
                    if not (isinstance(d, dict) and (
                        d.get("app") == "gdl_pms"
                        or d.get("name") in pms_icon_names
                        or d.get("label") in pms_icon_names
                    ))
                ]
            if "module_sidebars" in bootinfo and isinstance(bootinfo["module_sidebars"], dict):
                bootinfo["module_sidebars"].pop("GDL PMS", None)
            return

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

        # Frappe 16.56+ uses module_sidebars instead of workspace_sidebar_item.
        # Build GDL PMS module_sidebars entry from gdl_pms.json while respecting user permissions.
        if "module_sidebars" in bootinfo and isinstance(bootinfo["module_sidebars"], dict) and "GDL PMS" in bootinfo["module_sidebars"]:
            _sync_gdl_pms_module_sidebar(bootinfo["module_sidebars"]["GDL PMS"])

        # Hide duplicate standalone PMS * Dashboard icons on Desktop so only GDL PMS folder appears
        # and point GDL PMS Desktop Icon / app_data directly to the user's role dashboard
        user_pms = get_user_pms_info()
        user_pms_route = "/" + user_pms["route"] if user_pms else "/desk/pms-hr"

        if "app_data" in bootinfo and isinstance(bootinfo["app_data"], list):
            for app_entry in bootinfo["app_data"]:
                if isinstance(app_entry, dict) and app_entry.get("app_name") == "gdl_pms":
                    app_entry["app_route"] = user_pms_route

        if "desktop_icons" in bootinfo and isinstance(bootinfo["desktop_icons"], list):
            duplicate_pms_icons = {
                "PMS HR Dashboard",
                "PMS Employee Dashboard",
                "PMS Supervisor Dashboard",
                "PMS Supervisor 2 Dashboard",
                "PMS Reviewer Dashboard",
            }
            filtered_icons = []
            for d in bootinfo["desktop_icons"]:
                if d.get("name") in duplicate_pms_icons or d.get("label") in duplicate_pms_icons:
                    continue
                if d.get("name") == "GDL PMS" or d.get("label") == "GDL PMS":
                    d["link"] = user_pms_route
                filtered_icons.append(d)
            bootinfo["desktop_icons"] = filtered_icons
    except Exception as e:
        frappe.log_error(f"Error in GDL PMS boot_session: {str(e)}")

def _sync_gdl_pms_module_sidebar(sidebar_entry):
    """Align Frappe 16.56+ module_sidebars['GDL PMS'] with workspace_sidebar/gdl_pms.json."""
    import json
    import os

    json_path = frappe.get_app_path("gdl_pms", "workspace_sidebar", "gdl_pms.json")
    if not os.path.exists(json_path):
        return

    with open(json_path, "r") as f:
        data = json.load(f)

    existing_items = sidebar_entry.get("items") or []
    allowed_workspaces = {
        it.get("link_to") for it in existing_items
        if it.get("link_type") == "Workspace" and it.get("link_to")
    }
    allowed_reports = {
        it.get("link_to") for it in existing_items
        if it.get("link_type") == "Report" and it.get("link_to")
    }

    new_items = []
    pending_section = None

    for it in data.get("items") or []:
        itype = it.get("type") or "Link"
        link_type = it.get("link_type") or ""
        link_to = it.get("link_to") or ""
        label = it.get("label") or ""

        if itype == "Section Break":
            pending_section = it
            continue

        if link_type == "Workspace" and link_to not in allowed_workspaces:
            continue
        if link_type == "DocType" and link_to and not frappe.has_permission(link_to, "read"):
            continue
        if link_type == "Report" and link_to not in allowed_reports:
            continue

        if pending_section:
            new_items.append({
                "key": f"Section Break|{pending_section.get('link_type', '')}||{pending_section.get('label', '')}",
                "label": pending_section.get("label"),
                "link_to": pending_section.get("link_to"),
                "link_type": pending_section.get("link_type"),
                "type": "Section Break",
                "icon": pending_section.get("icon"),
                "child": pending_section.get("child"),
                "collapsible": pending_section.get("collapsible"),
                "indent": pending_section.get("indent"),
                "keep_closed": pending_section.get("keep_closed"),
                "url": pending_section.get("url"),
                "show_arrow": pending_section.get("show_arrow"),
                "filters": pending_section.get("filters"),
                "route_options": pending_section.get("route_options"),
                "tab": None,
                "open_in_new_tab": None,
                "is_default_module": None,
            })
            pending_section = None

        new_items.append({
            "key": f"{itype}|{link_type}|{link_to}||{label}",
            "label": label,
            "link_to": link_to,
            "link_type": link_type,
            "type": itype,
            "icon": it.get("icon"),
            "child": it.get("child"),
            "collapsible": it.get("collapsible"),
            "indent": it.get("indent"),
            "keep_closed": it.get("keep_closed"),
            "url": it.get("url"),
            "show_arrow": it.get("show_arrow"),
            "filters": it.get("filters"),
            "route_options": it.get("route_options"),
            "tab": None,
            "open_in_new_tab": None,
            "is_default_module": None,
        })

    if new_items:
        sidebar_entry["header_icon"] = data.get("header_icon", "layers")
        sidebar_entry["items"] = new_items


def set_user_default_workspace(doc, method=None):
    """
    Safe fallback: does not overwrite user's existing default workspace.
    """
    pass
