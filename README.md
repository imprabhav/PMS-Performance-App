# GDL Performance Management System (GDL PMS)

An enterprise-grade, end-to-end **Performance Management System (PMS)** custom application built for **Frappe Framework & ERPNext (v15 / v16)**.

---

## 📋 Overview

**GDL PMS** digitalizes the complete employee appraisal lifecycle. It provides multi-tiered goal planning, mid-cycle amendments, competency evaluations mapped to grade groups, dispute redressal (PERC), automated history tracking on Employee profiles, and dedicated dashboards for all organizational roles.

---

## ✨ Key Features

1. **Performance Planning & Multi-Tier Approvals**
   - Subordinates define annual/probation targets with assigned weightages.
   - Dynamic weight validation based on Grade Groups (e.g., PS_CS: 60% Work / 40% Competencies; OS_ESP: 50% Work / 50% Competencies).
   - Structured agreement declarations (*Initial Proposed*, *Agreed*, *Disagreed*).
   - Formal approval sequence: **Employee ➔ Supervisor ➔ Reviewer**.
   - Return-with-modifications loop with full diff tracking and revision comments.

2. **Mid-Cycle Plan Amendments**
   - Controlled amendment windows opened and closed by HR Administration.
   - Side-by-side snapshot comparison of Original Approved Targets vs. Revised Targets.
   - Audit trail capturing reviewer and supervisor modification logs.

3. **Performance Monitoring & Evaluation Phase**
   - Self-Appraisal scoring with document evidence uploads.
   - Supervisor evaluation with target-level reviews.
   - Employee review stage: Accept scores or raise an escalated dispute.
   - Reviewer final evaluation and score calibration.

4. **Dispute & Grievance Redressal (PERC)**
   - Built-in **PERC Case** workflow for handling evaluation disputes.
   - Committee member management and final binding dispute resolution.

5. **Employee Master Integration (PMS Evaluation History)**
   - Automatically synchronizes finalized and locked appraisal ratings into the standard **Employee Master** under a dedicated **"PMS Evaluations"** tab.
   - Preserves permanent historical performance logs (Year, Cycle, Evaluation Period, Overall Score, Rating Band, Approvers, and Comments).

6. **Cycle Management (Annual & Probation)**
   - Configurable **Annual** and **Probation** appraisal cycles.
   - Automatic generation of draft performance plans for applicable employees based on joining dates or grade group filters.

7. **Role-Based Workspaces & Navigation**
   - Tailored Desk Workspaces and Dashboards for:
     - **HR Admin**: Cycle management, plan activation, amendment windows, reports, and analytics.
     - **Supervisor**: Team performance tracking, target approvals, and evaluation scoring.
     - **Reviewer**: High-level review, calibration, and final approvals.
     - **Employee**: Target submission, self-appraisal, and dispute requests.

---

## 🛠 Prerequisites

Ensure your environment meets the following requirements before installing:

- **Frappe Framework**: `version-15` or `version-16`
- **ERPNext**: `version-15` or `version-16`
- **Python**: `>= 3.10`
- **Node.js**: `>= 18` & `Yarn`
- **MariaDB**: `>= 10.6` or **PostgreSQL**: `>= 14`

---

## 🚀 Installation Guide

Run the following commands from your bench directory:

### 1. Get the Application
```bash
cd /path/to/frappe-bench
bench get-app https://github.com/imprabhav/PMS-Performance-App.git
```

### 2. Install App to Your Site
```bash
bench --site <your-site-name> install-app gdl_pms
```

### 3. Run Migrations
```bash
bench --site <your-site-name> migrate
```

### 4. Build Frontend Assets
```bash
bench build --app gdl_pms
```

### 5. Clear Cache
```bash
bench --site <your-site-name> clear-cache
```

---

## 🔄 Automated Migrations & Patches

The application includes automated patches executed during `bench migrate`:

1. **`gdl_pms.patches.v1_0.setup_pms_permissions_and_fields`**:
   - **Creates PMS Roles**: `HR Admin`, `Supervisor`, `Supervisor 2`, `Reviewer`, `Employee`.
   - **Adds Custom Fields to Employee**:
     - `grade_group` (Link to `PMS Grade Group`)
     - `employment_type` (Select: *Full time employee*, *Contract*, *Probation*)
     - `reviewer` (Link to `Employee`)
     - `supervisor_2` (Link to `Employee`)
   - **Sets Permissions**: Configures default read/write access for pages, doctypes, and property setters.
   - **Configures Print Formats**: Installs standard PMS appraisal print formats.

2. **`gdl_pms.patches.v1_0.add_employee_pms_evaluation_field`**:
   - Adds the dedicated **"PMS Evaluations"** tab break, section break, and table field (`pms_evaluations`) to the standard `Employee` doctype.

---

## ⚙️ Initial Setup & Configuration (Post-Install)

Follow these steps to configure your PMS system after installation:

### Step 1: Configure Grade Groups
Navigate to **GDL PMS > PMS Grade Group** and define your organization's grade groups along with target vs. competency weight ratios (e.g., `PS_CS` with 60% Work / 40% Competencies; `OS_ESP` with 50% Work / 50% Competencies).

### Step 2: Setup Core Competencies
Go to **GDL PMS > Manage Competencies** and define organization competencies, definitions, and default weight distributions for each grade group.

### Step 3: Update Employee Master Records
In **HR > Employee**, ensure each employee has the following fields populated:
- **Reports To** (Supervisor)
- **Reviewer**
- **Grade Group**
- **Employee Type** (*Full time employee* / *Contract* / *Probation*)
- **Date of Joining**

### Step 4: Create & Activate Your First Appraisal Cycle
Navigate to **GDL PMS > PMS Cycle (PMS Appraisal Cycle)**:
1. Select Cycle Type (**Annual** or **Probation**).
2. Choose Calendar Year and Dates.
3. Click **Save & Activate Cycle**.
4. Applicable performance plans will automatically be initialized in Draft mode for all eligible employees.

---

## ⏱ Background Scheduled Tasks

GDL PMS registers background jobs via `hooks.py`:
- **Daily Reminders**: Sends automated notifications to employees, supervisors, and reviewers for pending actions.
- **Cycle Transitions**: Automated daily checks at `06:00` for cycle state milestones.

---

## 📄 License

This project is licensed under the [MIT License](license.txt).
