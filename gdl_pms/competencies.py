import frappe
from frappe.utils import flt

GRADE_GROUP_COMPETENCIES = {
    "PS_CS": [
        {
            "competency": "Leadership",
            "weight": 8.0,
            "definition": "a. Demonstrates a broad business perspective.\nb. Demonstrates emotional intelligence.\nc. Manages change and shows adaptability."
        },
        {
            "competency": "Strategic Skills",
            "weight": 8.0,
            "definition": "a. Demonstrates knowledge of finance and ICT skills.\nb. Actively demonstrates skills of planning, resource management, decision making and risk management.\nc. Able to motivate, engage and drive performance."
        },
        {
            "competency": "Communication/ Interpersonal Skills",
            "weight": 8.0,
            "definition": "a. Communicates effectively and professionally.\nb. Maintains high rapport with Stakeholders.\nc. Demonstrates skills of effective negotiation"
        },
        {
            "competency": "People Management and Development",
            "weight": 8.0,
            "definition": "a. Champions development of capabilities of the team members.\nb. Engages in coaching and mentoring team members.\nc. Maintains harmonious and productive work-relationship."
        },
        {
            "competency": "Integrity/ Accountability",
            "weight": 8.0,
            "definition": "a. Adheres to codes of conduct and ethical principles.\nb. Reliable, transparent, and trustworthy.\nc. Takes responsibility and accountability for their work and behavior."
        }
    ],
    "OS_ESP": [
        {
            "competency": "Communication/ Interpersonal Relationship",
            "weight": 10.0,
            "definition": "a. Courteous and respectful to colleagues and customers\nb. Always maintains impeccable appearance and hygiene\nc. Establishes wide network of positive and productive working relationship"
        },
        {
            "competency": "Integrity and Ethical Conduct",
            "weight": 10.0,
            "definition": "a. Shows honesty and truthfulness\nb. Adheres to codes of conduct and ethical principles\nc. Reliable, transparent, and trustworthy"
        },
        {
            "competency": "Adaptability",
            "weight": 10.0,
            "definition": "a. Responsive and adaptive to change and new information/idea\nb. Deals with uncertain and unforeseen situation.\nc. Participates in organizational ad-hoc events and activities"
        },
        {
            "competency": "Knowledge of work",
            "weight": 10.0,
            "definition": "a. Produce error free outputs/quality of work output\nb. Uses available resources efficiently and skills to complete assigned tasks\nc. Complies to SOPs and occupational safety measures"
        },
        {
            "competency": "Work Habits",
            "weight": 10.0,
            "definition": "a. Exhibits punctuality\nb. Takes ownership of company resources\nc. Participates in team activities"
        }
    ]
}

def get_competencies_for_grade_group(grade_group="OS_ESP"):
    if not grade_group:
        grade_group = "OS_ESP"

    # 1. First check PMS Grade Group master
    try:
        if frappe.db and frappe.db.exists("PMS Grade Group", grade_group):
            doc = frappe.get_doc("PMS Grade Group", grade_group)
            if doc.competencies and len(doc.competencies) > 0:
                return [
                    {
                        "competency": c.competency.strip() if c.competency else "",
                        "weight": flt(c.weight, 2),
                        "definition": c.definition or ""
                    }
                    for c in doc.competencies
                ]
    except Exception:
        pass

    # 2. Check legacy PMS Manage Competencies single
    try:
        if frappe.db and frappe.db.exists("DocType", "PMS Manage Competencies"):
            doc = frappe.get_cached_doc("PMS Manage Competencies")
            field = "ps_competencies" if grade_group == "PS_CS" else "os_competencies"
            comps = getattr(doc, field, None)
            if comps and len(comps) > 0:
                return [
                    {
                        "competency": c.competency.strip() if c.competency else "",
                        "weight": flt(c.weight, 2),
                        "definition": c.definition or ""
                    }
                    for c in comps
                ]
    except Exception:
        pass

    # 3. Fallback to hardcoded constants
    if grade_group not in GRADE_GROUP_COMPETENCIES:
        grade_group = "OS_ESP"
    return GRADE_GROUP_COMPETENCIES[grade_group]

