/*
KWin Script Floating Tiles
(C) 2021-2022 Natalie Clarius <natalie_clarius@yahoo.de>
GNU General Public License v3.0
*/


///////////////////////
// configuration
///////////////////////

const config = {
    // whether to permit windows to be covered by special windows
    ignoreNonnormal: readConfig("ignoreNonnormal", true),
    ignoreShell: readConfig("ignoreSpecial", true),
    ignoreTransient: readConfig("ignoreTransient", true),
    // excluded/included applications
    excludeMode: readConfig("excludeMode", true),
    excludeForeground: readConfig("excludeForeground", false),
    excludedAppsForeground: readConfig("excludedAppsForeground", "")
        .split(",").map(s => s.toLowerCase().trim()),
    excludeBackground: readConfig("excludeBackground", false),
    excludedAppsBackground: readConfig("excludedAppsBackground", "")
        .split(",").map(s => s.toLowerCase().trim()),
    includeMode: readConfig("includeMode", false),
    includeForeground: readConfig("includeForeground", false),
    includedAppsForeground: readConfig("includedAppsForeground", "")
        .split(",").map(s => s.toLowerCase().trim()),
    includeBackground: readConfig("includeBackground", false),
    includedAppsBackground: readConfig("includedAppsBackground", "")
        .split(",").map(s => s.toLowerCase().trim())
};


///////////////////////
// initialization
///////////////////////

const debugMode = readConfig("debugMode", true);
const fullDebugMode = readConfig("fullDebugMode", false);
function debug(...args) {
    if (debugMode) { console.debug("floatingtiles:", ...args); }
}
function fulldebug(...args) {
    if (fullDebugMode) { console.debug("floatingtiles:", ...args); }
}
debug("initializing");
debug("ignore non-normal:", config.ignoreNonnormal,
    "ignore shell:", config.ignoreShell,
    "ignore transient:", config.ignoreTransient);
debug("exclude (fg, bg):", config.excludeMode,
    config.excludedAppsForeground, config.excludedAppsBackground);
debug("include (fg, bg):", config.includeMode,
    config.includedAppsForeground, config.includedAppsBackground);
debug("");


///////////////////////
// bookkeeping
///////////////////////

// keep track of added windows
var added = [];

// keep track of active windows
var active = [];

// remove other occurrences and add window to top of stack of active
function addActive(window) {
    if (!restored.includes(window)) {
        removeActive(window);
        active.unshift(window);
    }
}

// remove window from stack of active
function removeActive(window) {
    active = active.filter(entry => entry != window);
}

// keep track of transparent windows
var transparent = [];

// remove other occurrences and add window to top of stack of transparent
function addtransparent(window) {
    removetransparent(window);
    transparent.unshift(window);
}

// remove window from stack of transparent
function removetransparent(window) {
    transparent = transparent.filter(entry => entry != window);
}

// remove window from stack of to be restored
// if has been manually rather than automatically been minimized
// since it is not the most recent entry on the minimized stack
// todo doesn't work with minimize all
// function resetMinimized(window) {
//     if (transparent[0] != window) {
//         removetransparent(window);
//     }
// }

// keep track of restored windows
var restored = [];

// keep track of removed windows
var removed = false;


///////////////////////
// set up triggers
///////////////////////

// trigger translucency and restore
// when window is initially present, added or activated
workspace.clientList().forEach(onActivated);
workspace.clientAdded.connect(onActivated);
workspace.clientActivated.connect(onActivated);
function onActivated(window) {
    if (!window) return;
    debug("====================")
    debug("activated", caption(window));
    fulldebug(properties(window));
    addActive(window);
    removetransparent(window);
    minimizeOverlapping(window);
    restoreMinimized(window);
}

// add to watchlist on added and trigger minimize and restore
// when window is moved or resized or screen geometry changes
workspace.clientList().forEach(onAdded);
workspace.clientAdded.connect(onAdded);
function onAdded(window) {
    debug("====================")
    debug("added", caption(window));
    fulldebug(properties(window));
    added = [window];
    onAddedOnRegeometrized(window);
}

