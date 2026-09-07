// =========================================================================
// Standalone admin — fetches the live index.html, lets you edit branches,
// sub-branches, pages and cross-links, then saves straight back to the
// server via save.php (same server-save flow as before, just triggered
// from its own page instead of being embedded in index.html).
// =========================================================================

var ADMIN_SECRET = 'CHANGE_THIS_TO_A_LONG_RANDOM_STRING'; // must match save.php

var branches = null;      // loaded from ../index.html on init
var sourceHTML = null;    // last-fetched full index.html text (for reference only)
var loadError = null;
var hasUnsavedChanges = false;
var lastStatusText = "";
var lastStatusKind = "";

var appEl = document.getElementById("app");

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

// =========================================================================
// LOAD — fetch the live index.html and pull out the branches JSON
// =========================================================================

function extractBranches(html) {
  var m = html.match(/\/\/ ADMIN:BRANCHES:START([\s\S]*?)\/\/ ADMIN:BRANCHES:END/);
  if (!m) return null;
  var varMatch = m[1].match(/var branches = ([\s\S]*?);\s*$/);
  if (!varMatch) return null;
  try {
    return JSON.parse(varMatch[1]);
  } catch (err) {
    console.error("Couldn't parse branches JSON", err);
    return null;
  }
}

function loadFromServer() {
  return fetch('../index.html', { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function (html) {
      sourceHTML = html;
      var data = extractBranches(html);
      if (!data) throw new Error("Couldn't find the branches data block in index.html");
      data.forEach(function (b) {
        if (!b.subbranches) b.subbranches = [];
        b.leaves.forEach(function (l) { if (!l.links) l.links = []; });
        b.subbranches.forEach(function (s) {
          s.leaves.forEach(function (l) { if (!l.links) l.links = []; });
        });
      });
      branches = data;
    });
}

// =========================================================================
// SAVE — refetch fresh, splice the updated branches JSON back in, POST it
// =========================================================================

function normalizeSlugs() {
  branches.forEach(function (b) {
    b.slug = slugify(b.slug || b.title);
    b.leaves.forEach(function (l) { l.slug = slugify(l.slug || l.title); });
    (b.subbranches || []).forEach(function (s) {
      s.slug = slugify(s.slug || s.title);
      s.leaves.forEach(function (l) { l.slug = slugify(l.slug || l.title); });
    });
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
  normalizeSlugs();
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

    sourceHTML = newHTML;
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
// DATA HELPERS — addressing leaves whether they sit directly under a
// branch or nested one level down inside a sub-branch
// =========================================================================

function leavesArrayFor(bi, si) {
  var b = branches[bi];
  return si == null ? b.leaves : b.subbranches[si].leaves;
}

function leafKey(bi, si, li) { return bi + "-" + (si == null ? "d" : si) + "-" + li; }

function updateBranchField(bi, field, value) {
  branches[bi][field] = value;
  markUnsaved();
  if (field === "title") {
    var el = document.getElementById("branch-title-" + bi);
    if (el) el.textContent = value || "(untitled branch)";
  }
}

function updateSubField(bi, si, field, value) {
  branches[bi].subbranches[si][field] = value;
  markUnsaved();
  if (field === "title") {
    var el = document.getElementById("sub-title-" + bi + "-" + si);
    if (el) el.textContent = value || "(untitled sub-branch)";
  }
}

function updateLeafField(bi, si, li, field, value) {
  leavesArrayFor(bi, si)[li][field] = value;
  markUnsaved();
  if (field === "title" || field === "slug") {
    var key = leafKey(bi, si, li);
    var titleEl = document.getElementById("leaf-title-" + key);
    var slugEl = document.getElementById("leaf-slug-" + key);
    var leaf = leavesArrayFor(bi, si)[li];
    if (titleEl) titleEl.textContent = leaf.title || "(untitled page)";
    if (slugEl) {
      var branch = branches[bi];
      var path = si == null ? branch.slug + "/" + leaf.slug : branch.slug + "/" + branch.subbranches[si].slug + "/" + leaf.slug;
      slugEl.textContent = "/" + path;
    }
  }
}

function updateLeafBody(bi, si, li, value) {
  leavesArrayFor(bi, si)[li].body = value.split("\n").filter(function (line) { return line.trim().length > 0; });
  markUnsaved();
}

function updateLeafLinks(bi, si, li, value) {
  leavesArrayFor(bi, si)[li].links = value.split("\n").map(normalizeLinkPath).filter(Boolean);
  markUnsaved();
}

function insertImageIntoBody(event, bi, si, li) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    var imgTag = '<img src="' + reader.result + '" alt="" style="max-width:100%;border-radius:0.5rem;margin:1.5rem 0;display:block;" />';
    var leaf = leavesArrayFor(bi, si)[li];
    leaf.body.push(imgTag);
    var key = leafKey(bi, si, li);
    var textarea = document.getElementById("leaf-body-" + key);
    if (textarea) textarea.value = leaf.body.join("\n");
    markUnsaved();
  };
  reader.onerror = function () { window.alert("Couldn't read that image file."); };
  reader.readAsDataURL(file);
  event.target.value = "";
}

function addLeaf(bi, si) {
  var arr = leavesArrayFor(bi, si);
  var n = arr.length + 1;
  arr.push({ slug: "page-" + n, title: "New Page", blurb: "", body: [], links: [] });
  markUnsaved();
  renderAdminPage();
}

function removeLeaf(bi, si, li) {
  if (!window.confirm("Remove this page?")) return;
  leavesArrayFor(bi, si).splice(li, 1);
  markUnsaved();
  renderAdminPage();
}

function addSubbranch(bi) {
  var n = (branches[bi].subbranches || []).length + 1;
  branches[bi].subbranches.push({ slug: "sub-" + n, title: "New Sub-branch", blurb: "", leaves: [] });
  markUnsaved();
  renderAdminPage();
}

function removeSubbranch(bi, si) {
  if (!window.confirm("Remove this sub-branch and all its pages?")) return;
  branches[bi].subbranches.splice(si, 1);
  markUnsaved();
  renderAdminPage();
}

function addBranch() {
  var n = branches.length + 1;
  branches.push({
    slug: "branch-" + n, title: "New Branch", tagline: "", blurb: "",
    leaves: [{ slug: "new-page", title: "New Page", blurb: "", body: [], links: [] }],
    subbranches: []
  });
  markUnsaved();
  renderAdminPage();
}

function removeBranch(bi) {
  if (!window.confirm("Remove this branch and everything in it?")) return;
  branches.splice(bi, 1);
  markUnsaved();
  renderAdminPage();
}

// =========================================================================
// RENDER
// =========================================================================

function leafEditorHTML(bi, si, li, leaf) {
  var key = leafKey(bi, si, li);
  var branch = branches[bi];
  var path = si == null ? branch.slug + "/" + leaf.slug : branch.slug + "/" + branch.subbranches[si].slug + "/" + leaf.slug;
  var siArg = si == null ? "null" : si;

  return (
    '<details class="admin-leaf">' +
    '<summary class="admin-leaf-summary">' +
    '<span class="admin-leaf-summary-title" id="leaf-title-' + key + '">' + escapeHTML(leaf.title || "(untitled page)") + "</span>" +
    '<span class="admin-leaf-summary-slug" id="leaf-slug-' + key + '">/' + escapeHTML(path) + "</span>" +
    "</summary>" +
    '<div class="admin-leaf-body">' +
    '<div class="admin-row">' +
    '<label>Title<input type="text" value="' + escapeAttr(leaf.title) + '" oninput="updateLeafField(' + bi + "," + siArg + "," + li + ',\'title\',this.value)" /></label>' +
    '<label>URL slug<input type="text" value="' + escapeAttr(leaf.slug) + '" oninput="updateLeafField(' + bi + "," + siArg + "," + li + ',\'slug\',this.value)" /></label>' +
    "</div>" +
    '<label class="admin-block">Short blurb (shown in list)<input type="text" value="' + escapeAttr(leaf.blurb) + '" oninput="updateLeafField(' + bi + "," + siArg + "," + li + ',\'blurb\',this.value)" /></label>' +
    '<label class="admin-block">Body (one paragraph per line)<textarea id="leaf-body-' + key + '" rows="5" oninput="updateLeafBody(' + bi + "," + siArg + "," + li + ',this.value)">' + escapeHTML(leaf.body.join("\n")) + "</textarea></label>" +
    '<div class="admin-image-row">' +
    '<label class="admin-btn admin-file-btn">🖼 Insert image<input type="file" accept="image/*" style="display:none" onchange="insertImageIntoBody(event,' + bi + "," + siArg + "," + li + ')" /></label>' +
    '<span class="admin-hint-inline">Embeds the picture right into the file. You can also paste raw HTML on its own line in the body above.</span>' +
    "</div>" +
    '<label class="admin-block">Linked notes (one path per line, e.g. <code>tech/systems</code> or <code>tech/hardware/keyboard</code>)<textarea rows="3" oninput="updateLeafLinks(' + bi + "," + siArg + "," + li + ',this.value)">' + escapeHTML((leaf.links || []).join("\n")) + "</textarea></label>" +
    '<button type="button" class="admin-btn admin-btn-danger" onclick="removeLeaf(' + bi + "," + siArg + "," + li + ')">Remove page</button>' +
    "</div>" +
    "</details>"
  );
}

function subbranchEditorHTML(bi, si, sub) {
  var leavesHTML = sub.leaves.map(function (leaf, li) { return leafEditorHTML(bi, si, li, leaf); }).join("");

  return (
    '<details class="admin-leaf">' +
    '<summary class="admin-leaf-summary">' +
    '<span class="admin-leaf-summary-title" id="sub-title-' + bi + "-" + si + '">' + escapeHTML(sub.title || "(untitled sub-branch)") + "</span>" +
    '<span class="admin-leaf-summary-slug">/' + escapeHTML(branches[bi].slug) + "/" + escapeHTML(sub.slug) + " · " + sub.leaves.length + (sub.leaves.length === 1 ? " page" : " pages") + "</span>" +
    "</summary>" +
    '<div class="admin-leaf-body">' +
    '<div class="admin-row">' +
    '<label>Title<input type="text" value="' + escapeAttr(sub.title) + '" oninput="updateSubField(' + bi + "," + si + ',\'title\',this.value)" /></label>' +
    '<label>URL slug<input type="text" value="' + escapeAttr(sub.slug) + '" oninput="updateSubField(' + bi + "," + si + ',\'slug\',this.value)" /></label>' +
    "</div>" +
    '<label class="admin-block">Blurb<input type="text" value="' + escapeAttr(sub.blurb) + '" oninput="updateSubField(' + bi + "," + si + ',\'blurb\',this.value)" /></label>' +
    '<h3 class="admin-subhead">Pages in this sub-branch</h3>' +
    '<div class="admin-leaf-list">' + leavesHTML + "</div>" +
    '<button type="button" class="admin-btn" onclick="addLeaf(' + bi + ',' + si + ')">+ Add page</button>' +
    '<button type="button" class="admin-btn admin-btn-danger" onclick="removeSubbranch(' + bi + ',' + si + ')">Remove sub-branch</button>' +
    "</div>" +
    "</details>"
  );
}

function branchEditorHTML(branch, bi) {
  var leavesHTML = branch.leaves.map(function (leaf, li) { return leafEditorHTML(bi, null, li, leaf); }).join("");
  var subsHTML = (branch.subbranches || []).map(function (sub, si) { return subbranchEditorHTML(bi, si, sub); }).join("");
  var totalPages = branch.leaves.length + (branch.subbranches || []).reduce(function (n, s) { return n + s.leaves.length; }, 0);

  return (
    '<details class="admin-branch" ' + (bi === 0 ? "open" : "") + '>' +
    '<summary class="admin-branch-summary">' +
    '<span class="admin-branch-summary-title" id="branch-title-' + bi + '">' + escapeHTML(branch.title || "(untitled branch)") + "</span>" +
    '<span class="admin-branch-summary-meta">' + totalPages + (totalPages === 1 ? " page" : " pages") + "</span>" +
    "</summary>" +
    '<div class="admin-branch-body">' +
    '<div class="admin-row">' +
    '<label>Title<input type="text" value="' + escapeAttr(branch.title) + '" oninput="updateBranchField(' + bi + ',\'title\',this.value)" /></label>' +
    '<label>URL slug<input type="text" value="' + escapeAttr(branch.slug) + '" oninput="updateBranchField(' + bi + ',\'slug\',this.value)" /></label>' +
    "</div>" +
    '<label class="admin-block">Tagline (shown on the web graphic)<input type="text" value="' + escapeAttr(branch.tagline) + '" oninput="updateBranchField(' + bi + ',\'tagline\',this.value)" /></label>' +
    '<label class="admin-block">Blurb (shown on the branch page)<input type="text" value="' + escapeAttr(branch.blurb) + '" oninput="updateBranchField(' + bi + ',\'blurb\',this.value)" /></label>' +
    '<h3 class="admin-subhead">Pages in this branch</h3>' +
    '<div class="admin-leaf-list">' + leavesHTML + "</div>" +
    '<button type="button" class="admin-btn" onclick="addLeaf(' + bi + ',null)">+ Add page</button>' +
    '<h3 class="admin-subhead">Sub-branches</h3>' +
    '<div class="admin-leaf-list">' + subsHTML + "</div>" +
    '<button type="button" class="admin-btn" onclick="addSubbranch(' + bi + ')">+ Add sub-branch</button>' +
    '<button type="button" class="admin-btn admin-btn-danger admin-btn-remove-branch" onclick="removeBranch(' + bi + ')">Remove branch</button>' +
    "</div>" +
    "</details>"
  );
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

  var branchesHTML = branches.map(branchEditorHTML).join("");

  appEl.innerHTML =
    '<main class="min-h-screen px-6 py-16 admin-page">' +
    '<div class="mx-auto max-w-2xl">' +
    '<a href="../" class="back-link">← back to the web</a>' +
    '<h1 class="mt-6 admin-title">Admin</h1>' +
    '<p class="mt-2 admin-sub">Edit branches, sub-branches and pages below. "Save changes" writes straight to index.html on the server.</p>' +
    adminBar() +
    '<div class="mt-8 admin-branch-list">' + branchesHTML + "</div>" +
    '<button type="button" class="admin-btn admin-btn-primary mt-6" onclick="addBranch()">+ Add branch</button>' +
    "</div>" +
    "</main>";
}

// =========================================================================
// INIT
// =========================================================================

appEl.innerHTML = '<main class="min-h-screen px-6 py-16 admin-page"><div class="mx-auto max-w-2xl"><p class="admin-sub">Loading…</p></div></main>';
loadFromServer().then(renderAdminPage).catch(function (err) {
  loadError = err.message;
  renderAdminPage();
});

window.addEventListener("beforeunload", function (e) {
  if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ""; }
});
