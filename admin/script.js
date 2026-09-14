// =========================================================================
// Standalone admin — fetches the live index.html, lets you edit branches
// (nested to any depth), pages, cross-links and themes, then saves straight
// back to the server via save.php.
// =========================================================================

var ADMIN_SECRET = 'CHANGE_THIS_TO_A_LONG_RANDOM_STRING'; // must match save.php

var branches = null;      // loaded from ../index.html on init
var loadError = null;
var hasUnsavedChanges = false;
var lastStatusText = "";
var lastStatusKind = "";

var appEl = document.getElementById("app");

// Which accordions are open, persisted across full re-renders (otherwise
// every add/remove collapses everything back to just the first branch,
// which makes newly-added sub-branches or pages look like they vanished).
var openBranchPaths = new Set();
var openLeafKeys = new Set();
var focusRequest = null; // { kind: 'branch'|'leaf', key: string } — focus+scroll after next render

function escapeHTML(str) {
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(str == null ? "" : str));
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "untitled";
}

function normalizeLinkPath(str) {
  return String(str || "").trim().replace(/^\/+|\/+$/g, "");
}

function isHTMLBlock(str) {
  return /^\s*</.test(str || "");
}

// =========================================================================
// PATH ADDRESSING — a branch anywhere in the tree is addressed by a
// comma-joined string of child indices from the root, e.g. "0,2,1" means
// branches[0].children[2].children[1]. "" means the root `branches` array
// itself (used when adding a new top-level branch).
// =========================================================================

function parsePath(pathStr) {
  return pathStr === "" || pathStr == null ? [] : String(pathStr).split(",").map(Number);
}

function getNodeAtPath(path) {
  var level = branches, node = null;
  for (var i = 0; i < path.length; i++) {
    node = level[path[i]];
    level = node.children;
  }
  return node;
}

// Returns the array a NEW child branch should be pushed into for a given
// PARENT path (empty path = the top-level `branches` array).
function getChildArrayFor(parentPathStr) {
  var path = parsePath(parentPathStr);
  return path.length === 0 ? branches : getNodeAtPath(path).children;
}

// =========================================================================
// LOAD — fetch the live index.html and pull out the branches JSON
// =========================================================================

function extractBranches(html) {
  var m = html.match(/\/\/ ADMIN:BRANCHES:START([\s\S]*?)\/\/ ADMIN:BRANCHES:END/);
  if (!m) return null;
  var varMatch = m[1].match(/var branches = ([\s\S]*?);\s*$/);
  if (!varMatch) return null;
  try { return JSON.parse(varMatch[1]); }
  catch (err) { console.error("Couldn't parse branches JSON", err); return null; }
}

// Fills in any fields older data might be missing, recursively.
function normalizeNode(b) {
  if (!b.children) b.children = [];
  if (!b.leaves) b.leaves = [];
  b.leaves.forEach(function (l) {
    if (!l.links) l.links = [];
    if (!l.theme) l.theme = "default";
  });
  b.children.forEach(normalizeNode);
}

