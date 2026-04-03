const state = {
  claims: [],
  selectedClaimId: null,
  filters: {
    search: "",
    status: "all"
  },
  loading: true,
  error: null
};

const elements = {
  todayDate: document.getElementById("todayDate"),
  sidebarSummary: document.getElementById("sidebarSummary"),
  statTotalClaims: document.getElementById("statTotalClaims"),
  statTotalDelta: document.getElementById("statTotalDelta"),
  statOpenExposure: document.getElementById("statOpenExposure"),
  statOpenDelta: document.getElementById("statOpenDelta"),
  statCriticalClaims: document.getElementById("statCriticalClaims"),
  statCriticalDelta: document.getElementById("statCriticalDelta"),
  statTurnaround: document.getElementById("statTurnaround"),
  statTurnaroundDelta: document.getElementById("statTurnaroundDelta"),
  segmentList: document.getElementById("segmentList"),
  priorityList: document.getElementById("priorityList"),
  claimsTableBody: document.getElementById("claimsTableBody"),
  detailTitle: document.getElementById("detailTitle"),
  detailContent: document.getElementById("detailContent"),
  detailTemplate: document.getElementById("claimDetailTemplate"),
  insightList: document.getElementById("insightList"),
  claimForm: document.getElementById("claimForm"),
  formMessage: document.getElementById("formMessage"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  loadSampleDataButton: document.getElementById("loadSampleDataButton"),
  navButtons: [...document.querySelectorAll("[data-panel-target]")]
};

initialize();

async function initialize() {
  setTodayDate();
  wireEvents();
  await fetchClaims();
  render();
}

function setTodayDate() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  elements.todayDate.textContent = formatter.format(new Date());
}

function wireEvents() {
  elements.claimForm.addEventListener("submit", handleClaimSubmit);
  elements.searchInput.addEventListener("input", handleSearchChange);
  elements.statusFilter.addEventListener("change", handleStatusChange);
  elements.loadSampleDataButton.addEventListener("click", reloadSampleData);
  elements.navButtons.forEach((button) => button.addEventListener("click", handlePanelJump));
}

async function fetchClaims() {
  state.loading = true;
  state.error = null;
  try {
    const response = await fetch("/api/claims");
    if (!response.ok) throw new Error(`API ${response.status}`);
    state.claims = await response.json();
    state.selectedClaimId = state.claims[0]?.id || null;
  } catch (error) {
    state.error = "API unavailable. Showing empty state.";
    state.claims = [];
    state.selectedClaimId = null;
  } finally {
    state.loading = false;
  }
}

function render() {
  renderStats();
  renderSegments();
  renderPriority();
  renderTable();
  renderDetail();
  renderInsights();
}

function renderStats() {
  const totalClaims = state.claims.length;
  const openClaims = state.claims.filter((claim) => !["Approved", "Rejected"].includes(claim.status));
  const criticalClaims = state.claims.filter((claim) => claim.severity === "Critical");
  const openExposure = openClaims.reduce((sum, claim) => sum + Number(claim.claimedAmount), 0);
  const closedClaims = state.claims.filter((claim) => ["Approved", "Rejected"].includes(claim.status));
  const averageTurnaround = closedClaims.length
    ? Math.round(
        closedClaims.reduce((sum, claim) => {
          const opened = new Date(claim.incidentDate);
          const closed = new Date(claim.timeline[claim.timeline.length - 1].date);
          return sum + Math.max(1, Math.round((closed - opened) / (1000 * 60 * 60 * 24)));
        }, 0) / closedClaims.length
      )
    : 0;

  elements.statTotalClaims.textContent = String(totalClaims);
  elements.statTotalDelta.textContent = `${openClaims.length} currently active`;
  elements.statOpenExposure.textContent = formatCurrency(openExposure);
  elements.statOpenDelta.textContent = `${openClaims.length} claims not yet closed`;
  elements.statCriticalClaims.textContent = String(criticalClaims.length);
  elements.statCriticalDelta.textContent = criticalClaims.length
    ? "Escalate document collection and reserve review"
    : "No critical investigations open";
  elements.statTurnaround.textContent = `${averageTurnaround} days`;
  elements.statTurnaroundDelta.textContent = closedClaims.length
    ? "Based on approved and rejected claims"
    : "Waiting for completed decisions";
  elements.sidebarSummary.textContent = `${openClaims.length} open claims are waiting for review.`;
}

