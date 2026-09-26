# Branch Guide: `testing` — Role Category IV (QA & Testing)

- **Role Category:** `04 — QA & Testing`
- **Assigned Team Member:** **Taufiq E Elahi**
- **Primary Workspaces:** [`testing/`](../../testing/README.md), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

---

## 1. Category Mandate
Independently verify that implemented functionality behaves as intended across all layers and that the integrated product is suitable for demonstration and hackathon submission. Hold authority to identify and return incomplete functionality where acceptance criteria or the **7-Step Quality Gate** are not satisfied.

---

## 2. Principal Deliverables
- Structured multi-layer test plan and automated test suites (`testing/ai-integration/`, `testing/backend/`, `testing/frontend/`, `testing/database/`, `testing/cloudflare/`, `testing/full-application/`).
- Integration and end-to-end test results (`Frontend → Backend → Context/Data → AI → Frontend`).
- Defect/issue register with reproduction steps, expected vs. actual behavior, severity, and verification status.
- Regression verification records and pre-submission release-readiness assessment.

---

## 3. Quality Gate Authority (Section 7.3)
A major feature shall not be considered complete solely because an individual component functions. The complete path must be verified:
1. Invocation on the Fire TV interface
2. Request reaching the real backend
3. Retrieval of real spoiler-safe application context/data
4. Use of a real AI provider or validated local model
5. Actual consumption of the returned result
6. Visible 10-foot presentation on the target environment
7. Appropriate failure handling

---

## 4. Verification Commands
```bash
npm test
npm run test:ai
npm run test:backend
npm run test:frontend
npm run test:database
npm run test:cloudflare
npm run test:e2e
```