function loadFromServer() {
  return fetch('../index.html', { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function (html) {
      var data = extractBranches(html);
      if (!data) throw new Error("Couldn't find the branches data block in index.html");
      data.forEach(normalizeNode);
      branches = data;
    });
}

// =========================================================================
// SAVE — refetch fresh, splice the updated branches JSON back in, POST it
// =========================================================================

function normalizeSlugsRecursive(list) {
  list.forEach(function (b) {
    b.slug = slugify(b.slug || b.title);
    b.leaves.forEach(function (l) { l.slug = slugify(l.slug || l.title); });
    normalizeSlugsRecursive(b.children || []);
  });
}

function setSaveStatus(text, kind) {
  lastStatusText = text;
  lastStatusKind = kind || "";
  var el = document.getElementById("save-status");
  if (!el) return;
  el.textContent = text;
  el.className = "save-status" + (kind ? " save-status-" + kind : "");
}

function markUnsaved() {
  hasUnsavedChanges = true;
  setSaveStatus("Unsaved changes", "dirty");
}

async function saveChanges() {
  normalizeSlugsRecursive(branches);
  setSaveStatus("Saving…", "dirty");

  try {
    var res = await fetch('../index.html', { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not re-fetch index.html (HTTP ' + res.status + ')');
    var freshHTML = await res.text();

    var marker = /\/\/ ADMIN:BRANCHES:START[\s\S]*?\/\/ ADMIN:BRANCHES:END/;
    if (!marker.test(freshHTML)) throw new Error("Data markers missing from index.html — save aborted");

    var newBlock =
      "// ADMIN:BRANCHES:START\n    var branches = " +
      JSON.stringify(branches, null, 2) +
      ";\n    // ADMIN:BRANCHES:END";

    var newHTML = freshHTML.replace(marker, newBlock);

    var saveRes = await fetch('../save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'text/html', 'X-Admin-Secret': ADMIN_SECRET },
      body: newHTML
    });
    var data = await saveRes.json();
    if (!saveRes.ok || !data.ok) throw new Error(data.error || ('HTTP ' + saveRes.status));

    hasUnsavedChanges = false;
    setSaveStatus('Saved to index.html ✓', 'clean');
  } catch (err) {
    console.error(err);
    setSaveStatus('Save failed — see console', 'dirty');
    window.alert('Save failed: ' + err.message);
  }
  renderAdminPage();
}

// =========================================================================
// DATA MUTATION
// =========================================================================

function updateBranchField(pathStr, field, value) {
  getNodeAtPath(parsePath(pathStr))[field] = value;
  markUnsaved();
  if (field === "title") {
    var el = document.getElementById("branch-title-" + pathStr.replace(/,/g, "_"));
    if (el) el.textContent = value || "(untitled branch)";
  }
}

function updateLeafField(branchPathStr, li, field, value) {
  var leaf = getNodeAtPath(parsePath(branchPathStr)).leaves[li];
  leaf[field] = value;
  markUnsaved();
  if (field === "title" || field === "slug") {
    var key = branchPathStr.replace(/,/g, "_") + "-" + li;
    var titleEl = document.getElementById("leaf-title-" + key);
    var slugEl = document.getElementById("leaf-slug-" + key);
    if (titleEl) titleEl.textContent = leaf.title || "(untitled page)";
    if (slugEl) {
      slugEl.textContent = "/" + pathToSlugString(branchPathStr) + "/" + leaf.slug;
    }
  }
}

function pathToSlugString(pathStr) {
  var path = parsePath(pathStr);
  var slugs = [];
  var level = branches, node = null;
  for (var i = 0; i < path.length; i++) {
    node = level[path[i]];
    slugs.push(node.slug);
    level = node.children;
  }
  return slugs.join("/");
}

function updateLeafBody(branchPathStr, li, value) {
  var leaf = getNodeAtPath(parsePath(branchPathStr)).leaves[li];
  leaf.body = value.split("\n").filter(function (line) { return line.trim().length > 0; });
  markUnsaved();
  refreshBodyPreview(branchPathStr, li);
}

function updateLeafLinks(branchPathStr, li, value) {
  getNodeAtPath(parsePath(branchPathStr)).leaves[li].links = value.split("\n").map(normalizeLinkPath).filter(Boolean);
  markUnsaved();
}

function updateLeafTheme(branchPathStr, li, value) {
  getNodeAtPath(parsePath(branchPathStr)).leaves[li].theme = value;
  markUnsaved();
}

function insertImageIntoBody(event, branchPathStr, li) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    var imgTag = '<img src="' + reader.result + '" alt="" style="max-width:100%;border-radius:0.5rem;margin:1.5rem 0;display:block;" />';
    var leaf = getNodeAtPath(parsePath(branchPathStr)).leaves[li];
    leaf.body.push(imgTag);
    var key = branchPathStr.replace(/,/g, "_") + "-" + li;
    var textarea = document.getElementById("leaf-body-" + key);
    if (textarea) textarea.value = leaf.body.join("\n");
    markUnsaved();
    refreshBodyPreview(branchPathStr, li);
  };
  reader.onerror = function () { window.alert("Couldn't read that image file."); };
  reader.readAsDataURL(file);
  event.target.value = "";
}

