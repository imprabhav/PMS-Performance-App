(function () {
    if (typeof window === 'undefined' || !window.frappe) return;

    var PMS_DASHBOARD_ROUTES = ['pms-hr', 'pms-reviewer', 'pms-supervisor-2', 'pms-supervisor', 'pms-employee'];

    function get_pms_target_route() {
        if (!window.frappe || !frappe.session || !frappe.session.user || frappe.session.user === 'Guest') {
            return null;
        }

        var roles = frappe.user_roles || (frappe.boot && frappe.boot.user && frappe.boot.user.roles) || [];

        // 1. HR Admin / HR Manager -> HR Dashboard
        if (roles.indexOf('HR Admin') !== -1 || roles.indexOf('HR Manager') !== -1 || roles.indexOf('PMS HR') !== -1) {
            return 'pms-hr';
        }

        // 2. Reviewer -> Reviewer Dashboard
        if (roles.indexOf('Reviewer') !== -1 || roles.indexOf('PMS Reviewer') !== -1) {
            return 'pms-reviewer';
        }

        // 3. Supervisor 2 -> Supervisor 2 Dashboard
        if (roles.indexOf('Supervisor 2') !== -1) {
            return 'pms-supervisor-2';
        }

        // 4. Supervisor -> Supervisor Dashboard
        if (roles.indexOf('Supervisor') !== -1) {
            return 'pms-supervisor';
        }

        // 5. Employee -> Employee Dashboard
        if (roles.indexOf('Employee') !== -1 || roles.indexOf('PMS Employee') !== -1) {
            return 'pms-employee';
        }

        // 6. Admin / System Manager: do NOT force a redirect away from Desktop view / App Grid or admin views
        if (roles.indexOf('Administrator') !== -1 || roles.indexOf('System Manager') !== -1) {
            return null;
        }

        return null;
    }

    function get_allowed_pms_routes() {
        if (!window.frappe || !frappe.session || !frappe.session.user || frappe.session.user === 'Guest') {
            return [];
        }

        var roles = frappe.user_roles || (frappe.boot && frappe.boot.user && frappe.boot.user.roles) || [];

        // Administrator and System Manager have access to all dashboards
        if (roles.indexOf('Administrator') !== -1 || roles.indexOf('System Manager') !== -1) {
            return PMS_DASHBOARD_ROUTES.slice();
        }

        var is_hr = (roles.indexOf('HR Admin') !== -1 || roles.indexOf('HR Manager') !== -1 || roles.indexOf('PMS HR') !== -1);

        var allowed = [];
        if (is_hr) {
            allowed.push('pms-hr');
        }
        if (roles.indexOf('Reviewer') !== -1 || roles.indexOf('PMS Reviewer') !== -1) {
            allowed.push('pms-reviewer');
        }
        if (roles.indexOf('Supervisor 2') !== -1) {
            allowed.push('pms-supervisor-2');
        }
        if (roles.indexOf('Supervisor') !== -1) {
            allowed.push('pms-supervisor');
        }
        // Supervisors, Reviewers, and Monitoring Supervisors (Supervisor 2) are also Employees in PMS,
        // so PMS Employee page is always accessible for them in addition to their supervisory dashboards.
        // HR Admin specifically does not see or access PMS Employee.
        if (!is_hr) {
            if (roles.indexOf('Employee') !== -1 || roles.indexOf('PMS Employee') !== -1 ||
                roles.indexOf('Supervisor') !== -1 || roles.indexOf('Supervisor 2') !== -1 ||
                roles.indexOf('Reviewer') !== -1 || roles.indexOf('PMS Reviewer') !== -1) {
                if (allowed.indexOf('pms-employee') === -1) {
                    allowed.push('pms-employee');
                }
            }
        }
        return allowed;
    }

    function remove_sidebar_item(name, link_to) {
        var selectors = [
            '.sidebar-item-container[data-public-name="' + name + '"]',
            '.sidebar-item-container[item-name="' + name + '"]',
            '.sidebar-item-container[title="' + name + '"]'
        ];
        if (link_to) {
            selectors.push('.sidebar-item-container[data-link-to="' + link_to + '"]');
        }
        $(selectors.join(', ')).remove();
    }

    function hide_pms_employee_for_hr() {
        var roles = frappe.user_roles || (frappe.boot && frappe.boot.user && frappe.boot.user.roles) || [];
        var is_administrator = (frappe.session && frappe.session.user === 'Administrator') || roles.indexOf('Administrator') !== -1;
        var is_admin = is_administrator || roles.indexOf('System Manager') !== -1;
        var is_hr = (roles.indexOf('HR Admin') !== -1 || roles.indexOf('HR Manager') !== -1 || roles.indexOf('PMS HR') !== -1);
        if ((is_hr || is_admin) && !is_administrator) {
            remove_sidebar_item('PMS Employee', 'PMS Employee');
        }
        if (is_admin && !is_administrator) {
            if (roles.indexOf('Supervisor') === -1 && roles.indexOf('PMS Supervisor') === -1) {
                remove_sidebar_item('PMS Supervisor', 'PMS Supervisor');
            }
            if (roles.indexOf('Reviewer') === -1 && roles.indexOf('PMS Reviewer') === -1) {
                remove_sidebar_item('PMS Reviewer', 'PMS Reviewer');
            }
            if (roles.indexOf('Supervisor 2') === -1 && roles.indexOf('PMS Supervisor 2') === -1) {
                remove_sidebar_item('PMS Supervisor 2', 'PMS Supervisor 2');
            }
            if (roles.indexOf('PMS PERC') === -1) {
                remove_sidebar_item('PMS PERC', 'PMS PERC');
            }
        }
        if (!is_hr && !is_admin) {
            remove_sidebar_item('Grade Groups', 'PMS Grade Group');
            remove_sidebar_item('Manage Competencies', 'PMS Manage Competencies');
        }
    }

    function is_root_desk_route(args) {
        if (!args || !args.length) return true;
        var r = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        if (!r.length) return true;
        var first = (r[0] || '').toString().toLowerCase().replace(/^\/+|\/+$/g, '');
        // Explicit requests for Desktop view / App Grid are NEVER treated as root redirect triggers
        if (first === 'desktop') return false;
        if (r.length === 2 && (first === 'desk' || first === 'app')) {
            var second = (r[1] || '').toString().toLowerCase().replace(/^\/+|\/+$/g, '');
            if (second === 'desktop') return false;
        }
        if (r.length === 1) {
            return (first === '' || first === 'desk' || first === 'app' || first === 'workspaces');
        }
        if (r.length === 2 && (first === 'desk' || first === 'app')) {
            var second = (r[1] || '').toString().toLowerCase().replace(/^\/+|\/+$/g, '');
            return (second === '');
        }
        return false;
    }

    function patch_breadcrumbs() {
        if (!window.frappe || !frappe.breadcrumbs) return;
        if (frappe.breadcrumbs._pms_home_patched) return;
        frappe.breadcrumbs._pms_home_patched = true;

        var orig_clear = frappe.breadcrumbs.clear;
        frappe.breadcrumbs.clear = function () {
            this.$breadcrumbs = $(".navbar-breadcrumbs").empty();
            // Home breadcrumb always links to /desk (All Apps screen)
            this.append_breadcrumb_element("/desk", frappe.utils.icon("home"), "pms-home-crumb");
        };
    }

    function update_existing_home_crumb() {
        var homeCrumbA = document.querySelector('.navbar-breadcrumbs li:first-child a, .navbar-breadcrumbs a.pms-home-crumb');
        if (homeCrumbA) {
            homeCrumbA.setAttribute('href', '/desk');
        }
    }

    function patch_not_found() {
        if (!window.frappe) return;
        if (frappe.show_not_found && !frappe.show_not_found._pms_patched) {
            var orig_show_not_found = frappe.show_not_found;
            frappe.show_not_found = function (name) {
                var target = get_pms_target_route();
                var name_str = (name || '').toString().toLowerCase();
                if (name_str === 'gdl-pms' || (target && (name_str.indexOf('pms-') !== -1 || name_str.indexOf('perc-') !== -1 || name_str === 'perc case'))) {
                    var dest = target || 'pms-hr';
                    console.log('[GDL PMS] Intercepted 404 for ' + name + ', redirecting to target dashboard ' + dest);
                    if (frappe.ui && frappe.ui.hide_open_dialog) frappe.ui.hide_open_dialog();
                    $('.modal:visible').modal('hide');
                    frappe.set_route(dest);
                    return;
                }
                return orig_show_not_found.apply(this, arguments);
            };
            frappe.show_not_found._pms_patched = true;
        }
    }

    function patch_router() {
        // Allow normal desk navigation without hijacking to PMS
    }

    function check_and_redirect_to_dashboard() {
        var route = (frappe.get_route && frappe.get_route()) || [];
        var first = (route[0] || '').toLowerCase();
        var second = (route[1] || '').toLowerCase();
        var pathname = (window.location.pathname || '').replace(/\/+$/, '');
        var target = get_pms_target_route();

        // Handle bare /desk/gdl-pms or /app/gdl-pms route for all users including Administrator
        if (pathname === '/desk/gdl-pms' || pathname === '/app/gdl-pms' ||
            (first === 'gdl-pms' && !second) ||
            ((first === 'desk' || first === 'app') && second === 'gdl-pms' && !route[2])) {
            var dest = target || 'pms-hr';
            if (frappe.router && frappe.router.set_route) {
                frappe.set_route(dest);
            } else {
                window.location.replace('/desk/' + dest);
            }
            return;
        }

        if (!target) return;

        patch_breadcrumbs();
        patch_router();
        patch_not_found();
        update_existing_home_crumb();

        // Never redirect away if user is viewing or navigating to desktop view / app grid / desk root
        if (first === 'desktop' || first === 'desk' || pathname === '' || pathname === '/desk' || pathname === '/app' || pathname === '/apps') {
            return;
        }

        // Determine if current route/URL is attempting to view any PMS dashboard
        var requested_slug = null;
        if (PMS_DASHBOARD_ROUTES.indexOf(first) !== -1) {
            requested_slug = first;
        } else if ((first === 'desk' || first === 'app' || first === 'workspaces') && PMS_DASHBOARD_ROUTES.indexOf(second) !== -1) {
            requested_slug = second;
        } else {
            for (var i = 0; i < PMS_DASHBOARD_ROUTES.length; i++) {
                var s = PMS_DASHBOARD_ROUTES[i];
                if (pathname === '/desk/' + s || pathname === '/app/' + s) {
                    requested_slug = s;
                    break;
                }
            }
        }

        // 2. Unauthorized dashboard protection:
        // Only redirect IF the user is visiting a dashboard they do NOT have permission for!
        if (requested_slug) {
            var allowed_routes = get_allowed_pms_routes();
            if (allowed_routes.indexOf(requested_slug) === -1) {
                console.log('[GDL PMS] Role dashboard not allowed (' + requested_slug + '), auto-redirecting to ' + target);
                if (frappe.router && frappe.router.set_route) {
                    frappe.set_route(target);
                } else {
                    window.location.replace('/desk/' + target);
                }
                return;
            }
        }
    }

    function render_app_grid_button() {
        if ($('.btn-app-grid').length) return;
        var $pageTitle = $('.page-head:visible .page-title, .page-title:visible');
        if (!$pageTitle.length) return;

        var $target = $pageTitle.find('.title-area');
        if (!$target.length) $target = $pageTitle;

        var $appGridBtn = $(
            '<button type="button" class="btn-reset btn-app-grid" title="' + __('App Grid / Desktop View') + '" ' +
            'style="display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 6px; margin-right: 6px; cursor: pointer; color: var(--text-color); vertical-align: middle;">' +
                '<svg class="icon icon-md" style="width: 18px; height: 18px; display: block;"><use href="#icon-grid-3x3"></use></svg>' +
            '</button>'
        );

        $appGridBtn.hover(
            function () { $(this).css('background-color', 'var(--bg-gray, #f0f2f5)'); },
            function () { $(this).css('background-color', 'transparent'); }
        );

        $appGridBtn.on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (window.frappe && frappe.set_route) {
                frappe.set_route('desktop');
            } else {
                window.location.href = '/desk/desktop';
            }
        });

        if ($target.hasClass('title-area')) {
            $appGridBtn.insertBefore($target.find('.navbar-breadcrumbs'));
        } else {
            $appGridBtn.prependTo($target);
        }
    }

    // Capture-phase listener to intercept home icon & desk links before ANY router handlers
    document.addEventListener('click', function (e) {
        // Do not intercept clicks on Desktop view / App Grid launcher buttons or items
        if (e.target.closest('[data-name="desktop"], .btn-app-grid, a[href*="desktop"], a[data-route="desktop"]')) {
            return;
        }

        var targetRoute = get_pms_target_route();
        if (!targetRoute) return;

        var homeEl = e.target.closest(
            '.navbar-breadcrumbs li:first-child a, ' +
            '.navbar-breadcrumbs li:first-child, ' +
            '.pms-home-crumb, ' +
            '.nav-item-home, ' +
            '[data-route="Workspaces"]'
        );

        if (homeEl) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // Home button navigates to Desk / All Apps view
            if (window.frappe && frappe.set_route) {
                frappe.set_route('desktop');
            } else {
                window.location.href = '/desk';
            }
            return false;
        }
    }, true);

    function sync_pms_sidebar_active_item(explicit_mode, skip_retry) {
        var $sidebar = $('.body-sidebar, .desk-sidebar');
        if (!$sidebar.length) return;

        var route = (frappe.get_route && frappe.get_route()) || [];
        var r0 = (route[0] || '').toString().toLowerCase();
        var r1 = (route[1] || '').toString();
        var r2 = (route[2] || '').toString().toLowerCase();
        var pathname = (window.location.pathname || '').toLowerCase();

        var activeItemName = null;

        // 1. DocType PMS Appraisal (PMS Performance Plan vs PMS Appraisal Form)
        var is_pms_appraisal = false;
        if (r1 === 'PMS Appraisal' || r1.toLowerCase() === 'pms-appraisal' ||
            r0 === 'pms-appraisal' || pathname.indexOf('/pms-appraisal') !== -1) {
            // Must not be PMS Appraisal Cycle
            if (r1 !== 'PMS Appraisal Cycle' && r1.toLowerCase() !== 'pms-appraisal-cycle' && pathname.indexOf('/pms-appraisal-cycle') === -1) {
                is_pms_appraisal = true;
            }
        }

        if (is_pms_appraisal) {
            var mode = explicit_mode;
            if (!mode && window.cur_frm && cur_frm.doctype === 'PMS Appraisal') {
                if (cur_frm._view_mode) {
                    mode = cur_frm._view_mode;
                } else if ($('body').hasClass('gdl-pms-appraisal-mode')) {
                    mode = 'appraisal';
                } else if ($('body').hasClass('gdl-pms-plan-mode')) {
                    mode = 'plan';
                }
            }
            if (!mode && window.cur_list && cur_list.doctype === 'PMS Appraisal' && cur_list._current_view_mode) {
                mode = cur_list._current_view_mode;
            }
            if (!mode && frappe.route_options && frappe.route_options.view_mode) {
                mode = frappe.route_options.view_mode;
            }
            if (!mode) {
                mode = localStorage.getItem('pms_view_mode') || 'plan';
            }

            activeItemName = (mode === 'appraisal') ? 'PMS Appraisal Form' : 'PMS Performance Plan';
        } else if (r1 === 'PMS Plan Amendment' || r1.toLowerCase() === 'pms-plan-amendment' ||
                   r0 === 'pms-plan-amendment' || pathname.indexOf('/pms-plan-amendment') !== -1) {
            activeItemName = 'PMS Plan Amendment';
        } else if (r1 === 'PMS Appraisal Cycle' || r1.toLowerCase() === 'pms-appraisal-cycle' ||
                   r0 === 'pms-appraisal-cycle' || pathname.indexOf('/pms-appraisal-cycle') !== -1 ||
                   r1 === 'PMS Calendar' || r1.toLowerCase() === 'pms-calendar' ||
                   r0 === 'pms-calendar' || pathname.indexOf('/pms-calendar') !== -1) {
            activeItemName = 'PMS Cycle';
        } else if (r1 === 'PERC Case' || r1.toLowerCase() === 'perc-case' ||
                   r0 === 'perc-case' || pathname.indexOf('/perc-case') !== -1) {
            activeItemName = 'PERC Case';
        } else if (r1 === 'PMS Grade Group' || r1.toLowerCase() === 'pms-grade-group' ||
                   r0 === 'pms-grade-group' || pathname.indexOf('/pms-grade-group') !== -1) {
            activeItemName = 'Grade Groups';
        } else if (r1 === 'PMS Manage Competencies' || r1.toLowerCase() === 'pms-manage-competencies' ||
                   r0 === 'pms-manage-competencies' || pathname.indexOf('/pms-manage-competencies') !== -1) {
            activeItemName = 'Manage Competencies';
        } else if (r0 === 'pms-employee' || r1 === 'PMS Employee' || r1.toLowerCase() === 'pms-employee' || pathname.indexOf('/pms-employee') !== -1) {
            activeItemName = 'PMS Employee';
        } else if (r0 === 'pms-supervisor-2' || r1 === 'PMS Supervisor 2' || r1.toLowerCase() === 'pms-supervisor-2' || pathname.indexOf('/pms-supervisor-2') !== -1) {
            activeItemName = 'PMS Supervisor 2';
        } else if (r0 === 'pms-supervisor' || r1 === 'PMS Supervisor' || r1.toLowerCase() === 'pms-supervisor' || pathname.indexOf('/pms-supervisor') !== -1) {
            activeItemName = 'PMS Supervisor';
        } else if (r0 === 'pms-reviewer' || r1 === 'PMS Reviewer' || r1.toLowerCase() === 'pms-reviewer' || pathname.indexOf('/pms-reviewer') !== -1) {
            activeItemName = 'PMS Reviewer';
        } else if (r0 === 'pms-perc' || r1 === 'PMS PERC' || r1.toLowerCase() === 'pms-perc' || pathname.indexOf('/pms-perc') !== -1) {
            activeItemName = 'PMS PERC';
        } else if (r0 === 'pms-hr' || r1 === 'PMS HR' || r1.toLowerCase() === 'pms-hr' || pathname.indexOf('/pms-hr') !== -1) {
            activeItemName = 'PMS HR';
        } else if (r1 === 'PMS Completion Report' || r2 === 'pms completion report' || pathname.indexOf('/pms-completion-report') !== -1) {
            activeItemName = 'PMS Completion Report';
        } else if (r1 === 'PMS Score Analysis' || r2 === 'pms score analysis' || pathname.indexOf('/pms-score-analysis') !== -1) {
            activeItemName = 'PMS Score Analysis';
        } else if (r1 === 'PMS Employee Report' || r2 === 'pms employee report' || pathname.indexOf('/pms-employee-report') !== -1) {
            activeItemName = 'PMS Employee Report';
        } else if (r1 === 'PMS Office Report' || r2 === 'pms office report' || pathname.indexOf('/pms-office-report') !== -1) {
            activeItemName = 'PMS Office Report';
        }

        if (!activeItemName) {
            // Not a recognized PMS route, but clean up duplicate active PMS items if any exist
            $sidebar.find('.sidebar-item-container[item-name="PMS Performance Plan"], .sidebar-item-container[item-name="PMS Appraisal Form"]')
                .find('.standard-sidebar-item').removeClass('active-sidebar selected');
            return;
        }

        // Clean active classes from ALL items in the sidebar so ONLY one item can be active
        $sidebar.find('.sidebar-item-container').removeClass('is-selected active-sidebar selected');
        $sidebar.find('.standard-sidebar-item').removeClass('active-sidebar is-selected selected');

        var $targetContainer = $sidebar.find(
            '.sidebar-item-container[item-name="' + activeItemName + '"], ' +
            '.sidebar-item-container[data-id="' + activeItemName + '"], ' +
            '.sidebar-item-container[data-public-name="' + activeItemName + '"], ' +
            '.sidebar-item-container[title="' + activeItemName + '"]'
        );

        if (!$targetContainer.length) {
            $targetContainer = $sidebar.find('.sidebar-item-container').filter(function () {
                return $(this).find('.sidebar-item-label').text().trim() === activeItemName;
            });
        }

        if (!$targetContainer.length && activeItemName === 'PMS Cycle') {
            $targetContainer = $sidebar.find(
                '.sidebar-item-container[item-name="PMS Appraisal Cycle"], ' +
                '.sidebar-item-container[data-id="PMS Appraisal Cycle"], ' +
                '.sidebar-item-container[title="PMS Appraisal Cycle"]'
            );
        }

        if ($targetContainer.length) {
            $targetContainer.addClass('is-selected');
            $targetContainer.find('.standard-sidebar-item').addClass('active-sidebar selected');
            if (window.frappe && frappe.app && frappe.app.sidebar) {
                frappe.app.sidebar.active_item = $targetContainer.find('.standard-sidebar-item');
            }
        }

        if (!skip_retry) {
            setTimeout(function () {
                sync_pms_sidebar_active_item(explicit_mode, true);
            }, 120);
        }
    }

    function patch_sidebar_active() {
        if (!window.frappe || !frappe.app || !frappe.app.sidebar) return;
        if (frappe.app.sidebar._pms_sync_patched) return;
        frappe.app.sidebar._pms_sync_patched = true;

        var orig_set_active = frappe.app.sidebar.set_active_workspace_item;
        frappe.app.sidebar.set_active_workspace_item = function () {
            if (orig_set_active) {
                orig_set_active.apply(this, arguments);
            }
            sync_pms_sidebar_active_item(null, true);
        };
    }

    window.sync_pms_sidebar_active_item = sync_pms_sidebar_active_item;
    window.update_pms_sidebar_highlight = sync_pms_sidebar_active_item;
    window.update_pms_sidebar_active = sync_pms_sidebar_active_item;

    // Intercept clicks on Sidebar items & shortcuts for PMS Performance Plan vs PMS Appraisal Form
    document.addEventListener('click', function (e) {
        var sidebarContainer = e.target.closest('.sidebar-item-container, .standard-sidebar-item, .shortcut-widget-box');
        if (!sidebarContainer) return;

        var itemName = sidebarContainer.getAttribute('item-name') || '';
        var text = (sidebarContainer.innerText || sidebarContainer.textContent || '').trim();

        var target_mode = null;
        if (itemName === 'PMS Appraisal Form' || text.indexOf('PMS Appraisal Form') !== -1 || text.indexOf('Appraisal Form') !== -1) {
            target_mode = 'appraisal';
        } else if (itemName === 'PMS Performance Plan' || text.indexOf('PMS Performance Plan') !== -1 || text.indexOf('Performance Plan') !== -1) {
            target_mode = 'plan';
        }

        if (!target_mode) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        localStorage.setItem('pms_view_mode', target_mode);
        if (window.frappe) {
            frappe.route_options = { view_mode: target_mode };
        }

        sync_pms_sidebar_active_item(target_mode);

        var route = (frappe.get_route && frappe.get_route()) || [];
        var r0 = (route[0] || '').toLowerCase();
        var r1 = route[1] || '';
        var r2 = (route[2] || '').toLowerCase();

        var is_list_view_route = (r0 === 'list' && (r1 === 'PMS Appraisal' || r1.toLowerCase() === 'pms appraisal' || r1.toLowerCase() === 'pms-appraisal')) ||
            (r0 === 'app' && (r1 === 'pms-appraisal' || r1 === 'PMS Appraisal') && (route.length === 2 || r2 === 'view' || r2 === 'list'));

        var active_list = (typeof cur_list !== 'undefined' && cur_list && cur_list.doctype === 'PMS Appraisal') ? cur_list :
            (window.frappe && frappe.views && frappe.views.list_view && frappe.views.list_view['PMS Appraisal']) ? frappe.views.list_view['PMS Appraisal'] : null;

        var is_list_visible = active_list && active_list.wrapper && $(active_list.wrapper).is(':visible');

        var is_actually_on_list = is_list_view_route && is_list_visible;

        if (is_actually_on_list && typeof active_list.apply_pms_view_mode === 'function') {
            active_list.apply_pms_view_mode(target_mode, true);
        } else if (window.frappe && frappe.set_route) {
            frappe.set_route('List', 'PMS Appraisal');
        } else {
            window.location.href = '/desk/pms-appraisal/view/list';
        }
        return false;
    }, true);

    // Follow-up listener on all other sidebar items to update highlight on click
    document.addEventListener('click', function (e) {
        var sidebarContainer = e.target.closest('.sidebar-item-container, .standard-sidebar-item');
        if (sidebarContainer) {
            setTimeout(function () {
                sync_pms_sidebar_active_item();
            }, 60);
            setTimeout(function () {
                sync_pms_sidebar_active_item();
            }, 250);
        }
    }, false);

    function cleanup_pms_page_modes() {
        var route = (frappe.get_route && frappe.get_route()) || [];
        var first = (route[0] || '').toLowerCase();
        var second = (route[1] || '').toLowerCase();
        var third = (route[2] || '').toLowerCase();
        var pathname = (window.location.pathname || '').toLowerCase();

        var is_pms_dashboard = (first && PMS_DASHBOARD_ROUTES.indexOf(first) !== -1) ||
            ((first === 'desk' || first === 'app' || first === 'workspaces') && PMS_DASHBOARD_ROUTES.indexOf(second) !== -1);

        var is_pms_doctype = (window.cur_frm && cur_frm.doctype && (cur_frm.doctype.indexOf('PMS') !== -1 || cur_frm.doctype.indexOf('PERC') !== -1)) ||
            (first && (first.indexOf('pms') !== -1 || first.indexOf('perc') !== -1)) ||
            (second && (second.indexOf('pms') !== -1 || second.indexOf('perc') !== -1)) ||
            (third && (third.indexOf('pms') !== -1 || third.indexOf('perc') !== -1));

        var is_pms_sidebar = (window.frappe && frappe.app && frappe.app.sidebar && frappe.app.sidebar.sidebar_title &&
            (frappe.app.sidebar.sidebar_title.toLowerCase().indexOf('pms') !== -1 || frappe.app.sidebar.sidebar_title.toLowerCase().indexOf('perc') !== -1));

        var is_pms = is_pms_dashboard || is_pms_doctype || is_pms_sidebar || (pathname.indexOf('pms') !== -1) || (pathname.indexOf('perc') !== -1);

        if (is_pms) {
            $('body').addClass('gdl-pms-active');
        } else {
            $('body').removeClass('gdl-pms-active');
        }

        if (!is_pms_dashboard) {
            $('body, .layout-main-section, .workspace-page').removeClass('gdl-pms-custom-dashboard-active gdl-pms-employee-dashboard-active gdl-pms-supervisor-dashboard-active gdl-pms-reviewer-dashboard-active gdl-pms-supervisor-2-dashboard-active gdl-pms-hr-dashboard-active');
        }

        var is_appraisal_form = (window.cur_frm && cur_frm.doctype === 'PMS Appraisal') ||
            (first === 'pms-appraisal' || first === 'pms appraisal') ||
            ((first === 'form' || first === 'app') && (second === 'pms-appraisal' || second === 'pms appraisal'));
        if (!is_appraisal_form) {
            $('body').removeClass('gdl-pms-plan-mode gdl-pms-appraisal-mode gdl-pms-self-assessment-stage gdl-pms-is-new');
        }
    }

    // Check on route changes & app initialization
    $(document).on('app_ready page-change workspace_rendered form-refresh', function () {
        hide_pms_employee_for_hr();
        cleanup_pms_page_modes();
        check_and_redirect_to_dashboard();
        patch_sidebar_active();
        sync_pms_sidebar_active_item();
        render_app_grid_button();
    });

    if (window.frappe && frappe.router) {
        frappe.router.on('change', function () {
            hide_pms_employee_for_hr();
            cleanup_pms_page_modes();
            check_and_redirect_to_dashboard();
            patch_sidebar_active();
            sync_pms_sidebar_active_item();
            render_app_grid_button();
        });
    }

    // Immediate and staggered initialization checks
    patch_breadcrumbs();
    patch_router();
    patch_not_found();
    patch_sidebar_active();
    hide_pms_employee_for_hr();
    cleanup_pms_page_modes();
    check_and_redirect_to_dashboard();
    sync_pms_sidebar_active_item();
    render_app_grid_button();
    setTimeout(function () { hide_pms_employee_for_hr(); cleanup_pms_page_modes(); check_and_redirect_to_dashboard(); patch_sidebar_active(); sync_pms_sidebar_active_item(); render_app_grid_button(); }, 100);
    setTimeout(function () { hide_pms_employee_for_hr(); cleanup_pms_page_modes(); check_and_redirect_to_dashboard(); patch_sidebar_active(); sync_pms_sidebar_active_item(); render_app_grid_button(); }, 300);
    setTimeout(function () { hide_pms_employee_for_hr(); cleanup_pms_page_modes(); check_and_redirect_to_dashboard(); patch_sidebar_active(); sync_pms_sidebar_active_item(); render_app_grid_button(); }, 800);
})();
