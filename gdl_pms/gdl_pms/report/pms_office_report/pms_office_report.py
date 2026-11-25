import frappe

def execute(filters=None):
    columns = [
        {"fieldname": "department", "label": "Office", "fieldtype": "Link", "options": "Department", "width": 200},
        {"fieldname": "avg_score", "label": "Average Total Score", "fieldtype": "Float", "width": 150},
        {"fieldname": "outstanding", "label": "Outstanding", "fieldtype": "Int", "width": 120},
        {"fieldname": "commendable", "label": "Commendable", "fieldtype": "Int", "width": 130},
        {"fieldname": "good", "label": "Good", "fieldtype": "Int", "width": 100},
        {"fieldname": "satisfactory", "label": "Satisfactory", "fieldtype": "Int", "width": 120},
        {"fieldname": "unacceptable", "label": "Unacceptable", "fieldtype": "Int", "width": 120}
    ]
    
    conditions = "1=1"
    if filters and filters.get("department"):
        conditions += f" AND e.department = '{filters.get('department')}'"
    if filters and filters.get("cycle"):
        conditions += f" AND a.cycle = '{filters.get('cycle')}'"
        
    query = f"""
        SELECT 
            e.department,
            AVG(a.total_score) as avg_score,
            SUM(CASE WHEN a.rating_band LIKE 'Outstanding%' THEN 1 ELSE 0 END) as outstanding,
            SUM(CASE WHEN a.rating_band LIKE 'Commendable%' OR a.rating_band LIKE 'Exceeds%' THEN 1 ELSE 0 END) as commendable,
            SUM(CASE WHEN a.rating_band LIKE 'Good%' OR a.rating_band LIKE 'Meets%' THEN 1 ELSE 0 END) as good,
            SUM(CASE WHEN a.rating_band LIKE 'Satisfactory%' OR a.rating_band LIKE 'Needs Improvement%' THEN 1 ELSE 0 END) as satisfactory,
            SUM(CASE WHEN a.rating_band LIKE 'Unacceptable%' OR a.rating_band LIKE 'Unsatisfactory%' THEN 1 ELSE 0 END) as unacceptable
        FROM `tabPMS Appraisal` a
        LEFT JOIN `tabEmployee` e ON a.employee = e.name
        WHERE {conditions}
        GROUP BY e.department
    """
    
    data = frappe.db.sql(query, as_dict=True)
    return columns, data