// Basic HTML tidy: puts block-level tags on their own line and indents
// nested tags, so hand-written/pasted HTML in the body reads cleanly.
// Deliberately simple (regex-based) rather than a full parser — good
// enough for the kind of snippets people paste into a body field.
function formatHTML(html) {
  var blockTags = 'div|p|section|article|header|footer|main|ul|ol|li|h1|h2|h3|h4|h5|h6|blockquote|figure|figcaption|table|tr|td|th|thead|tbody';
  var withBreaks = html
    .replace(new RegExp('<(' + blockTags + ')([^>]*)>', 'gi'), '\n<$1$2>\n')
    .replace(new RegExp('</(' + blockTags + ')>', 'gi'), '\n</$1>\n')
    .replace(/<br\s*\/?>/gi, '<br />\n')
    .replace(/\n\s*\n/g, '\n');

  var lines = withBreaks.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  var indent = 0;
  var out = [];
  lines.forEach(function (line) {
    var isClosing = /^<\//.test(line);
    var isSelfClosing = /\/>\s*$/.test(line) || /^<(br|img|hr|input)\b/i.test(line);
    var opensAndCloses = /^<([a-zA-Z0-9]+)[^>]*>.*<\/\1>$/.test(line);
    if (isClosing) indent = Math.max(0, indent - 1);
    out.push('  '.repeat(indent) + line);
    if (!isClosing && !isSelfClosing && !opensAndCloses && /^<[a-zA-Z]/.test(line)) indent++;
  });
  return out.join('\n');
}

function formatBodyField(branchPathStr, li) {
  var key = branchPathStr.replace(/,/g, "_") + "-" + li;
  var textarea = document.getElementById("leaf-body-" + key);
  if (!textarea) return;
  // Format only HTML-looking lines; leave plain paragraph lines untouched.
  var lines = textarea.value.split('\n');
  var formatted = lines.map(function (line) {
    return isHTMLBlock(line) ? formatHTML(line) : line;
  }).join('\n');
  textarea.value = formatted;
  updateLeafBody(branchPathStr, li, formatted);
}

function insertAtCursor(textarea, before, after) {
  var start = textarea.selectionStart, end = textarea.selectionEnd;
  var value = textarea.value;
  var selected = value.slice(start, end);
  textarea.value = value.slice(0, start) + before + selected + after + value.slice(end);
  var cursor = start + before.length + selected.length + after.length;
  textarea.selectionStart = textarea.selectionEnd = cursor;
  textarea.focus();
  textarea.dispatchEvent(new Event('input'));
}

function toolbarInsert(branchPathStr, li, before, after) {
  var key = branchPathStr.replace(/,/g, "_") + "-" + li;
  var textarea = document.getElementById("leaf-body-" + key);
  if (textarea) insertAtCursor(textarea, before, after);
}

var TOOLBAR_PRESETS = {
  h2: ['<h2>', '</h2>'],
  bold: ['<strong>', '</strong>'],
  italic: ['<em>', '</em>'],
  quote: ['<blockquote>', '</blockquote>'],
  list: ['<ul>\n  <li>', '</li>\n</ul>'],
  divider: ['<hr />\n', '']
};

function toolbarWrap(presetName, branchPathStr, li) {
  var preset = TOOLBAR_PRESETS[presetName];
  if (!preset) return;
  toolbarInsert(branchPathStr, li, preset[0], preset[1]);
}

// Renders the body textarea's current content exactly the way the live
// site would (same rule: lines starting with "<" are raw HTML, everything
// else is an escaped paragraph) — this is the "auto-align" live preview.
function refreshBodyPreview(branchPathStr, li) {
  var key = branchPathStr.replace(/,/g, "_") + "-" + li;
  var textarea = document.getElementById("leaf-body-" + key);
  var preview = document.getElementById("leaf-preview-" + key);
  if (!textarea || !preview) return;
  var lines = textarea.value.split('\n').filter(function (l) { return l.trim().length > 0; });
  preview.innerHTML = lines.map(function (line) {
    return isHTMLBlock(line) ? line : '<p>' + escapeHTML(line) + '</p>';
  }).join('') || '<p style="opacity:.5">Nothing to preview yet.</p>';
}

