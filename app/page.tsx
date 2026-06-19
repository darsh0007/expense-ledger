import {
  listAccounts,
  listPeople,
  listRecentTransactions,
  listTrashedTransactions,
  purgeTrashedBefore,
} from "../src/repository/ledger.js";
import { computePeriodSummary } from "../src/services/reporting.js";
import {
  addPerson,
  addPurchase,
  addSettlement,
  destroyTransaction,
  removeTransaction,
  undoRemoveTransaction,
} from "./actions.js";
import { ConfirmButton } from "./ConfirmButton.js";

// Always render on each request with fresh data from Neon (no static caching).
export const dynamic = "force-dynamic";

const PERIOD_ID = "budget-2026-07";

/** How long a deleted transaction stays recoverable in the Trash. */
const TRASH_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function fmt(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export default async function DashboardPage() {
  // Empty the recycle bin of anything older than the retention window first, so
  // the Trash list below never shows an item that's about to vanish.
  await purgeTrashedBefore(new Date(Date.now() - TRASH_RETENTION_DAYS * DAY_MS));

  // Read path: Service -> Repository -> Domain, exactly like the report script.
  const [summary, people, accounts, recent, trashed] = await Promise.all([
    computePeriodSummary(PERIOD_ID),
    listPeople(),
    listAccounts(),
    listRecentTransactions(8),
    listTrashedTransactions(),
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
              <li key={t.id} className="row activity" style={{ padding: "8px 0" }}>
                <span className="label">
                  {t.merchant ?? "(no merchant)"}
                  <span className="muted">
                    {" "}· {t.expenseDate.toISOString().slice(0, 10)}
                  </span>
                </span>
                <span className="activity-right">
                  <span className="value">{fmt(t.amountCents)}</span>
                  <form action={removeTransaction} className="inline-delete">
                    <input type="hidden" name="transactionId" value={t.id} />
                    <ConfirmButton
                      className="delete"
                      message="Move this transaction to Trash?"
                      ariaLabel="Delete transaction"
                      title="Delete"
                    >
                      ✕
                    </ConfirmButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {trashed.length > 0 && (
        <section className="card">
          <h2>Trash ({trashed.length})</h2>
          <p className="muted hint" style={{ marginTop: 0, marginBottom: 12 }}>
            Deleted items are kept for {TRASH_RETENTION_DAYS} days, then removed
            automatically.
          </p>
          <ul className="people">
            {trashed.map((t) => {
              const daysLeft = Math.max(
                0,
                TRASH_RETENTION_DAYS -
                  Math.floor((Date.now() - t.deletedAt.getTime()) / DAY_MS),
              );
              return (
                <li
                  key={t.id}
                  className="row activity"
                  style={{ padding: "8px 0" }}
                >
                  <span className="label">
                    {t.merchant ?? "(no merchant)"}
                    <span className="muted">
                      {" "}· {t.expenseDate.toISOString().slice(0, 10)} ·{" "}
                      {daysLeft}d left
                    </span>
                  </span>
                  <span className="activity-right">
                    <span className="value">{fmt(t.amountCents)}</span>
                    <form action={undoRemoveTransaction} className="inline-delete">
                      <input type="hidden" name="transactionId" value={t.id} />
                      <button type="submit" className="restore" title="Restore">
                        ↩
                      </button>
                    </form>
                    <form action={destroyTransaction} className="inline-delete">
                      <input type="hidden" name="transactionId" value={t.id} />
                      <ConfirmButton
                        className="delete"
                        message="Permanently delete this transaction? This cannot be undone."
                        ariaLabel="Delete forever"
                        title="Delete forever"
                      >
                        ✕
                      </ConfirmButton>
                    </form>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
        <h2>Settle up</h2>
        {people.filter((p) => !p.isMe).length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Add a person first to record a repayment.
          </p>
        ) : (
          <form className="purchase" action={addSettlement}>
            <div className="field-row">
              <div className="field">
                <label htmlFor="settle-person">Person</label>
                <select id="settle-person" name="personId" defaultValue="">
                  <option value="" disabled>
                    — who —
                  </option>
                  {people
                    .filter((p) => !p.isMe)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="settle-direction">Direction</label>
                <select
                  id="settle-direction"
                  name="direction"
                  defaultValue="they_paid_me"
                >
                  <option value="they_paid_me">They paid me</option>
                  <option value="i_paid_them">I paid them</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="settle-amount">Amount</label>
                <input
                  id="settle-amount"
                  name="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="settle-method">Method</label>
                <select id="settle-method" name="method" defaultValue="e_transfer">
                  <option value="e_transfer">E-transfer</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="offset">Offset</option>
                  <option value="splitwise">Splitwise</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="settle-date">Date</label>
              <input
                id="settle-date"
                name="settlementDate"
                type="date"
                defaultValue={today}
              />
            </div>
            <div className="field">
              <label htmlFor="settle-note">Note (required if it overpays)</label>
              <input
                id="settle-note"
                name="note"
                placeholder="optional"
                maxLength={200}
                autoComplete="off"
              />
            </div>
            <button type="submit">Record settlement</button>
          </form>
        )}
        <p className="muted hint">
          A settlement clears a balance &mdash; it never counts toward your
          budget. Repaying more than what&apos;s owed needs a note.
        </p>
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
