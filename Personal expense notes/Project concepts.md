# Software Engineering & Financial Ledger Concepts Guide

This guide breaks down the core architectural, financial, and system design patterns that underpin your custom expense tracker. Understanding these concepts ensures your system is mathematically sound, resilient, and easy to maintain as it grows.

## 1. Cash Basis vs. Accrual Basis; AR vs. AP

In corporate finance, these two accounting methods track money differently:

### Cash Basis Accounting

- **The Concept:** You record revenue when you receive physical cash, and expenses only when you actually pay cash.
    
- **In Your App:** This is represented by your bank statements. When your credit card is charged, cash flows out of your account.
    

### Accrual Basis Accounting

- **The Concept:** You record revenues and expenses when the economic event occurs, regardless of when cash moves.
    
- **In Your App:** This is represented by your allocations. If Logan pays $30 for a shared pizza and your portion is $15, you have incurred an expense under the accrual method immediately; even though your credit card shows $0 cash movement.
    

### Accounts Receivable (AR) vs. Accounts Payable (AP)

- **Accounts Receivable (AR):** Money that others owe to you (assets). When you pay $120 for house groceries and Logan owes you $40, that $40 sits in your AR ledger.
    
- **Accounts Payable (AP):** Money that you owe to others (liabilities). When Logan buys dinner and you owe him $15, that $15 sits in your AP ledger until you settle up.
    

## 2. Events vs. Projections

This design pattern separates how you store data from how you read data:

```
[ Historical Fact ] ──► Stored in DB ──► [ SQL Query / Projection ] ──► Screen Display
(e.g., Transactions,                      (Calculates balances            (e.g., Logan owes
 Allocations, Settlements)                 retroactively on the fly)       you exactly $10)

```

- **Events (The Source of Truth):** You only store immutable, historical facts in your database (for example: "Darshan paid $100", "Logan consumed $40 of that purchase", "Logan paid Darshan $20"). These facts never change.
    
- **Projections (Deriving State):** Your net balances, remaining budget, and outstanding debts are derived mathematically by querying and aggregating those stored facts.
    
- **The Prime Directive:** _Never persist a number you can recompute._ If you store a running balance directly (like `logan_balance = 40`) and your code has a minor database writing bug, or if you upload transactions out of order, that balance is permanently corrupted. If you derive the balance by summing allocations and settlements, you can fix bugs in your code, recalculate, and instantly recover the perfect, correct balance.
    

## 3. Invariants (Conservation of Allocation Totals)

An **invariant** is a logical condition that must remain true at all times for your system to be considered healthy.

The primary invariant in your ledger system is the **Conservation of Allocation Totals**: the sum of all allocations for any given transaction must always equal the original amount of the transaction.

$$\sum a.\text{amount} = \text{transaction}.\text{amount}$$


### Where to Enforce This Invariant

1. **The Application Layer:** Your React UI and Next.js backend validation logic must reject any submission where the sum of roommate allocations does not match the master transaction total.
    
2. **The Database Layer:** This is your last line of defense. You can enforce this using database transactions. When splitting an expense, the update to `is_processed = true` and the insertion of the `allocations` records should happen inside a single transaction block. If any insert fails, the entire database action rolls back to prevent half-finished splits.
    

## 4. Idempotency

An operation is **idempotent** if running it multiple times produces the exact same result as running it once.

$$\text{f}(\text{x}) = \text{f}(\text{f}(\text{x}))$$

This concept is critical for imports and external API integrations:

- **In Ingestion:** If you upload your bank statement CSV for "Week 1" twice, the system must not write duplicate transaction records. You ensure this by generating a unique composite key for each row and checking for its existence before inserting.
    
- **In API Syncing:** If you sync an allocation to Splitwise and the network drops, you will retry the request. If the endpoint is not idempotent, Splitwise might post two identical expenses. You prevent this by saving Splitwise's returned transaction ID locally and checking it before firing any outbound calls.
    

## 5. Integer-Cent Money & Deterministic Rounding