function addLeaf(branchPathStr) {
  var node = getNodeAtPath(parsePath(branchPathStr));
  var n = node.leaves.length + 1;
  node.leaves.push({ slug: "page-" + n, title: "New Page", blurb: "", body: [], links: [], theme: "default" });
  var newLi = node.leaves.length - 1;
  var newKey = branchPathStr.replace(/,/g, "_") + "-" + newLi;
  openBranchPaths.add(branchPathStr);
  openLeafKeys.add(newKey);
  focusRequest = { kind: 'leaf', key: newKey };
  markUnsaved();
  renderAdminPage();
}

function removeLeaf(branchPathStr, li) {
  if (!window.confirm("Remove this page?")) return;
  getNodeAtPath(parsePath(branchPathStr)).leaves.splice(li, 1);
  openLeafKeys.clear(); // indices shift after a removal — reset to avoid stale/mismatched open state
  markUnsaved();
  renderAdminPage();
}

function addChildBranch(parentPathStr) {
  var arr = getChildArrayFor(parentPathStr);
  var n = arr.length + 1;
  arr.push({ slug: "sub-" + n, title: "New Sub-branch", tagline: "", blurb: "", leaves: [], children: [] });
  var newPath = parentPathStr === "" ? String(arr.length - 1) : parentPathStr + "," + (arr.length - 1);
  openBranchPaths.add(parentPathStr); // keep the branch you were in open
  openBranchPaths.add(newPath);       // and expand the one you just created
  focusRequest = { kind: 'branch', key: newPath };
  markUnsaved();
  renderAdminPage();
}

function removeBranchAtPath(pathStr) {
  if (!window.confirm("Remove this branch and everything inside it?")) return;
  var path = parsePath(pathStr);
  var idx = path[path.length - 1];
  var parentPath = path.slice(0, -1);
  var arr = parentPath.length === 0 ? branches : getNodeAtPath(parentPath).children;
  arr.splice(idx, 1);
  openBranchPaths.clear(); // indices shift after a removal — reset to avoid stale/mismatched open state
  openLeafKeys.clear();
  markUnsaved();
  renderAdminPage();
}

// =========================================================================
// RENDER
// =========================================================================