// trigger minimize and restore when window geometry changes
function onAddedOnRegeometrized(window) {
    [window.clientGeometryChanged,
    window.frameGeometryChanged,
    window.moveResizedChanged,
    window.fullScreenChanged,
    window.clientMaximizedStateChanged,
    window.screenChanged,
    window.desktopChanged,
    window.activitiesChanged].
        forEach(signal => signal.connect(onRegeometrized));
}
function onRegeometrized(window) {
    if (!window) return;
    debug("====================")
    debug("regeometrized", caption(window));
    fulldebug(properties(window));
    minimizeOverlapping(window);
    restoreMinimized(window);
}


// trigger minimize and restore for active window when workspace area changes
[workspace.currentDesktopChanged,
workspace.desktopPresenceChanged,
workspace.currentActivityChanged,
workspace.activitiesChanged,
workspace.numberScreensChanged,
workspace.screenResized,
workspace.virtualScreenSizeChanged,
workspace.virtualScreenGeometryChanged].
    forEach(signal => signal.connect(onRelayouted));
function onRelayouted() {
    debug("====================")
    debug("relayouted");
    onRegeometrized(workspace.activeClient);
}

// trigger minimize, restore and reactivate
// when window minimized
// workspace.clientMinimized.connect(onMinimized);
// function onMinimized(window) {
//     debug("====================")
//     debug("minimized", caption(window));
//     fulldebug(properties(window));
//     resetMinimized(window);
//     if (!transparent.includes(window)) { // manually minimized
//         removeActive(window);
//     }
//     restoreMinimized(window);
//     // reactivateRecent();
// }

// trigger minimize, restore and reactivate
// when window is closed
workspace.clientRemoved.connect(onRemoved);
function onRemoved(window) {
    debug("====================")
    debug("closed", caption(window));
    fulldebug(properties(window));
    removeActive(window);
    removetransparent(window);
    restoreMinimized(window);
    // reactivateRecent();
    removed = true;
}


///////////////////////
// minimize, restore and reactivate
///////////////////////



// minimize all windows overlapped by active window
function minimizeOverlapping(active) {
    if (!active) active = workspace.activeClient;
    debug("minimize overlapping", active.caption);
    if (!active || ignoreWindow(active) || ignoreFront(active)) return;
    fulldebug(properties(active));

    // only proceed if the window is focused
    if (active && active.active) {
        let others = workspace.clientList();
        for (let i = 0; i < others.length; i++) {
            let other = others[i];
            if (!other || ignoreWindow(other) || ignoreBack(other)) continue;
            if (ignoreOverlap(active, other)) continue;
            fulldebug(properties(other));
            if (overlap(active, other) && !other.minimized) {
                debug("  minimizing", caption(other));
                addtransparent(other);
                minimize(other);
            }
        }
    }
}



// restore all previously minimized windows that are now no longer overlapping
function restoreMinimized(active) {
    debug("- apply restore for", caption(active));
    fulldebug(properties(active));

    // if there's an active and focused window, do not restore
    // if (active && active.active) {
    //     debug("not restoring due to active window");
    //     return;
    // }

    // iterate automatically minimized windows (most recent first)
    for (let i = 0; i < transparent.length; i++) {
        let inactive = transparent[i];
        if (!inactive || ignoreWindow(inactive)) continue;
        debug("  - check restore", caption(inactive));
        fulldebug(properties(inactive));

        // check for overlap with other windows
        let noOverlap = true;
        let others = workspace.clientList();
        for (let j = 0; j < others.length; j++) {
            let other = others[j];
            if (!other || ignoreWindow(other)) continue;
            debug("    - check prevent restore for", caption(other));
            fulldebug(properties(other));
            if (((!other.minimized) || restored.includes(other))
                && [[inactive, other], [other, inactive]].some(([win1, win2]) =>
                    !ignoreFront(win1) && !ignoreBack(win2)
                    && !ignoreOverlap(win1, win2)
                    && overlap(win1, win2)
                    && other.active)) {
                debug("    not restoring for", caption(other));
                noOverlap = false;
                break;
            }
        }

        if (noOverlap) {
            debug("    restoring", caption(inactive));
            restored.push(inactive);
        }
    }

    for (let i = 0; i < restored.length; i++) {
        let inactive = restored[i];
        removetransparent(inactive);
        unminimize(inactive);
    }
    restored = [];
}

