(() => {
  // =========================
  // CONFIG
  // =========================

  // Must match your CSV header exactly:
  // This is how we find the product row in the CSV.
  const SKU_FIELD = "Complete_item_number";

  // Default CSV location
  const DEFAULT_CSV_PATH = "db/products.csv";


  // =========================
  // DOM ELEMENTS
  // =========================

  const el = (id) => document.getElementById(id);

  const status = el("status"); // shows "Loading/Loaded/Not found"
  const title  = el("title");  // shows "SKU X • Name"
  const grid   = el("grid");   // where we render the key/value field list
  const path   = el("path");   // editable CSV path input
  const btnReload = el("btnReload"); // reload button


  // =========================
  // UTILITY
  // =========================

  function safeStr(v) {
    return (v === null || v === undefined) ? "" : String(v);
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  // Read the SKU from the URL query string.
  // Example: product.html?sku=ABC-123
  function getSkuFromUrl() {
    const u = new URL(location.href);
    return (u.searchParams.get("sku") || "").trim();
  }


  // =========================
  // RENDER DETAIL GRID
  // =========================

  function renderRow(row, fields) {
    // Clear the grid first
    grid.innerHTML = "";

    // For each field in the CSV, render:
    //  left column = field name
    //  right column = field value
    for (const f of fields) {
      const k = document.createElement("div");
      k.className = "k";
      k.textContent = f;

      const v = document.createElement("div");

      // Pull the cell value from the row
      const val = safeStr(row[f]).trim();

      // Add an "empty" class if no value so it’s visually obvious
      v.className = "v" + (val ? "" : " empty");

      // If the value looks like a URL, make it clickable
      // (handy for Dropbox, YouTube, PDFs, etc.)
      if (val && /^https?:\/\//i.test(val)) {
        v.innerHTML =
          `<a href="${escapeHtml(val)}" target="_blank" rel="noopener">` +
          `${escapeHtml(val)}` +
          `</a>`;
      } else {
        // Otherwise render as plain text
        v.textContent = val || "(empty)";
      }

      grid.appendChild(k);
      grid.appendChild(v);
    }
  }


  // =========================
  // LOAD CSV + FIND MATCHING PRODUCT
  // =========================

  async function loadAndFind(csvPath, sku) {
    // This function:
    // 1) fetches the CSV file
    // 2) parses it
    // 3) finds the row where Complete_item_number == sku
    // 4) renders all columns for that row

    status.textContent = `Loading…`;
    title.textContent = "";
    grid.innerHTML = "";

    // If URL has no sku parameter, nothing to look up
    if (!sku) {
      status.textContent = "No SKU";
      grid.innerHTML =
        `<div class="muted small">Missing query parameter. Use <code>?sku=...</code></div>`;
      return;
    }

    try {
      const p = (csvPath || DEFAULT_CSV_PATH).trim();

      // Cache-busting query param so updates show immediately
      const url = p + (p.includes("?") ? "&" : "?") + "v=" + Date.now();

      // Fetch CSV text from server
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${resp.statusText}`);

      const text = await resp.text();

      // Parse CSV into array of objects
      const res = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false
      });

      const rows = res.data || [];
      const fields = res.meta?.fields || Object.keys(rows[0] || {});

      // Validate that the SKU field exists in this CSV
      if (!fields.includes(SKU_FIELD)) {
        status.textContent = "Bad CSV";
        grid.innerHTML =
          `<div class="muted small">CSV missing required column <code>${SKU_FIELD}</code>.</div>`;
        return;
      }

      // Find the first row where Complete_item_number matches the sku
      // NOTE: exact string match (case-sensitive).
      // If you want case-insensitive or partial matching, we can change this.
      const match = rows.find(r => safeStr(r[SKU_FIELD]).trim() === sku);

      if (!match) {
        status.textContent = "Not found";
        grid.innerHTML =
          `<div class="muted small">No product found where <code>${SKU_FIELD}</code> = ` +
          `<code>${escapeHtml(sku)}</code>.</div>`;
        return;
      }

      // Build a nicer title line.
      // We try invoice_product_name first, then fallback.
      const name =
        safeStr(match["invoice_product_name"]).trim() ||
        safeStr(match["Commercial_PRODUCT_NAME_OGI"]).trim() ||
        "";

      title.textContent = name ? `SKU ${sku} • ${name}` : `SKU ${sku}`;
      status.textContent = "Loaded";

      // Render all fields
      renderRow(match, fields);

      if (res.errors?.length) console.warn("CSV parse warnings:", res.errors);

    } catch (err) {
      console.error(err);
      status.textContent = "Load failed";
      grid.innerHTML =
        `<div class="muted small">Could not load CSV. Details: ${escapeHtml(err.message)}</div>`;
    }
  }


  // =========================
  // BOOT + EVENTS
  // =========================

  // Pull sku from URL on first load
  const sku = getSkuFromUrl();

  // Set input field to default path
  path.value = DEFAULT_CSV_PATH;

  // Load and render immediately
  loadAndFind(DEFAULT_CSV_PATH, sku);

  // Allow user to reload with a different CSV file path (but same sku)
  btnReload.addEventListener("click", () => {
    loadAndFind(path.value, sku);
  });
})();