function leafEditorHTML(branchPathStr, li, leaf) {
  var key = branchPathStr.replace(/,/g, "_") + "-" + li;
  var path = pathToSlugString(branchPathStr) + "/" + leaf.slug;
  var pArg = "'" + branchPathStr + "'";

  return (
    '<details class="admin-leaf" data-leaf-key="' + key + '"' + (openLeafKeys.has(key) ? ' open' : '') + '>' +
    '<summary class="admin-leaf-summary">' +
    '<span class="admin-leaf-summary-title" id="leaf-title-' + key + '">' + escapeHTML(leaf.title || "(untitled page)") + "</span>" +
    '<span class="admin-leaf-summary-slug" id="leaf-slug-' + key + '">/' + escapeHTML(path) + "</span>" +
    "</summary>" +
    '<div class="admin-leaf-body">' +
    '<div class="admin-row">' +
    '<label>Title<input type="text" value="' + escapeAttr(leaf.title) + '" oninput="updateLeafField(' + pArg + "," + li + ',\'title\',this.value)" /></label>' +
    '<label>URL slug<input type="text" value="' + escapeAttr(leaf.slug) + '" oninput="updateLeafField(' + pArg + "," + li + ',\'slug\',this.value)" /></label>' +
    "</div>" +
    '<div class="admin-row">' +
    '<label class="admin-block" style="grid-column:1/-1">Short blurb (shown in list)<input type="text" value="' + escapeAttr(leaf.blurb) + '" oninput="updateLeafField(' + pArg + "," + li + ',\'blurb\',this.value)" /></label>' +
    "</div>" +
    '<label class="admin-block">Theme<select oninput="updateLeafTheme(' + pArg + "," + li + ',this.value)">' +
    ['default', 'fun', 'sunset', 'ocean', 'neon', 'doodle', 'editorial', 'blueprint', 'terminal', 'serious'].map(function (t) {
      return '<option value="' + t + '"' + (leaf.theme === t ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>';
    }).join('') +
    '</select></label>' +

    '<label class="admin-block">Body (one paragraph per line)</label>' +
    '<div class="body-editor-toolbar">' +
    '<button type="button" onclick="toolbarWrap(\'h2\',' + pArg + "," + li + ')">H2</button>' +
    '<button type="button" onclick="toolbarWrap(\'bold\',' + pArg + "," + li + ')"><b>B</b></button>' +
    '<button type="button" onclick="toolbarWrap(\'italic\',' + pArg + "," + li + ')"><i>I</i></button>' +
    '<button type="button" onclick="toolbarWrap(\'quote\',' + pArg + "," + li + ')">Quote</button>' +
    '<button type="button" onclick="toolbarWrap(\'list\',' + pArg + "," + li + ')">List</button>' +
    '<button type="button" onclick="toolbarWrap(\'divider\',' + pArg + "," + li + ')">Divider</button>' +
    '<button type="button" onclick="formatBodyField(' + pArg + "," + li + ')">\u2728 Auto-format HTML</button>' +
    '</div>' +
    '<div class="body-editor-split">' +
    '<textarea id="leaf-body-' + key + '" rows="7" oninput="updateLeafBody(' + pArg + "," + li + ',this.value)">' + escapeHTML(leaf.body.join("\n")) + "</textarea>" +
    '<div><span class="body-editor-preview-label">Live preview</span><div id="leaf-preview-' + key + '" class="body-editor-preview"></div></div>' +
    "</div>" +

    '<div class="admin-image-row">' +
    '<label class="admin-btn admin-file-btn">🖼 Insert image<input type="file" accept="image/*" style="display:none" onchange="insertImageIntoBody(event,' + pArg + "," + li + ')" /></label>' +
    '<span class="admin-hint-inline">Embeds the picture right into the file. You can also paste raw HTML on its own line in the body above.</span>' +
    "</div>" +
    '<label class="admin-block">Linked notes (one path per line, e.g. <code>tech/systems</code> or <code>tech/notes/part-1</code>)<textarea rows="3" oninput="updateLeafLinks(' + pArg + "," + li + ',this.value)">' + escapeHTML((leaf.links || []).join("\n")) + "</textarea></label>" +
    '<button type="button" class="admin-btn admin-btn-danger" onclick="removeLeaf(' + pArg + "," + li + ')">Remove page</button>' +
    "</div>" +
    "</details>"
  );
}

// Recursively renders a branch (and, nested inside, every one of its
// children to any depth) as an accordion.
function branchEditorHTML(branch, pathStr, depth) {
  var pArg = "'" + pathStr + "'";
  var leavesHTML = branch.leaves.map(function (leaf, li) { return leafEditorHTML(pathStr, li, leaf); }).join("");
  var children = branch.children || [];
  var childHTML = children.map(function (child, ci) {
    var childPath = pathStr === "" ? String(ci) : pathStr + "," + ci;
    return branchEditorHTML(child, childPath, depth + 1);
  }).join("");
  var totalPages = countPages(branch);
  var titleId = "branch-title-" + pathStr.replace(/,/g, "_");

  return (
    '<details class="admin-branch" data-branch-path="' + pathStr + '"' + ((depth === 0 || openBranchPaths.has(pathStr)) ? ' open' : '') + '>' +
    '<summary class="admin-branch-summary">' +
    '<span class="admin-branch-summary-title" id="' + titleId + '">' + escapeHTML(branch.title || "(untitled branch)") + "</span>" +
    '<span class="admin-branch-summary-meta">' + totalPages + (totalPages === 1 ? " page" : " pages") + "</span>" +
    "</summary>" +
    '<div class="admin-branch-body">' +
    '<div class="admin-row">' +
    '<label>Title<input type="text" value="' + escapeAttr(branch.title) + '" oninput="updateBranchField(' + pArg + ',\'title\',this.value)" /></label>' +
    '<label>URL slug<input type="text" value="' + escapeAttr(branch.slug) + '" oninput="updateBranchField(' + pArg + ',\'slug\',this.value)" /></label>' +
    "</div>" +
    (depth === 0 ? '<label class="admin-block">Tagline (shown on the web graphic)<input type="text" value="' + escapeAttr(branch.tagline) + '" oninput="updateBranchField(' + pArg + ',\'tagline\',this.value)" /></label>' : '') +
    '<label class="admin-block">Blurb<input type="text" value="' + escapeAttr(branch.blurb) + '" oninput="updateBranchField(' + pArg + ',\'blurb\',this.value)" /></label>' +
    '<h3 class="admin-subhead">Pages in this branch</h3>' +
    '<div class="admin-leaf-list">' + leavesHTML + "</div>" +
    '<button type="button" class="admin-btn" onclick="addLeaf(' + pArg + ')">+ Add page</button>' +
    '<h3 class="admin-subhead">Sub-branches</h3>' +
    '<div class="admin-leaf-list">' + childHTML + "</div>" +
    '<button type="button" class="admin-btn" onclick="addChildBranch(' + pArg + ')">+ Add sub-branch here</button>' +
    (depth > 0 ? '<button type="button" class="admin-btn admin-btn-danger" onclick="removeBranchAtPath(' + pArg + ')">Remove this branch</button>' : '<button type="button" class="admin-btn admin-btn-danger admin-btn-remove-branch" onclick="removeBranchAtPath(' + pArg + ')">Remove branch</button>') +
    "</div>" +
    "</details>"
  );
}

function countPages(branch) {
  var n = branch.leaves.length;
  (branch.children || []).forEach(function (c) { n += countPages(c); });
  return n;
}

function adminBar() {
  return (
    '<div class="admin-bar">' +
    '<div class="admin-bar-row">' +
    '<button type="button" class="admin-btn admin-btn-primary" onclick="saveChanges()">💾 Save changes</button>' +
    '<button type="button" class="admin-btn admin-btn-ghost" onclick="reload()">↻ Reload from server</button>' +
    "</div>" +
    '<div class="admin-bar-row">' +
    '<span id="save-status" class="save-status' + (lastStatusKind ? " save-status-" + lastStatusKind : "") + '">' + escapeHTML(lastStatusText) + "</span>" +
    "</div>" +
    "</div>"
  );
}

function reload() {
  if (hasUnsavedChanges && !window.confirm("You have unsaved changes — reload from the server and lose them?")) return;
  appEl.innerHTML = '<main class="min-h-screen px-6 py-16 admin-page"><div class="mx-auto max-w-2xl"><p class="admin-sub">Loading…</p></div></main>';
  loadFromServer().then(renderAdminPage).catch(function (err) {
    loadError = err.message;
    renderAdminPage();
  });
}

function renderAdminPage() {
  document.title = "Admin — Rooban's Web";

  if (loadError) {
    appEl.innerHTML =
      '<main class="min-h-screen px-6 py-16 admin-page"><div class="mx-auto max-w-2xl">' +
      '<a href="../" class="back-link">← back to the web</a>' +
      '<h1 class="mt-6 admin-title">Admin</h1>' +
      '<p class="mt-2 admin-sub">Couldn\'t load the site data: ' + escapeHTML(loadError) + '</p>' +
      '<button type="button" class="admin-btn admin-btn-primary mt-4" onclick="reload()">Try again</button>' +
      "</div></main>";
    return;
  }

  var branchesHTML = branches.map(function (b, i) { return branchEditorHTML(b, String(i), 0); }).join("");

  appEl.innerHTML =
    '<main class="min-h-screen px-6 py-16 admin-page">' +
    '<div class="mx-auto max-w-2xl">' +
    '<a href="../" class="back-link">← back to the web</a>' +
    '<h1 class="mt-6 admin-title">Admin</h1>' +
    '<p class="mt-2 admin-sub">Edit branches, sub-branches (nest as deep as you like) and pages below. "Save changes" writes straight to index.html on the server.</p>' +
    adminBar() +
    '<div class="mt-8 admin-branch-list">' + branchesHTML + "</div>" +
    '<button type="button" class="admin-btn admin-btn-primary mt-6" onclick="addChildBranch(\'\')">+ Add branch</button>' +
    "</div>" +
    "</main>";

  // Populate live previews for every leaf body now that the DOM exists.
  branches.forEach(function (b, i) { primePreviewsRecursive(b, String(i)); });

  // Keep openBranchPaths/openLeafKeys in sync as the user manually
  // expands/collapses things, so the NEXT re-render (e.g. after adding a
  // page elsewhere) doesn't fight what they already had open.
  appEl.querySelectorAll('.admin-branch[data-branch-path]').forEach(function (el) {
    var path = el.getAttribute('data-branch-path');
    el.addEventListener('toggle', function () {
      if (el.open) openBranchPaths.add(path); else openBranchPaths.delete(path);
    });
  });
  appEl.querySelectorAll('.admin-leaf[data-leaf-key]').forEach(function (el) {
    var key = el.getAttribute('data-leaf-key');
    el.addEventListener('toggle', function () {
      if (el.open) openLeafKeys.add(key); else openLeafKeys.delete(key);
    });
  });

  // If an add/remove just happened, scroll to and focus the relevant
  // title field so it's obvious something was actually created.
  if (focusRequest) {
    var req = focusRequest;
    focusRequest = null;
    requestAnimationFrame(function () {
      var el = req.kind === 'branch'
        ? appEl.querySelector('.admin-branch[data-branch-path="' + req.key + '"] input[type="text"]')
        : appEl.querySelector('.admin-leaf[data-leaf-key="' + req.key + '"] input[type="text"]');
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus();
        el.select();
      }
    });
  }
}