// reactivate the most recently avtive window if there is not already one
// function reactivateRecent() {
//     // don't reactivate if auto-reactivate is disabled
//     if (!config.autoReactivate) return;
//     if (workspace.activeClient && !workspace.activeClient.desktopWindow)
//         return;
//     debug("apply reactivate recent");
//     // get reactivable clients on current desktop
//     let reactivable = active.filter(win =>
//     ((win.desktop == workspace.currentDesktop || win.onAllDesktops)
//         && win.screen == workspace.activeScreen
//         && !win.minimized));
//     fulldebug("reactivable:", reactivable.map(client => properties(client)));
//     if (reactivable.length == 0) return false;
//     // activate most recent client on the stack
//     let recentActive = reactivable[0];
//     if (!recentActive) return false;
//     debug("reactivating recent active", caption(recentActive));
//     workspace.activeClient = recentActive;
//     return true;
// }



function minimize(window) {
    if (window.opacity == 0.0) return;
    window.opacity = 0.0;
}

// set opacity to 1.0 to "unminimize"
function unminimize(window) {
    if (window.opacity == 0.8) return;
    window.opacity = 0.8;
}

///////////////////////
// compute overlap
///////////////////////
function calculateOverlapPercentage(win1, win2) {
    const x_overlap = Math.max(0, Math.min(win1.x + win1.width, win2.x + win2.width) - Math.max(win1.x, win2.x));
    const y_overlap = Math.max(0, Math.min(win1.y + win1.height, win2.y + win2.height) - Math.max(win1.y, win2.y));
    const overlapArea = x_overlap * y_overlap;
    const win2Area = win2.width * win2.height;
    return (overlapArea / win2Area) * 100;
}


function overlap(win1, win2) {
    const overlapPercentage = calculateOverlapPercentage(win1, win2);
    return overlapPercentage >= 10; // Replace YOUR_THRESHOLD with your percentage threshold
}
function overlapHorizontal(win1, win2) {
    return (win1.x <= win2.x && win1.x + win1.width > win2.x)
        || (win2.x <= win1.x && win2.x + win2.width > win1.x);
}

function overlapVertical(win1, win2) {
    return (win1.y <= win2.y && win1.y + win1.height > win2.y)
        || (win2.y <= win1.y && win2.y + win2.height > win1.y);
}


///////////////////////
// specify cases where not to check for overlap
///////////////////////

function ignoreWindow(win) {
    return !(win.desktop == workspace.currentDesktop || win.onAllDesktops)
        // different desktop
        || (config.ignoreNonnormal && !win.normalWindow) // non-normal window
        || (config.ignoreShell // desktop shell window
            && ["plasmashell", "krunner"].includes(String(win.resourceName))
            && win.frameGeometry != workspace.clientArea(KWin.FullScreenArea, win))
        || win.desktopWindow || win.dock // special window
        || win.dnd || win.tooltip || win.onScreenDisplay
        || win.notification || win.criticalNotification
}

function ignoreFront(front) {
    return (config.excludeMode && config.excludeForeground && config.excludedAppsForeground
        .includes(String(front.resourceClass))) // application excluded
        || (config.includeMode && config.includeForeground && !config.includedAppsForeground
            .includes(String(front.resourceClass)))  // application not included
}

function ignoreBack(back) {
    return (config.excludeMode && config.excludeBackground && config.excludedAppsBackground
        .includes(String(back.resourceClass))) // application excluded
        || (config.includeMode && config.includeBackground && !config.includedAppsBackground
            .includes(String(back.resourceClass))) // application not included
        || !back.minimizable // not minimizable
}

function ignoreOverlap(front, back) {
    return back == front // self
        || (config.ignoreTransient
            && ((front.transient
                && front.transientFor == back)
                || (back.transient
                    && back.transientFor == front)
                || (front.transient && back.transient
                    && front.transientFor == back.transientFor))
        ) // transient window belonging to the same main window
}


///////////////////////
// pretty print window properties
///////////////////////

// stringify window object
function properties(window) {
    return JSON.stringify(window, undefined, 2);
}

// stringify window caption
function caption(window) {
    return window ? window.caption : window;
}

// stringify window geometry
function geometry(window) {
    return ["x:", window.x, window.width, window.x + window.width,
        "y:", window.y, window.height, window.y + window.height]
        .join(" ");
}
// Add an event listener to monitor focus changes to windows
// workspace.windowFocusChanged.connect(onFocusChanged);