Computers are notoriously terrible at performing math with floating-point numbers. In JavaScript, `0.1 + 0.2` results in `0.30000000000000004` due to binary fraction limitations. Over thousands of transactions, floating-point errors will corrupt your balances.

### The Rule: Use Integer-Cents

Always store money in the smallest currency unit (cents) as integers:

- $10.50 is stored in your database as `1050`.
    
- $100.00 is stored as `10000`. You only divide by 100 on the frontend when formatting the number for your user interface.
    

### Deterministic Rounding

If you split a $10.00 transaction three ways, $1000 / 3$ results in $333.3333$ cents. If you round normally:

- Person 1: $3.33
    
- Person 2: $3.33
    
- Person 3: $3.33
    
- **Sum of allocations:** $9.99 (This violates your conservation invariant: $9.99 is not equal to $10.00).
    

Your application must use deterministic division to handle remainders:

- Calculate base share: $1000 \ \text{div} \ 3 = 333$ cents.
    
- Calculate remainder: $1000 \ \text{mod} \ 3 = 1$ cent.
    
- Distribute the remainder cent-by-cent to the split participants until it is gone.
    
- **Result:** Person 1 pays 334 cents ($3.34), Person 2 pays 333 cents ($3.33), Person 3 pays 333 cents ($3.33). The sum of allocations equals exactly 1000 cents ($10.00), perfectly preserving the invariant.
    

## 6. State Machines over Boolean Flags

A boolean flag (like `is_processed = true`) only models binary states. Real systems are rarely binary. As your transaction state machine diagram proved, transactions have complex, multi-stage lifecycles.

Using a state machine ensures:

- **Explicit States:** The transaction is explicitly in one state at any given moment (e.g., `NEEDS_REVIEW`, `PARTIALLY_ALLOCATED`, or `ALLOCATED`).
    
- **Strict Transitions:** You define strict rules for moving between states (for example: a transaction cannot transition directly from `IMPORTED` to `RECONCILED` without being `ALLOCATED` first).
    
- **Code Reliability:** You avoid "flag hell" (e.g., trying to maintain combinations of `is_processed`, `is_duplicate`, `is_ignored` simultaneously, which quickly leads to logic conflicts).
    

## 7. Hexagonal Architecture (Ports and Adapters)

Hexagonal architecture is a design pattern that isolates your application's core business logic from its technical details (like what database, API, or UI framework you use).

```
                      +-----------------------------+
                      |        ADAPTERS LAYER       |
                      |  - Next.js UI / Forms       |
                      |  - Plaid Webhooks API       |
                      +--------------┬--------------+
                                     │
                                     ▼
                      +-----------------------------+
                      |         PORTS LAYER         |
                      |  - ITransactionIngest       |
                      |  - ISplitwiseNotifier       |
                      +--------------┬--------------+
                                     │
                                     ▼
                      +-----------------------------+
                      |         DOMAIN CORE         |
                      |  - Core Balance Formulas    |
                      |  - Invariant Checking Math  |
                      |  - State Machine Transition |
                      +-----------------------------+

```

- **The Core:** At the center lies your domain logic (the ledger formulas, the rounding rules, the transaction state transition paths). It does not know or care about databases, React, Plaid, or Splitwise.
    
- **Ports (Interfaces):** Boundary lines defined by your core. For example, "I need a way to fetch transactions (Port A) and a way to notify roommates (Port B)."
    
- **Adapters (Implementation):** The technical implementations.
    
    - Your CSV file parser is an Adapter that plugs into Port A. Later, your Plaid webhook service is a new Adapter that plugs into the exact same Port A.
        
    - Your database engine is an Adapter.
        
    - The Splitwise API client is an Adapter that plugs into Port B.
        

### Why This is Highly Value for You

If Splitwise decides to close its API, or if you want to switch your database from PostgreSQL to MySQL, you only rewrite the specific Adapter. Your core ledger logic remains entirely untouched, keeping your application safe, clean, and highly modular.