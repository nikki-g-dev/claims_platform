const fs = require("fs");
const path = require("path");
const express = require("express");
const compression = require("compression");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "claims.db");

ensureDataDir();
const db = new Database(DB_FILE);
initializeDatabase(db);

app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

app.get("/api/claims", (req, res) => {
  const rows = db.prepare("SELECT data FROM claims ORDER BY created_at DESC").all();
  res.json(rows.map(rowToClaim));
});

app.get("/api/claims/:id", (req, res) => {
  const row = db.prepare("SELECT data FROM claims WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(rowToClaim(row));
});

app.post("/api/claims", (req, res) => {
  const claim = normalizeClaim(req.body, nextClaimId());
  saveClaim(claim);
  res.status(201).json(claim);
});

app.patch("/api/claims/:id", (req, res) => {
  const row = db.prepare("SELECT data FROM claims WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const current = rowToClaim(row);
  const updated = { ...current, ...req.body, id: current.id };
  saveClaim(updated);
  res.json(updated);
});

app.post("/api/seed", (req, res) => {
  db.prepare("DELETE FROM claims").run();
  seedClaims().forEach(saveClaim);
  res.json({ status: "seeded", total: countClaims() });
});

app.listen(PORT, () => {
  console.log(`Claims Platform API running on http://localhost:${PORT}`);
});

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
}

function initializeDatabase(dbInstance) {
  dbInstance
    .prepare(
      `
        CREATE TABLE IF NOT EXISTS claims (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s','now'))
        );
      `
    )
    .run();

  if (countClaims() === 0) {
    seedClaims().forEach(saveClaim);
  }
}

function countClaims() {
  const row = db.prepare("SELECT COUNT(*) as count FROM claims").get();
  return row.count;
}

function rowToClaim(row) {
  return JSON.parse(row.data);
}

function saveClaim(claim) {
  const payload = JSON.stringify(claim);
  db.prepare(
    `
      INSERT INTO claims (id, data, created_at)
      VALUES (@id, @data, @created_at)
      ON CONFLICT(id) DO UPDATE SET data=@data
    `
  ).run({
    id: claim.id,
    data: payload,
    created_at: claim.createdAt || Math.floor(Date.now() / 1000)
  });
}

function nextClaimId() {
  const row = db.prepare("SELECT id FROM claims ORDER BY CAST(substr(id, 5) AS INTEGER) DESC LIMIT 1").get();
  if (!row) return "CLM-24001";
  const numeric = Number(row.id.replace("CLM-", "")) + 1;
  return `CLM-${numeric}`;
}

function normalizeClaim(body, id) {
  const now = new Date().toISOString().slice(0, 10);
  const documents = Array.isArray(body.documents) ? body.documents : [];
  const status = documents.length >= 2 ? "Submitted" : body.status || "Pending Documents";
  return {
    id,
    claimantName: body.claimantName?.trim() || "New claimant",
    policyNumber: body.policyNumber?.trim() || "POL-00000",
    claimType: body.claimType || "Auto",
    incidentDate: body.incidentDate || now,
    claimedAmount: Number(body.claimedAmount || 0),
    severity: body.severity || "Low",
    status,
    description: body.description || "No description provided.",
    documents,
    timeline:
      body.timeline ||
      [
        {
          label: "Claim submitted",
          date: now,
          note: "Claim created from intake form."
        }
      ],
    nextActions:
      body.nextActions ||
      (documents.length >= 2
        ? ["Assign claim owner", "Verify coverage", "Review reserve amount"]
        : ["Request missing documentation", "Verify coverage"])
  };
}

function seedClaims() {
  return [
    {
      id: "CLM-24018",
      claimantName: "Ariana Patel",
      policyNumber: "AUTO-10293",
      claimType: "Auto",
      incidentDate: "2026-03-26",
      claimedAmount: 8400,
      severity: "High",
      status: "In Review",
      description:
        "Rear-end collision during heavy rain. Vehicle needs body work, bumper replacement, and sensor recalibration.",
      documents: ["Claim form", "Photo evidence", "Police report", "Repair estimate"],
      timeline: [
        { label: "Claim submitted", date: "2026-03-26", note: "FNOL received via mobile intake." },
        { label: "Coverage verified", date: "2026-03-27", note: "Policy active with collision coverage." },
        { label: "Assigned to adjuster", date: "2026-03-28", note: "Escalated for parts delay review." }
      ],
      nextActions: ["Confirm rental car eligibility", "Approve repair estimate", "Contact body shop for timeline"]
    },
    {
      id: "CLM-24019",
      claimantName: "Marcus Chen",
      policyNumber: "HOME-44180",
      claimType: "Property",
      incidentDate: "2026-03-20",
      claimedAmount: 16200,
      severity: "Critical",
      status: "Pending Documents",
      description:
        "Kitchen pipe burst caused cabinet and flooring damage. Temporary mitigation completed, final contractor bid still pending.",
      documents: ["Claim form", "Photo evidence"],
      timeline: [
        { label: "Claim submitted", date: "2026-03-21", note: "Emergency mitigation vendor dispatched." },
        { label: "Inspection scheduled", date: "2026-03-22", note: "On-site review planned within 24 hours." },
        { label: "Documents outstanding", date: "2026-03-24", note: "Awaiting contractor estimate and plumbing invoice." }
      ],
      nextActions: ["Collect contractor bid", "Set reserve after estimate", "Confirm mold prevention steps"]
    },
    {
      id: "CLM-24020",
      claimantName: "Natalie Brooks",
      policyNumber: "HLTH-77129",
      claimType: "Health",
      incidentDate: "2026-03-14",
      claimedAmount: 3200,
      severity: "Medium",
      status: "Approved",
      description:
        "Outpatient procedure reimbursement after pre-authorization confirmation and itemized billing review.",
      documents: ["Claim form", "Medical report"],
      timeline: [
        { label: "Claim submitted", date: "2026-03-15", note: "Digital reimbursement packet received." },
        { label: "Clinical review", date: "2026-03-17", note: "Procedure matched approved treatment plan." },
        { label: "Approved for payment", date: "2026-03-19", note: "Payment released to claimant." }
      ],
      nextActions: ["Send EOB summary", "Confirm member received payment"]
    },
    {
      id: "CLM-24021",
      claimantName: "David Romero",
      policyNumber: "TRVL-22091",
      claimType: "Travel",
      incidentDate: "2026-03-29",
      claimedAmount: 1800,
      severity: "Low",
      status: "Submitted",
      description:
        "Flight cancellation and overnight stay caused additional lodging and meal expenses during business travel.",
      documents: ["Claim form", "Photo evidence"],
      timeline: [{ label: "Claim submitted", date: "2026-03-30", note: "Receipts attached for hotel and meals." }],
      nextActions: ["Verify trip cancellation reason", "Review receipt eligibility"]
    }
  ];
}