def get_grade_group_weights(grade_group="OS_ESP"):
    if not grade_group:
        grade_group = "OS_ESP"

    # 1. First check PMS Grade Group master
    try:
        if frappe.db and frappe.db.exists("PMS Grade Group", grade_group):
            doc = frappe.db.get_value("PMS Grade Group", grade_group, ["target_weight", "competency_weight"], as_dict=True)
            if doc and doc.target_weight is not None and doc.competency_weight is not None:
                return {"work": flt(doc.target_weight, 2), "competency": flt(doc.competency_weight, 2)}
    except Exception:
        pass

    # 2. Check legacy PMS Manage Competencies single
    try:
        if frappe.db and frappe.db.exists("DocType", "PMS Manage Competencies"):
            doc = frappe.get_cached_doc("PMS Manage Competencies")
            if grade_group == "PS_CS":
                tw = flt(doc.ps_target_weight, 2)
                cw = flt(doc.ps_competency_weight, 2)
                if tw and cw:
                    return {"work": tw, "competency": cw}
            else:
                tw = flt(doc.os_target_weight, 2)
                cw = flt(doc.os_competency_weight, 2)
                if tw and cw:
                    return {"work": tw, "competency": cw}
    except Exception:
        pass

    return {"work": 60.0 if grade_group == "PS_CS" else 50.0, "competency": 40.0 if grade_group == "PS_CS" else 50.0}

@frappe.whitelist()
def get_default_competencies(grade_group="OS_ESP"):
    return get_competencies_for_grade_group(grade_group)

@frappe.whitelist()
def get_all_competencies_and_weights():
    res = {
        "competencies": {},
        "weights": {}
    }
    # Fetch from all configured Grade Groups
    try:
        if frappe.db and frappe.db.exists("DocType", "PMS Grade Group"):
            grade_groups = frappe.get_all("PMS Grade Group", fields=["name"])
            for gg in grade_groups:
                res["competencies"][gg.name] = get_competencies_for_grade_group(gg.name)
                res["weights"][gg.name] = get_grade_group_weights(gg.name)
    except Exception:
        pass

    # Ensure PS_CS and OS_ESP exist in response
    if "PS_CS" not in res["weights"]:
        res["competencies"]["PS_CS"] = get_competencies_for_grade_group("PS_CS")
        res["weights"]["PS_CS"] = get_grade_group_weights("PS_CS")
    if "OS_ESP" not in res["weights"]:
        res["competencies"]["OS_ESP"] = get_competencies_for_grade_group("OS_ESP")
        res["weights"]["OS_ESP"] = get_grade_group_weights("OS_ESP")

    return res

def seed_default_grade_groups():
    if not frappe.db.exists("DocType", "PMS Grade Group"):
        return

    # 1. PS_CS
    if not frappe.db.exists("PMS Grade Group", "PS_CS"):
        doc = frappe.get_doc({
            "doctype": "PMS Grade Group",
            "grade_group_name": "PS_CS",
            "description": "Professional Staff / Corporate Services",
            "target_weight": 60.0,
            "competency_weight": 40.0,
            "competencies": [
                {
                    "competency": c["competency"],
                    "definition": c["definition"],
                    "weight": c["weight"]
                }
                for c in GRADE_GROUP_COMPETENCIES["PS_CS"]
            ]
        })
        doc.insert(ignore_permissions=True)

    # 2. OS_ESP
    if not frappe.db.exists("PMS Grade Group", "OS_ESP"):
        doc = frappe.get_doc({
            "doctype": "PMS Grade Group",
            "grade_group_name": "OS_ESP",
            "description": "Operating Staff / Essential Services",
            "target_weight": 50.0,
            "competency_weight": 50.0,
            "competencies": [
                {
                    "competency": c["competency"],
                    "definition": c["definition"],
                    "weight": c["weight"]
                }
                for c in GRADE_GROUP_COMPETENCIES["OS_ESP"]
            ]
        })
        doc.insert(ignore_permissions=True)

    frappe.db.commit()

