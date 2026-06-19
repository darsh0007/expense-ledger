import { listPeople } from "../src/repository/ledger.js";
import { computePeriodSummary } from "../src/services/reporting.js";
import { addPerson } from "./actions.js";

// Always render on each request with fresh data from Neon (no static caching).
export const dynamic = "force-dynamic";

const PERIOD_ID = "budget-2026-07";

function fmt(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export default async function DashboardPage() {
  // Read path: Service -> Repository -> Domain, exactly like the report script.
  const [summary, people] = await Promise.all([
    computePeriodSummary(PERIOD_ID),
    listPeople(),
  ]);

  const nameById = new Map(people.map((p) => [p.id, p.displayName]));
  const balances = [...summary.balances.entries()];
  const me = people.find((p) => p.isMe);

  return (
    <main>
      <h1>Expense Ledger</h1>
      <p className="subtitle">
        {me ? `${me.displayName}'s personal budget` : "Personal budget"} ·{" "}
        {summary.periodId}
      </p>

      <section className="card">
        <h2>Personal spend this period</h2>
        <div className="row" style={{ borderTop: "none", paddingTop: 0 }}>
          <span className="big accent">{fmt(summary.budget.spentCents)}</span>
          <span className="muted">of {fmt(summary.budget.limitCents)}</span>
        </div>
        <div className="row">
          <span className="label">Remaining</span>
          <span
            className={`value ${
              summary.budget.remainingCents < 0 ? "bad" : "good"
            }`}
          >
            {fmt(summary.budget.remainingCents)}
          </span>
        </div>
        <div className="row">
          <span className="label">Unreviewed exposure</span>
          <span className="value">{fmt(summary.unreviewedExposureCents)}</span>
        </div>
      </section>

      <section className="card">
        <h2>Balances (positive = they owe me)</h2>
        {balances.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No outstanding balances — everyone is settled.
          </p>
        ) : (
          balances.map(([personId, cents]) => (
            <div className="row" key={personId}>
              <span className="label">{nameById.get(personId) ?? personId}</span>
              <span className={`value ${cents >= 0 ? "good" : "bad"}`}>
                {cents >= 0
                  ? `owes me ${fmt(cents)}`
                  : `I owe ${fmt(-cents)}`}
              </span>
            </div>
          ))
        )}
      </section>

      <section className="card">
        <h2>People ({people.length})</h2>
        <form className="add-person" action={addPerson}>
          <input
            name="displayName"
            placeholder="Add a person (e.g. a new roommate)…"
            aria-label="New person name"
            maxLength={80}
            required
          />
          <button type="submit">Add</button>
        </form>
        <ul className="people">
          {people.map((p) => (
            <li key={p.id}>
              {p.displayName}
              {p.isMe && <span className="badge">me</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
