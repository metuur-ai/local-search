---
id: capability://payments/chargeback
tags: disputes, chargeback, fraud
upstream:
  - capability://payments/refund
implementedBy:
  - component://disputes-service
---

# Chargeback handling

Process for managing payment chargebacks and disputes.

## Detection

Chargebacks are detected via daily webhook from payment processor.

## Response timeline

- Must respond within 7 business days
- Evidence package required: receipt, delivery proof, communication logs
- Second presentment allowed within 10 days of initial decision