function renderSegments() {
  const totals = new Map();
  state.claims.forEach((claim) => {
    totals.set(claim.claimType, (totals.get(claim.claimType) || 0) + 1);
  });

  const maxCount = Math.max(...totals.values(), 1);
  elements.segmentList.innerHTML = "";

  [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      const item = document.createElement("article");
      item.className = "segment-item";
      item.innerHTML = `
        <header>
          <strong>${type}</strong>
          <span>${count} claim${count === 1 ? "" : "s"}</span>
        </header>
        <div class="progress-track" aria-hidden="true">
          <div class="progress-bar" style="width: ${(count / maxCount) * 100}%"></div>
        </div>
      `;
      elements.segmentList.appendChild(item);
    });
}

function renderPriority() {
  const urgentClaims = state.claims
    .filter((claim) => claim.severity === "Critical" || claim.status === "Pending Documents")
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));

  elements.priorityList.innerHTML = "";

  if (urgentClaims.length === 0) {
    elements.priorityList.innerHTML = '<p class="empty-state">No escalations right now.</p>';
    return;
  }

  urgentClaims.forEach((claim) => {
    const item = document.createElement("article");
    item.className = "priority-item";
    item.innerHTML = `
      <header>
        <strong>${claim.claimantName}</strong>
        <span class="severity-badge ${badgeClass("severity", claim.severity)}">${claim.severity}</span>
      </header>
      <p>${claim.claimType} claim for ${formatCurrency(claim.claimedAmount)}</p>
      <small>${claim.nextActions[0] || "Awaiting assignment"}</small>
    `;
    elements.priorityList.appendChild(item);
  });
}

function renderTable() {
  const filteredClaims = getFilteredClaims();
  elements.claimsTableBody.innerHTML = "";

  if (state.loading) {
    elements.claimsTableBody.innerHTML = `
      <tr><td colspan="6"><div class="empty-state">Loading claims…</div></td></tr>
    `;
    return;
  }

  if (state.error) {
    elements.claimsTableBody.innerHTML = `
      <tr><td colspan="6"><div class="empty-state">${state.error}</div></td></tr>
    `;
    return;
  }

  if (filteredClaims.length === 0) {
    elements.claimsTableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">No claims match the current filters.</div>
        </td>
      </tr>
    `;
    return;
  }

  filteredClaims.forEach((claim) => {
    const row = document.createElement("tr");
    if (claim.id === state.selectedClaimId) {
      row.classList.add("selected");
    }

    row.innerHTML = `
      <td>
        <strong>${claim.claimantName}</strong>
        <small>${claim.id} • ${claim.policyNumber}</small>
      </td>
      <td>${claim.claimType}</td>
      <td><span class="status-badge ${badgeClass("status", claim.status)}">${claim.status}</span></td>
      <td><span class="severity-badge ${badgeClass("severity", claim.severity)}">${claim.severity}</span></td>
      <td>${formatCurrency(claim.claimedAmount)}</td>
      <td>${formatShortDate(claim.timeline[claim.timeline.length - 1].date)}</td>
    `;

    row.addEventListener("click", () => {
      state.selectedClaimId = claim.id;
      renderTable();
      renderDetail();
    });

    elements.claimsTableBody.appendChild(row);
  });
}

function renderDetail() {
  const claim = state.claims.find((entry) => entry.id === state.selectedClaimId);
  if (!claim) {
    elements.detailTitle.textContent = "Select a claim";
    elements.detailContent.className = "detail-empty";
    elements.detailContent.textContent = "Choose a claim from the queue to review documents, timeline, and next actions.";
    return;
  }

  elements.detailTitle.textContent = `${claim.claimantName} • ${claim.claimType}`;
  const fragment = elements.detailTemplate.content.cloneNode(true);

  fragment.getElementById("detailClaimId").textContent = claim.id;
  fragment.getElementById("detailClaimant").textContent = claim.claimantName;
  const statusNode = fragment.getElementById("detailStatus");
  statusNode.textContent = claim.status;
  statusNode.classList.add(badgeClass("status", claim.status));
  fragment.getElementById("detailDescription").textContent = claim.description;
  fragment.getElementById("detailPolicy").textContent = claim.policyNumber;
  fragment.getElementById("detailType").textContent = claim.claimType;
  fragment.getElementById("detailSeverity").textContent = claim.severity;
  fragment.getElementById("detailAmount").textContent = formatCurrency(claim.claimedAmount);

  const documentsList = fragment.getElementById("detailDocuments");
  claim.documents.forEach((doc) => {
    const item = document.createElement("li");
    item.textContent = doc;
    documentsList.appendChild(item);
  });

  const actionsList = fragment.getElementById("detailActions");
  claim.nextActions.forEach((action) => {
    const item = document.createElement("li");
    item.textContent = action;
    actionsList.appendChild(item);
  });

  const timelineList = fragment.getElementById("detailTimeline");
  claim.timeline.forEach((event) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${event.label}</strong><small>${formatLongDate(event.date)} • ${event.note}</small>`;
    timelineList.appendChild(item);
  });

  elements.detailContent.className = "";
  elements.detailContent.innerHTML = "";
  elements.detailContent.appendChild(fragment);
}

