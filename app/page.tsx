import {
  listAccounts,
  listBudgetPeriods,
  listCategories,
  listPeople,
  listRecentSettlements,
  listRecentTransactions,
  listReviewQueue,
  listTrashedTransactions,
  purgeTrashedBefore,
  spendByCategory,
} from "../src/repository/ledger.js";
import { computePeriodSummary } from "../src/services/reporting.js";
import {
  addBudgetPeriod,
  addCategory,
  addPerson,
  addPurchase,
  addCustomPurchase,
  addSettlement,
  destroyTransaction,
  editTransaction,
  importStatement,
  refundTransaction,
  removePerson,
  removeSettlement,
  removeTransaction,
  renamePerson,
  reviewAllocateToMe,
  reviewIgnore,
  reviewSplitEqually,
  undoRemoveTransaction,
} from "./actions.js";
import { ConfirmButton } from "./ConfirmButton.js";
import type { BudgetPeriod } from "../src/domain/index.js";

// Always render on each request with fresh data from Neon (no static caching).
export const dynamic = "force-dynamic";

/** How long a deleted transaction stays recoverable in the Trash. */
const TRASH_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmt(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** Human label for a period, e.g. "July 2026". */
function periodLabel(p: BudgetPeriod): string {
  return `${MONTHS[p.startDate.getUTCMonth()]} ${p.startDate.getUTCFullYear()}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  // Empty the recycle bin of anything older than the retention window first, so
  // the Trash list below never shows an item that's about to vanish.
  await purgeTrashedBefore(new Date(Date.now() - TRASH_RETENTION_DAYS * DAY_MS));

  const { period: requestedPeriod } = await searchParams;
  const periods = await listBudgetPeriods();

  // Pick the period to show: the one in the URL if valid, else the one covering
  // today, else the most recent. (Periods come back oldest-first.)
  const todayKey = new Date().toISOString().slice(0, 10);
  const covering = periods.find(
    (p) =>
      p.startDate.toISOString().slice(0, 10) <= todayKey &&
      todayKey <= p.endDate.toISOString().slice(0, 10),
  );
  const requested = periods.find((p) => p.id === requestedPeriod);
  const selected = requested ?? covering ?? periods[periods.length - 1];

  // No periods yet: offer to create the first one and stop.
  if (!selected) {
    return (
      <main>
        <h1>Expense Ledger</h1>
        <p className="subtitle">No budget period yet — create one to begin.</p>
        <section className="card">
          <h2>New budget period</h2>
          <form action={addBudgetPeriod} className="period-new">
            <input type="month" name="month" required />
            <input
              name="limit"
              inputMode="decimal"
              placeholder="limit e.g. 800"
              autoComplete="off"
              required
            />
            <button type="submit">Add month</button>
          </form>
        </section>
      </main>
    );
  }

  // Read path: Service -> Repository -> Domain, exactly like the report script.
  const [summary, people, accounts, recent, trashed, reviewQueue, settlements, categories] = await Promise.all([
    computePeriodSummary(selected.id),
    listPeople(),
    listAccounts(),
    listRecentTransactions(8),
    listTrashedTransactions(),
    listReviewQueue(),
    listRecentSettlements(8),
    listCategories(),
  ]);

  const nameById = new Map(people.map((p) => [p.id, p.displayName]));
  const balances = [...summary.balances.entries()];
  const me = people.find((p) => p.isMe);
  const today = new Date().toISOString().slice(0, 10);
  const categorySpend = me ? await spendByCategory(selected.id, me.id) : [];

  return (
    <main>
      <h1>Expense Ledger</h1>
      <p className="subtitle">
        {me ? `${me.displayName}'s personal budget` : "Personal budget"} ·{" "}
        {periodLabel(selected)}
      </p>

      <section className="card">
        <h2>Budget period</h2>
        <form method="get" className="period-switch">
          <select name="period" defaultValue={selected.id}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {periodLabel(p)} — {fmt(p.limitCents)}
              </option>
            ))}
          </select>
          <button type="submit">View</button>
        </form>
        <form action={addBudgetPeriod} className="period-new">
          <input type="month" name="month" required />
          <input
            name="limit"
            inputMode="decimal"
            placeholder="limit e.g. 800"
            autoComplete="off"
            required
          />
          <button type="submit">Add month</button>
        </form>
      </section>

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
        <h2>Spending by category</h2>
        {categorySpend.length === 0 ? (
          <p className="muted" style={{ margin: "0 0 12px" }}>
            No categorized spending this period yet.
          </p>
        ) : (
          <ul className="people">
            {categorySpend.map((c) => {
              const pct =
                summary.budget.spentCents > 0
                  ? Math.round((c.cents / summary.budget.spentCents) * 100)
                  : 0;
              return (
                <li
                  key={c.categoryId ?? "none"}
                  className="row activity"
                  style={{ padding: "8px 0" }}
                >
                  <span className="label">
                    {c.name}
                    <span className="muted"> · {pct}%</span>
                  </span>
                  <span className="value">{fmt(c.cents)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <form action={addCategory} className="add-person">
          <input
            name="name"
            placeholder="Add a category (e.g. Groceries)…"
            aria-label="New category name"
            maxLength={60}
            required
          />
          <button type="submit">Add</button>
        </form>
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
            <label htmlFor="categoryId">Category</label>
            <select id="categoryId" name="categoryId" defaultValue="">
              <option value="">— uncategorized —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
        <h2>Record a custom split</h2>
        <form className="purchase" action={addCustomPurchase}>
          <div className="field">
            <label htmlFor="custom-merchant">Merchant / note</label>
            <input
              id="custom-merchant"
              name="merchant"
              placeholder="e.g. dinner — uneven shares"
              maxLength={120}
              autoComplete="off"
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="custom-date">Date</label>
              <input
                id="custom-date"
                name="expenseDate"
                type="date"
                defaultValue={today}
              />
            </div>
            <div className="field">
              <label htmlFor="custom-account">Paid with</label>
              <select id="custom-account" name="paymentAccountId" defaultValue="">
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
            <label>Each person&apos;s share ($)</label>
            <div className="shares">
              {people.map((p) => (
                <div key={p.id} className="share-row">
                  <span className="share-name">
                    {p.displayName}
                    {p.isMe && <span className="badge">me</span>}
                  </span>
                  <input
                    name={`amount_${p.id}`}
                    inputMode="decimal"
                    placeholder="0.00"
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
          </div>
          <button type="submit">Record custom split</button>
        </form>
        <p className="muted hint">
          The total is whatever the shares add up to. Leave someone blank to
          exclude them. Your share is the only part that hits your budget.
        </p>
      </section>

      <section className="card">
        <h2>Import statement (CSV)</h2>
        <form className="purchase" action={importStatement}>
          <div className="field">
            <label htmlFor="csv-file">Upload CSV file</label>
            <input id="csv-file" name="file" type="file" accept=".csv,text/csv" />
          </div>
          <div className="field">
            <label htmlFor="csv-text">…or paste rows</label>
            <textarea
              id="csv-text"
              name="csv"
              rows={4}
              placeholder={"Date,Description,Amount\n2026-07-01,Costco,123.45"}
            />
          </div>
          <button type="submit">Import</button>
        </form>
        <p className="muted hint">
          Imported rows land in the review queue as &ldquo;needs review&rdquo;.
          They don&apos;t touch your budget until you decide who they belong to.
        </p>
      </section>

      {reviewQueue.length > 0 && (
        <section className="card">
          <h2>Review queue ({reviewQueue.length})</h2>
          <p className="muted hint" style={{ marginTop: 0, marginBottom: 12 }}>
            Decide who each imported charge belongs to.
          </p>
          <ul className="people">
            {reviewQueue.map((t) => (
              <li
                key={t.id}
                className="row activity"
                style={{ padding: "10px 0" }}
              >
                <span className="label">
                  {t.merchant ?? "(no merchant)"}
                  <span className="muted">
                    {" "}· {t.expenseDate.toISOString().slice(0, 10)}
                  </span>
                </span>
                <span className="activity-right">
                  <span className="value">{fmt(t.amountCents)}</span>
                  <form action={reviewAllocateToMe} className="inline-delete">
                    <input type="hidden" name="transactionId" value={t.id} />
                    <button type="submit" className="review-mine" title="All mine">
                      Mine
                    </button>
                  </form>
                  <details className="edit-pop">
                    <summary
                      className="edit-toggle"
                      title="Split with friends"
                      aria-label="Split with friends"
                    >
                      ÷
                    </summary>
                    <form action={reviewSplitEqually} className="edit-form">
                      <input type="hidden" name="transactionId" value={t.id} />
                      <span className="muted" style={{ fontSize: "0.78rem" }}>
                        Split equally between:
                      </span>
                      <div className="split-people">
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
                      <button type="submit" className="review-mine">
                        Split
                      </button>
                    </form>
                  </details>
                  <form action={reviewIgnore} className="inline-delete">
                    <input type="hidden" name="transactionId" value={t.id} />
                    <button
                      type="submit"
                      className="review-ignore"
                      title="Not my spending"
                    >
                      Ignore
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
                  <details className="edit-pop">
                    <summary
                      className="edit-toggle"
                      title="Edit"
                      aria-label="Edit transaction"
                    >
                      ✎
                    </summary>
                    <form action={editTransaction} className="edit-form">
                      <input type="hidden" name="transactionId" value={t.id} />
                      <label>
                        Amount
                        <input
                          name="amount"
                          defaultValue={(t.amountCents / 100).toFixed(2)}
                          readOnly={t.allocationCount > 1}
                          inputMode="decimal"
                        />
                      </label>
                      <label>
                        Merchant
                        <input
                          name="merchant"
                          defaultValue={t.merchant ?? ""}
                          maxLength={120}
                        />
                      </label>
                      <label>
                        Date
                        <input
                          type="date"
                          name="expenseDate"
                          defaultValue={t.expenseDate.toISOString().slice(0, 10)}
                        />
                      </label>
                      {t.allocationCount > 1 && (
                        <p className="muted hint">
                          Split across people — delete &amp; re-add to change the
                          total.
                        </p>
                      )}
                      <button type="submit" className="review-mine">
                        Save
                      </button>
                    </form>
                  </details>
                  {t.type === "purchase" && t.status !== "refunded" && (
                    <form action={refundTransaction} className="inline-delete">
                      <input type="hidden" name="transactionId" value={t.id} />
                      <ConfirmButton
                        className="refund"
                        message="Record a full refund of this purchase?"
                        ariaLabel="Refund transaction"
                        title="Refund"
                      >
                        ↺
                      </ConfirmButton>
                    </form>
                  )}
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

      {settlements.length > 0 && (
        <section className="card">
          <h2>Settlement history</h2>
          <ul className="people">
            {settlements.map((s) => {
              const fromMe = me ? s.fromPersonId === me.id : false;
              const arrow = fromMe
                ? `You → ${s.toName}`
                : `${s.fromName} → You`;
              return (
                <li
                  key={s.id}
                  className="row activity"
                  style={{ padding: "8px 0" }}
                >
                  <span className="label">
                    {arrow}
                    <span className="muted">
                      {" "}
                      · {s.settlementDate.toISOString().slice(0, 10)} ·{" "}
                      {s.method.replace("_", "-")}
                      {s.note ? ` · ${s.note}` : ""}
                    </span>
                  </span>
                  <span className="activity-right">
                    <span className="value">{fmt(s.amountCents)}</span>
                    <form action={removeSettlement} className="inline-delete">
                      <input type="hidden" name="settlementId" value={s.id} />
                      <ConfirmButton
                        className="delete"
                        message="Delete this settlement? The balance will revert."
                        ariaLabel="Delete settlement"
                        title="Delete"
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
            <li key={p.id} className="person-row">
              <form action={renamePerson} className="rename">
                <input type="hidden" name="personId" value={p.id} />
                <input
                  name="displayName"
                  defaultValue={p.displayName}
                  aria-label="Name"
                  maxLength={80}
                />
                <button type="submit" className="review-mine">
                  Save
                </button>
              </form>
              {p.isMe ? (
                <span className="badge">me</span>
              ) : (
                <form action={removePerson} className="inline-delete">
                  <input type="hidden" name="personId" value={p.id} />
                  <ConfirmButton
                    className="delete"
                    message={`Remove ${p.displayName}? Only allowed if they have no activity.`}
                    ariaLabel="Remove person"
                    title="Remove"
                  >
                    ✕
                  </ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
