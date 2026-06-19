
# Software Architecture: Demystifying the Repository Layer and Other Application Layers

When building a small app, you can write all your code in one file. However, as your system grows, this turns into "spaghetti code" where a single change can break things in unexpected places.

To prevent this, engineers divide applications into **layers**. Each layer has a single, highly focused responsibility and speaks only to the layers directly next to it.

## 1. What is the Repository Layer?

The **Repository Layer** is the dedicated layer that handles data persistence. It acts as an in-memory collection of your domain objects, hiding the messy details of SQL queries, database connections, and ORMs from the rest of your application.

### Why do we need it if we already use Prisma?

You might think: _"If Prisma already lets me query the database, why do I need a Repository Layer?"_ If you write Prisma code directly inside your Next.js API routes or React components, your entire application becomes tightly coupled to Prisma. If you ever decide to switch from Prisma to Drizzle, or if you need to mock your database during unit tests, you would have to rewrite every single file in your codebase.

The Repository Layer acts as a buffer.

### Before and After the Repository Layer

- **Without a Repository Layer (Coupled):** Your business logic directly calls Prisma:
    
    ```
    // Inside your business logic file:
    const transactions = await prisma.transaction.findMany({
      where: { status: 'needs_review' }
    });
    ```
    
- **With a Repository Layer (Decoupled):** You define an interface (a contract) and hide Prisma behind it:
    
    ```
    // 1. The Interface (The Port)
    interface ITransactionRepository {
      getPendingTransactions(): Promise<Transaction[]>;
    }
    
    // 2. The Implementation (The Adapter)
    class PrismaTransactionRepository implements ITransactionRepository {
      async getPendingTransactions() {
        return await prisma.transaction.findMany({
          where: { status: 'needs_review' }
        });
      }
    }
    ```
    
    Now, your business logic only cares about `getPendingTransactions()`. It does not know (or care) if the data comes from PostgreSQL, MongoDB, an external API, or a mock file in memory.
    

## 2. The Other Key Layers

In a standard clean or hexagonal architecture, your code is organized into four primary layers. Let's look at them from the inside out:

```
+-------------------------------------------------------------+
| 1. DOMAIN LAYER (Calculations, invariants, business rules)   |
+------------------------------▲------------------------------+
                               │
+------------------------------┴------------------------------+
| 2. REPOSITORY LAYER (Data access, database translation)      |
+------------------------------▲------------------------------+
                               │
+------------------------------┴------------------------------+
| 3. SERVICE / APPLICATION LAYER (Use cases, orchestration)   |
+------------------------------▲------------------------------+
                               │
+------------------------------┴------------------------------+
| 4. PRESENTATION / ADAPTER LAYER (UI, API Routes, webhooks)  |
+-------------------------------------------------------------+
```

### Layer 1: The Domain Core (The Brain)

- **What it does:** This layer contains your core business rules, math formulas, and system invariants.
    
- **Key characteristic:** It must be **completely pure**. It cannot import Prisma, talk to the database, make network requests, or know anything about Next.js. It is raw, ultra-fast TypeScript.
    
- **Ledger Example:** The mathematical engine that splits a $10.00 transaction three ways and outputs `$3.34`, `$3.33`, and `$3.33` (handling the remainder cent) belongs in this layer.
    

### Layer 2: The Repository Layer (The Data Gatekeeper)

- **What it does:** Read and write operations. It takes database rows and maps them into pure domain objects that the Domain Layer can use.
    
- **Ledger Example:** Fetching all outstanding transactions for a specific user from your Neon PostgreSQL instance.

**MY NOTE:** repository layer is just a person who talks between backend and database

### Layer 3: The Service/Application Layer (The Coordinator)

- **What it does:** Orchestrates the flow of data. It fetches a record using the Repository Layer, passes it to the Domain Layer to run some math, and then saves the result back to the database.
    
- **Ledger Example:** The `ImportCSVUseCase`. This service reads raw rows, calls the duplicate detection logic, runs the transaction creation logic, and updates the database.
    

### Layer 4: The Presentation/Adapter Layer (The Interface)

