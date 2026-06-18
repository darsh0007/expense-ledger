
#### Domain functions
```
Person       { id, isMe }
Transaction  { id, payerPersonId, paymentAccountId?, amountCents, expenseDate, status, type, refundOfTransactionId? }
Allocation   { id, transactionId, personId, amountCents, categoryId, budgetImpact, expenseDate }
Settlement   { id, fromPersonId, toPersonId, amountCents, settlementDate, method, note? }
BudgetPeriod { id, startDate, endDate, limitCents }
```


![[Pasted image 20260617160213.png]]

![[Pasted image 20260618142031.png]]