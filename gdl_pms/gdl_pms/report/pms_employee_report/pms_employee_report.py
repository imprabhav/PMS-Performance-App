import frappe

def execute(filters=None):
    columns = [
        {"fieldname": "description", "label": "Target Description", "fieldtype": "Data", "width": 300},
        {"fieldname": "weight", "label": "Weight", "fieldtype": "Float", "width": 100},
        {"fieldname": "self_score", "label": "Self Score", "fieldtype": "Float", "width": 100},
        {"fieldname": "supervisor_score", "label": "Supervisor Score", "fieldtype": "Float", "width": 120},
        {"fieldname": "reviewer_score", "label": "Reviewer Score", "fieldtype": "Float", "width": 120}
    ]
    
    filters = filters or {}
    conditions = ["1=1"]
    values = {}
    
    if filters.get("employee"):
        conditions.append("a.employee = %(employee)s")
        values["employee"] = filters.get("employee")
    if filters.get("cycle"):
        conditions.append("a.cycle = %(cycle)s")
        values["cycle"] = filters.get("cycle")
        
    where_clause = " AND ".join(conditions)
    
    query = f"""
        SELECT 
            COALESCE(NULLIF(t.target_description, ''), t.description, '') AS description,
            t.weight,
            t.self_score,
            t.supervisor_score,
            t.reviewer_score
        FROM `tabPMS Target` t
        LEFT JOIN `tabPMS Appraisal` a ON t.parent = a.name
        WHERE {where_clause}
        ORDER BY t.idx ASC
    """
    
    data = frappe.db.sql(query, values=values, as_dict=True)
    return columns, data