- **What it does:** Interacts with the outside world. This includes your React UI components, Next.js API endpoints (`/api/transactions/upload`), and cron jobs.
    
- **Ledger Example:** A React page containing an upload form where you drag and drop your bank statement CSV.
    

## 3. How a Simple Request Travels Through the Layers

Let us trace what happens when you click "Confirm Split" on a $15 shared meal:

1. **Presentation Layer:** The React UI catches your click and sends a `POST` request to `/api/transactions/split` with the allocation instructions.
    
2. **Service Layer:** The Next.js API route receives the request and triggers the `SplitTransactionUseCase` service.
    
3. **Repository Layer:** The service asks the repository to load the target `Transaction` from your Postgres database.
    
4. **Domain Layer:** The transaction details are passed to your domain validator to ensure the proposed roommate splits sum up to exactly $15.00 (enforcing your conservation invariant).
    
5. **Service Layer:** Once the domain logic approves the math, the service takes the new allocation objects and sends them to the Repository Layer.
    
6. **Repository Layer:** The repository writes the new allocations to PostgreSQL and updates the transaction's status to `ALLOCATED` inside a database transaction block.
    
7. **Presentation Layer:** The API route returns a `200 OK` response, and your React screen updates to show a successful split.

``` mermaid
flowchart LR
    DB[(Neon Postgres)] --> R[Repository<br/>ledger.ts + mappers.ts]
    R --> S[Service<br/>reporting.ts]
    S --> D[Domain<br/>budget / balances / exposure]
    R -.only layer that<br/>imports prisma.-> R
```

### The three files, one job each

**1. `mappers.ts` — the translator (pure, no I/O).**  
A Prisma row and a domain object look _similar_ but aren't the same thing. The DB calls a column `refundOfId`; the domain calls the concept `refundOfTransactionId`. The DB hands you its own generated enum types; the domain wants its own string-union types. The mapper is the single place that knows both vocabularies and converts one to the other:

```
// row.refundOfId  ->  refundOfTransactionId
```

Why bother instead of passing Prisma rows straight into the domain? Because the moment the domain imports a Prisma type, it's **welded to your database schema forever.** Rename a column and your business logic breaks. The mapper is a firewall: schema churn stops here. (Notice mappers are _pure_ — they take a row, return an object, touch no database. That keeps them trivially testable too.)

**2. `ledger.ts` — the repository (the _only_ Prisma-aware file).**  
This is the one place in the entire app allowed to say [prisma.something.findMany(...)](vscode-file://vscode-app/c:/Users/JainDa/AppData/Local/Programs/Microsoft%20VS%20Code/fcf604774b/resources/app/out/vs/code/electron-browser/workbench/workbench.html). That constraint is the whole point — it's a discipline, not a limitation. If a teammate later wonders "where do we read transactions from the DB?", the answer is always _one file_. Key functions:

- `getMe()` — finds the single `isMe` person, and **throws if there isn't one.** That throw is intentional: a ledger with no "me" is a broken invariant, and failing loudly beats silently computing garbage.
- `loadLedger()` — pulls transactions, allocations, and settlements **in parallel** ([Promise.all](vscode-file://vscode-app/c:/Users/JainDa/AppData/Local/Programs/Microsoft%20VS%20Code/fcf604774b/resources/app/out/vs/code/electron-browser/workbench/workbench.html)), then runs each through the mappers. Parallel because the three queries don't depend on each other, so there's no reason to wait for one before starting the next.

**3. `reporting.ts` — the service (the orchestrator).**  
A service answers a _use-case_ question: "give me the full picture for this budget period." It doesn't compute anything itself — it **coordinates**:

```
getMe()  ->  getBudgetPeriod(id)  ->  loadLedger()
        then hand all that to  computeBudget / computeBalances / computeUnreviewedExposure
        return one tidy PeriodSummary
```
This is the seam your future code will call. A Next.js API route, a server component, a CLI — they all call
``` 
[computePeriodSummary(periodId)]
```

and never see Prisma or domain internals. One function, one clean contract.