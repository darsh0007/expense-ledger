import { describe, expect, it } from "vitest";
import { parseStatementCsv } from "./import.js";

describe("parseStatementCsv", () => {
  it("parses a header + rows with YYYY-MM-DD dates", () => {
    const rows = parseStatementCsv(
      ["Date,Description,Amount", "2026-07-01,COSTCO WHOLESALE,123.45", "2026-07-02,Tim Hortons,5.20"].join("\n"),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].merchant).toBe("COSTCO WHOLESALE");
    expect(rows[0].amountCents).toBe(12345);
    expect(rows[0].expenseDate.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(rows[1].amountCents).toBe(520);
  });

  it("handles quoted fields with commas and $ / thousands", () => {
    const rows = parseStatementCsv(
      ['Date,Description,Amount', '2026-07-03,"AMAZON, INC","$1,234.50"'].join("\n"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].merchant).toBe("AMAZON, INC");
    expect(rows[0].amountCents).toBe(123450);
  });

  it("supports MM/DD/YYYY and accounting negatives", () => {
    const rows = parseStatementCsv(
      ["Date,Description,Amount", "07/04/2026,Refund,(8.00)"].join("\n"),
    );
    expect(rows[0].expenseDate.toISOString().slice(0, 10)).toBe("2026-07-04");
    expect(rows[0].amountCents).toBe(-800);
  });

  it("assumes date,desc,amount when there is no header", () => {
    const rows = parseStatementCsv("2026-07-05,Bus pass,90");
    expect(rows).toHaveLength(1);
    expect(rows[0].merchant).toBe("Bus pass");
    expect(rows[0].amountCents).toBe(9000);
  });

  it("skips unparseable rows", () => {
    const rows = parseStatementCsv(
      ["Date,Description,Amount", "not-a-date,Bad,xyz", "2026-07-06,Good,10"].join("\n"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].merchant).toBe("Good");
  });
});