@frappe.whitelist()
def populate_manage_competencies_doc():
    if not frappe.db.exists("DocType", "PMS Manage Competencies"):
        return
    doc = frappe.get_single("PMS Manage Competencies")
    modified = False

    if not doc.os_target_weight:
        doc.os_target_weight = 50.0
        modified = True
    if not doc.os_competency_weight:
        doc.os_competency_weight = 50.0
        modified = True
    if not doc.ps_target_weight:
        doc.ps_target_weight = 60.0
        modified = True
    if not doc.ps_competency_weight:
        doc.ps_competency_weight = 40.0
        modified = True

    if not doc.os_competencies or len(doc.os_competencies) == 0:
        doc.set("os_competencies", [])
        for item in GRADE_GROUP_COMPETENCIES["OS_ESP"]:
            doc.append("os_competencies", {
                "competency": item["competency"],
                "definition": item["definition"],
                "weight": item["weight"]
            })
        modified = True

    if not doc.ps_competencies or len(doc.ps_competencies) == 0:
        doc.set("ps_competencies", [])
        for item in GRADE_GROUP_COMPETENCIES["PS_CS"]:
            doc.append("ps_competencies", {
                "competency": item["competency"],
                "definition": item["definition"],
                "weight": item["weight"]
            })
        modified = True

    if modified:
        doc.flags.ignore_permissions = True
        doc.save()
        frappe.db.commit()
    return doc

@frappe.whitelist()
def reset_manage_competencies_doc():
    if not frappe.db.exists("DocType", "PMS Manage Competencies"):
        return
    doc = frappe.get_single("PMS Manage Competencies")
    doc.os_target_weight = 50.0
    doc.os_competency_weight = 50.0
    doc.ps_target_weight = 60.0
    doc.ps_competency_weight = 40.0

    doc.set("os_competencies", [])
    for item in GRADE_GROUP_COMPETENCIES["OS_ESP"]:
        doc.append("os_competencies", {
            "competency": item["competency"],
            "definition": item["definition"],
            "weight": item["weight"]
        })

    doc.set("ps_competencies", [])
    for item in GRADE_GROUP_COMPETENCIES["PS_CS"]:
        doc.append("ps_competencies", {
            "competency": item["competency"],
            "definition": item["definition"],
            "weight": item["weight"]
        })

    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return doc

@frappe.whitelist()
def setup_grade_group_feature():
    # 1. Reload PMS Grade Group doctype
    frappe.reload_doc("gdl_pms", "doctype", "pms_grade_group")

    # 2. Seed PS_CS and OS_ESP
    seed_default_grade_groups()

    # 3. Update Employee.grade_group Custom Field
    if frappe.db.exists("Custom Field", {"dt": "Employee", "fieldname": "grade_group"}):
        cf_name = frappe.db.get_value("Custom Field", {"dt": "Employee", "fieldname": "grade_group"})
        frappe.db.set_value("Custom Field", cf_name, {
            "fieldtype": "Link",
            "options": "PMS Grade Group"
        }, update_modified=False)
    else:
        from frappe.custom.doctype.custom_field.custom_field import create_custom_field
        create_custom_field("Employee", {
            "fieldname": "grade_group",
            "label": "Grade Group",
            "fieldtype": "Link",
            "options": "PMS Grade Group",
            "insert_after": "department",
            "reqd": 1,
            "in_list_view": 1
        })

    frappe.clear_cache(doctype="Employee")
    frappe.clear_cache()
    frappe.db.commit()
    return "SUCCESS"
