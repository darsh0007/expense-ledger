import {
  listAccounts,
  listPeople,
  listRecentTransactions,
} from "../src/repository/ledger.js";
import { computePeriodSummary } from "../src/services/reporting.js";
import { addPerson, addPurchase } from "./actions.js";

// Always render on each request with fresh data from Neon (no static caching).
export const dynamic = "force-dynamic";

const PERIOD_ID = "budget-2026-07";

function fmt(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export default async function DashboardPage() {
  // Read path: Service -> Repository -> Domain, exactly like the report script.
  const [summary, people, accounts, recent] = await Promise.all([
    computePeriodSummary(PERIOD_ID),
    listPeople(),
    listAccounts(),
    listRecentTransactions(8),
  ]);

  const nameById = new Map(people.map((p) => [p.id, p.displayName]));
  const balances = [...summary.balances.entries()];
  const me = people.find((p) => p.isMe);
  const today = new Date().toISOString().slice(0, 10);

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
        <h2>Record a purchase</h2>
        <form className="purchase" action={addPurchase}>
          <div className="field">
            <label htmlFor="amount">Amount</label>
            <input
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="merchant">Merchant / note</label>
            <input
              id="merchant"
              name="merchant"
              placeholder="e.g. Costco groceries"
              maxLength={120}
              autoComplete="off"
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="expenseDate">Date</label>
              <input
                id="expenseDate"
                name="expenseDate"
                type="date"
                defaultValue={today}
              />
            </div>
            <div className="field">
              <label htmlFor="paymentAccountId">Paid with</label>
              <select id="paymentAccountId" name="paymentAccountId" defaultValue="">
                <option value="">— account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Split equally between</label>
            <div className="participants">
              {people.map((p) => (
                <label key={p.id} className="check">
                  <input
                    type="checkbox"
                    name="participants"
                    value={p.id}
                    defaultChecked={p.isMe}
                  />
                  {p.displayName}
                </label>
              ))}
            </div>
          </div>
          <button type="submit">Record purchase</button>
        </form>
        <p className="muted hint">
          Only your own share counts toward the ${""}
          {(summary.budget.limitCents / 100).toFixed(0)} budget; everyone else&apos;s
          share becomes what they owe you.
        </p>
      </section>

      <section className="card">
        <h2>Recent activity</h2>
        {recent.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing recorded yet.
          </p>
        ) : (
          <ul className="people">
            {recent.map((t) => (
              <li key={t.id} className="row" style={{ padding: "8px 0" }}>
                <span className="label">
                  {t.merchant ?? "(no merchant)"}
                  <span className="muted">
                    {" "}· {t.expenseDate.toISOString().slice(0, 10)}
                  </span>
                </span>
                <span className="value">{fmt(t.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
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