function primePreviewsRecursive(branch, pathStr) {
  branch.leaves.forEach(function (leaf, li) { refreshBodyPreview(pathStr, li); });
  (branch.children || []).forEach(function (child, ci) {
    primePreviewsRecursive(child, pathStr === "" ? String(ci) : pathStr + "," + ci);
  });
}

// =========================================================================
// SAVE.PHP HEALTH CHECK — surfaces a broken save path immediately, up
// front, instead of only after a save attempt fails silently or the
// person misses a popup alert.
// =========================================================================

var savePhpBroken = null; // null = not checked yet, true/false once known
var savePhpBrokenDetail = "";

function checkSavePhpHealth() {
  return fetch('../save.php', { cache: 'no-store' })
    .then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = JSON.parse(text); } catch (err) {}
        if (res.ok && data && data.ok) {
          savePhpBroken = false;
        } else {
          savePhpBroken = true;
          savePhpBrokenDetail = 'HTTP ' + res.status + ' — response started with: ' + text.slice(0, 120).replace(/</g, '&lt;');
        }
      });
    })
    .catch(function (err) {
      savePhpBroken = true;
      savePhpBrokenDetail = 'Network error: ' + err.message;
    })
    .then(renderSaveHealthBanner);
}

function renderSaveHealthBanner() {
  var existing = document.getElementById('save-health-banner');
  if (existing) existing.remove();
  if (!savePhpBroken) return;

  var banner = document.createElement('div');
  banner.id = 'save-health-banner';
  banner.className = 'sync-badge';
  banner.style.cssText = 'display:block;max-width:42rem;margin:1rem auto 0;background:#fee2e2;color:#991b1b;border-color:#fca5a5;';
  banner.innerHTML =
    '⚠️ <strong>save.php isn\'t responding correctly</strong> — changes you make here will NOT be saved to the live site until this is fixed.' +
    '<div style="margin-top:6px;font-size:0.75rem;opacity:0.85">' + escapeHTML(savePhpBrokenDetail) + '</div>' +
    '<div style="margin-top:8px;font-size:0.75rem">Usually means PHP isn\'t executing on this path, or a server rule is blocking it — check your hosting\'s PHP settings for this folder.</div>' +
    '<button type="button" style="margin-top:8px" onclick="checkSavePhpHealth()">Check again</button>';
  document.body.insertBefore(banner, document.body.firstChild);
}

// =========================================================================
// INIT
// =========================================================================

appEl.innerHTML = '<main class="min-h-screen px-6 py-16 admin-page"><div class="mx-auto max-w-2xl"><p class="admin-sub">Loading…</p></div></main>';
loadFromServer().then(renderAdminPage).catch(function (err) {
  loadError = err.message;
  renderAdminPage();
});
checkSavePhpHealth();

window.addEventListener("beforeunload", function (e) {
  if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ""; }
});
