(() => {
  // =========================
  // CONFIG (stuff you set once)
  // =========================

  // This MUST exactly match the CSV header name for your product “primary key”.
  // When you click a row, we read this field from that row and navigate to:
  //   product.html?sku=<value_of_Complete_item_number>
  const SKU_FIELD = "Complete_item_number";

  // Default CSV location relative to index.html.
  // Example: if index.html is at /pims/index.html
  // and your file is at /pims/db/products.csv
  // then DEFAULT_CSV_PATH = "db/products.csv"
  const DEFAULT_CSV_PATH = "db/products.csv";

  // The default columns to show in the list view.
  // This is purely a UI default: you can still show/hide any column using the picker.
  // If these columns don’t exist in a given CSV, we fall back to the first 12 columns.
  const CORE = [
    "Complete_item_number",
    "Item_No",
    "invoice_product_name",
    "Trademark_Product_brand_name_OGI",
    "Category_No_OGI",
    "UPC",
    "suggested_retail_price_in_usd",
    "MAP_in_USD_OGI"
  ];


  // =========================
  // STATE (data held in memory)
  // =========================

  // rows = the full dataset from the CSV (array of objects)
  // Each row is like:
  //   { Complete_item_number: "ABC-123", invoice_product_name: "Brush", ... }
  let rows = [];

  // filtered = the current filtered/sorted subset shown in the table
  let filtered = [];

  // fields = list of CSV column names (strings)
  let fields = [];

  // visible = Set of field names that should be rendered as columns in the table
  let visible = new Set();

  // sortKey / sortDir track sorting state
  // sortDir:  1 = ascending, -1 = descending
  let sortKey = null;
  let sortDir = 1;

  // Whether the column picker section is expanded
  let colsVisible = true;


  // =========================
  // DOM HELPERS (grab elements)
  // =========================

  // Tiny helper to shorten document.getElementById calls
  const el = (id) => document.getElementById(id);

  // Inputs/buttons
  const file = el("file");
  const path = el("path");
  const btnLoadFile = el("btnLoadFile");
  const btnLoadPath = el("btnLoadPath");
  const btnClear = el("btnClear");
  const btnExport = el("btnExport");

  // Filters/controls
  const q = el("q");
  const limit = el("limit");

  // Status UI
  const status = el("status");
  const meta = el("meta");

  // Column picker UI
  const colPicker = el("colPicker");
  const colPickerWrap = el("colPickerWrap");
  const btnToggleCols = el("btnToggleCols");
  const btnColsAll = el("btnColsAll");
  const btnColsNone = el("btnColsNone");
  const btnColsCore = el("btnColsCore");

  // Table head/body
  const thead = el("thead");
  const tbody = el("tbody");


  // =========================
  // UTILITY FUNCTIONS
  // =========================

  // Enable/disable interactive controls until a CSV is loaded.
  // Prevents the user from interacting with filters when there’s no data.
  function setEnabled(on) {
    [q, limit, btnClear, btnExport, btnToggleCols, btnColsAll, btnColsNone, btnColsCore]
      .forEach(x => x.disabled = !on);
  }

  // Convert values to safe strings (prevents "undefined" errors)
  function safeStr(v) {
    return (v === null || v === undefined) ? "" : String(v);
  }

  // Escapes HTML special chars so user data can’t break the page.
  // (This is important if your CSV contains quotes/angle brackets/etc.)
  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  // Update the “Rows: x/y, Columns: a/b” summary at the top
  function updateMeta() {
    const total = rows.length;
    const shown = filtered.length;
    meta.textContent = total
      ? `Rows: ${shown}/${total} • Columns: ${visible.size}/${fields.length}`
      : "";
    status.textContent = total ? "Loaded" : "No file loaded";
  }

  // Expand/collapse the column picker (so it doesn’t take over the screen)
  function setColsExpanded(expanded) {
    colsVisible = expanded;
    colPickerWrap.classList.toggle("collapsed", !colsVisible);
    colPickerWrap.classList.toggle("expanded", colsVisible);
    btnToggleCols.textContent = colsVisible ? "Hide" : "Show";
  }


  // =========================
  // COLUMN PICKER (UI for choosing columns)
  // =========================

  function buildColumnPicker() {
    // Clear existing checkbox list
    colPicker.innerHTML = "";

    // Create a checkbox label for each column in the CSV
    for (const f of fields) {
      const id = "col_" + f.replace(/[^a-z0-9]/gi, "_"); // safe DOM id

      const label = document.createElement("label");

      // We inject HTML here, but f is escaped to avoid HTML injection.
      label.innerHTML =
        `<input type="checkbox" id="${id}" ${visible.has(f) ? "checked": ""}> ` +
        `<span>${escapeHtml(f)}</span>`;

      // When checkbox changes: add/remove from visible set, re-render table
      label.querySelector("input").addEventListener("change", (e) => {
        if (e.target.checked) visible.add(f);
        else visible.delete(f);

        render();
        updateMeta();
      });

      colPicker.appendChild(label);
    }
  }


  // =========================
  // SORTING
  // =========================

  function sortFiltered(key, toggle = true) {
    // toggle=true means:
    // - if user clicked same column again, invert direction
    // - if new column clicked, reset to ascending
    if (toggle) {
      if (sortKey === key) sortDir *= -1;
      else { sortKey = key; sortDir = 1; }
    } else {
      // toggle=false means keep sortDir as-is; just apply sortKey
      sortKey = key;
    }

    // Sort filtered array in-place
    filtered.sort((a, b) => {
      const av = safeStr(a[key]);
      const bv = safeStr(b[key]);

      // If both values look numeric, sort numerically
      const an = Number(av), bn = Number(bv);
      const aNum = av.trim() !== "" && !Number.isNaN(an);
      const bNum = bv.trim() !== "" && !Number.isNaN(bn);

      if (aNum && bNum) return (an - bn) * sortDir;

      // Otherwise, do a string compare
      return av.localeCompare(bv) * sortDir;
    });
  }


  // =========================
  // FILTERING (search box)
  // =========================

  function applyFilters() {
    // Basic “search anywhere” filter
    const term = q.value.trim().toLowerCase();

    filtered = rows.filter(r => {
      if (!term) return true; // empty search shows everything

      // Check every field in the row; if any contains the search term, keep it
      for (const f of fields) {
        if (safeStr(r[f]).toLowerCase().includes(term)) return true;
      }
      return false;
    });

    // If there is an active sort, re-apply it after filtering
    if (sortKey) sortFiltered(sortKey, false);

    render();
    updateMeta();
  }


  // =========================
  // RENDER TABLE (list page)
  // =========================

  function render() {
    // Determine which columns to show based on visible Set
    const cols = fields.filter(f => visible.has(f));

    // ---- Render table header ----
    thead.innerHTML = "";
    for (const f of cols) {
      const th = document.createElement("th");

      // Add ▲/▼ marker if this is the sorted column
      const arrow = (sortKey === f) ? (sortDir === 1 ? " ▲" : " ▼") : "";
      th.textContent = f + arrow;

      // Make headers clickable to sort
      th.style.cursor = "pointer";
      th.addEventListener("click", () => {
        sortFiltered(f, true);
        render();
      });

      thead.appendChild(th);
    }

    // ---- Render table body ----
    tbody.innerHTML = "";

    // Row limit: 50/100/250/500/all (0 means all)
    const lim = Number(limit.value);
    const view = (lim === 0) ? filtered : filtered.slice(0, lim);

    // Check if SKU field exists in this CSV
    const hasSku = fields.includes(SKU_FIELD);

    for (const r of view) {
      const tr = document.createElement("tr");
      tr.classList.add("clickable");

      // Clicking a row navigates to product.html with sku in query string
      tr.addEventListener("click", () => {
        if (!hasSku) {
          alert(`CSV is missing required column: ${SKU_FIELD}`);
          return;
        }

        const sku = safeStr(r[SKU_FIELD]).trim();
        if (!sku) {
          alert(`Row has empty ${SKU_FIELD}.`);
          return;
        }

        // Navigate to detail page
        location.href = `product.html?sku=${encodeURIComponent(sku)}`;
      });

      // Create cells for the visible columns
      for (const f of cols) {
        const td = document.createElement("td");
        td.textContent = safeStr(r[f]);
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }
  }


  // =========================
  // EXPORT FILTERED CSV
  // =========================

  function exportFilteredCSV() {
    // Export only the currently visible columns for the currently filtered rows
    const cols = fields.filter(f => visible.has(f));

    // Build array of objects containing only visible columns
    const data = filtered.map(r => {
      const o = {};
      for (const c of cols) o[c] = r[c];
      return o;
    });

    // Papa.unparse converts array of objects back to CSV text
    const csv = Papa.unparse(data, { quotes: true });

    // Create a downloadable blob
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Trigger download
    const a = document.createElement("a");
    a.href = url;
    a.download = "pims_filtered.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Cleanup URL object
    URL.revokeObjectURL(url);
  }


  // =========================
  // CLEAR / RESET
  // =========================

  function clearAll() {
    rows = [];
    filtered = [];
    fields = [];
    visible = new Set();

    sortKey = null;
    sortDir = 1;

    thead.innerHTML = "";
    tbody.innerHTML = "";
    colPicker.innerHTML = "";

    q.value = "";

    status.textContent = "No file loaded";
    meta.textContent = "";

    setEnabled(false);
    file.value = "";
  }


  // =========================
  // LOADING CSV (from file upload or server path)
  // =========================

  function loadFromText(text, sourceLabel) {
    // This is the heart of the import:
    // - parse CSV text
    // - populate rows/fields
    // - set default visible columns
    // - build column picker
    // - render table

    status.textContent = `Parsing… (${sourceLabel})`;
    setEnabled(false);

    const res = Papa.parse(text, {
      header: true,         // uses first row as column headers
      skipEmptyLines: true, // ignores blank lines
      dynamicTyping: false  // keep everything as strings (safer for IDs/UPCs)
    });

    rows = res.data || [];
    fields = res.meta?.fields || Object.keys(rows[0] || {});
    filtered = [...rows];

    // Default visible columns: CORE columns that exist, else first 12 columns
    const corePresent = CORE.filter(c => fields.includes(c));
    visible = new Set(corePresent.length ? corePresent : fields.slice(0, Math.min(12, fields.length)));

    buildColumnPicker();

    setEnabled(true);
    btnToggleCols.disabled = false;

    // Default to collapsed columns UI so the table is readable
    setColsExpanded(false);

    render();
    updateMeta();

    // Warn if SKU_FIELD missing (detail page won't work)
    if (!fields.includes(SKU_FIELD)) {
      alert(`Warning: CSV does not include required column "${SKU_FIELD}". Row click-to-detail will not work.`);
    }

    // PapaParse provides parse warnings/errors (often quoting issues)
    if (res.errors?.length) console.warn("CSV parse warnings:", res.errors);
  }

  async function loadFromPath(csvPath) {
    // Loads a CSV from your server, like db/products.csv

    const p = (csvPath || "").trim();
    if (!p) {
      alert("Enter a CSV path, e.g. db/products.csv");
      return;
    }

    status.textContent = `Loading… (${p})`;
    setEnabled(false);

    try {
      // Cache-busting so changes to the CSV reflect immediately without hard refresh.
      const url = p + (p.includes("?") ? "&" : "?") + "v=" + Date.now();

      // fetch() reads the CSV from the server (must be same origin, no auth/CORS issues)
      const resp = await fetch(url, { cache: "no-store" });

      if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${resp.statusText}`);

      const text = await resp.text();
      loadFromText(text, p);
    } catch (err) {
      console.error(err);
      status.textContent = "Load failed";
      alert("Could not load CSV from path.\n\nDetails: " + err.message);

      // Re-enable controls only if we already had data loaded
      setEnabled(rows.length > 0);
    }
  }


  // =========================
  // EVENT HANDLERS (UI wiring)
  // =========================

  // Load CSV from local file selection
  btnLoadFile.addEventListener("click", () => {
    const f = file.files?.[0];
    if (!f) {
      alert("Choose a CSV file first.");
      return;
    }

    status.textContent = `Loading… (${f.name})`;
    setEnabled(false);

    // FileReader reads the CSV as text from your local machine
    const reader = new FileReader();
    reader.onload = () => loadFromText(String(reader.result || ""), f.name);
    reader.onerror = () => {
      status.textContent = "Load failed";
      alert("Failed to read file.");
      setEnabled(rows.length > 0);
    };
    reader.readAsText(f);
  });

  // Load CSV from server path
  btnLoadPath.addEventListener("click", () => loadFromPath(path.value));

  // Clear the loaded dataset
  btnClear.addEventListener("click", clearAll);

  // Export current filtered data
  btnExport.addEventListener("click", exportFilteredCSV);

  // Search box filters
  q.addEventListener("input", applyFilters);

  // Row limit changes re-render the table (no need to re-filter)
  limit.addEventListener("change", render);

  // Column picker expand/collapse
  btnToggleCols.addEventListener("click", () => setColsExpanded(!colsVisible));

  // Preset buttons for columns
  btnColsAll.addEventListener("click", () => {
    visible = new Set(fields);
    buildColumnPicker();
    render();
    updateMeta();
  });

  btnColsNone.addEventListener("click", () => {
    visible = new Set();
    buildColumnPicker();
    render();
    updateMeta();
  });

  btnColsCore.addEventListener("click", () => {
    const corePresent = CORE.filter(c => fields.includes(c));
    visible = new Set(corePresent.length ? corePresent : fields.slice(0, 12));
    buildColumnPicker();
    render();
    updateMeta();
  });


  // =========================
  // BOOT (auto-load default CSV on page open)
  // =========================

  path.value = DEFAULT_CSV_PATH;
  setEnabled(false);
  status.textContent = "Auto-loading…";
  loadFromPath(DEFAULT_CSV_PATH);
})();