function renderInsights() {
  const insights = buildInsights();
  elements.insightList.innerHTML = "";

  insights.forEach((insight) => {
    const item = document.createElement("article");
    item.className = "insight-item";
    item.innerHTML = `<strong>${insight.title}</strong><p>${insight.body}</p>`;
    elements.insightList.appendChild(item);
  });
}

function buildInsights() {
  const pendingDocuments = state.claims.filter((claim) => claim.status === "Pending Documents").length;
  const critical = state.claims.filter((claim) => claim.severity === "Critical").length;
  const autoClaims = state.claims.filter((claim) => claim.claimType === "Auto").length;

  return [
    {
      title: "Document completion",
      body: pendingDocuments
        ? `${pendingDocuments} claim${pendingDocuments === 1 ? "" : "s"} need supporting documents. Add automated reminders for faster decisioning.`
        : "All active claims currently have the minimum document set attached."
    },
    {
      title: "Severity monitoring",
      body: critical
        ? `${critical} critical claim${critical === 1 ? "" : "s"} should stay on an adjuster fast lane with daily reserve review.`
        : "No critical severity claims are active right now."
    },
    {
      title: "Portfolio concentration",
      body: autoClaims
        ? `Auto claims represent ${Math.round((autoClaims / state.claims.length) * 100)}% of the book, so repair-cycle communication will shape customer satisfaction.`
        : "Claim volume is spread evenly across lines of business."
    }
  ];
}

function getFilteredClaims() {
  return state.claims.filter((claim) => {
    const matchesStatus = state.filters.status === "all" || claim.status === state.filters.status;
    const haystack = `${claim.claimantName} ${claim.policyNumber} ${claim.claimType}`.toLowerCase();
    const matchesSearch = haystack.includes(state.filters.search.toLowerCase());
    return matchesStatus && matchesSearch;
  });
}

async function handleClaimSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const documents = formData.getAll("documents");
  const payload = {
    claimantName: formData.get("claimantName").trim(),
    policyNumber: formData.get("policyNumber").trim(),
    claimType: formData.get("claimType"),
    incidentDate: formData.get("incidentDate"),
    claimedAmount: Number(formData.get("claimedAmount")),
    severity: formData.get("severity"),
    description: formData.get("description").trim(),
    documents
  };

  try {
    const response = await fetch("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Failed to create claim");
    const created = await response.json();
    state.claims.unshift(created);
    state.selectedClaimId = created.id;
    event.currentTarget.reset();
    elements.formMessage.textContent = `${created.id} created for ${created.claimantName}.`;
    render();
  } catch (error) {
    elements.formMessage.textContent = "Could not submit claim. Try again.";
  }
}

function handleSearchChange(event) {
  state.filters.search = event.target.value;
  renderTable();
}

function handleStatusChange(event) {
  state.filters.status = event.target.value;
  renderTable();
}

async function reloadSampleData() {
  elements.formMessage.textContent = "Reloading demo data…";
  try {
    const response = await fetch("/api/seed", { method: "POST" });
    if (!response.ok) throw new Error();
    await fetchClaims();
    render();
    elements.formMessage.textContent = "Demo data restored from server.";
  } catch {
    elements.formMessage.textContent = "Unable to reload demo data.";
  }
}

function handlePanelJump(event) {
  const button = event.currentTarget;
  const target = button.dataset.panelTarget;

  document.querySelectorAll(".nav-link").forEach((navButton) => {
    navButton.classList.toggle("active", navButton === button);
  });

  const targetMap = {
    overview: document.getElementById("overviewPanel"),
    intake: document.getElementById("formPanel"),
    queue: document.getElementById("queuePanel"),
    insights: document.getElementById("insightsPanel")
  };

  targetMap[target]?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function severityWeight(severity) {
  const weights = {
    Low: 1,
    Medium: 2,
    High: 3,
    Critical: 4
  };
  return weights[severity] || 0;
}

function badgeClass(kind, value) {
  return `${kind}-${String(value).toLowerCase().replace(/\s+/g, "-")}`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amount);
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}
