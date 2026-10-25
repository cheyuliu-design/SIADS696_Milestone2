# FAERS Safety Signals: Predicting Serious Outcomes and Clustering Drug Safety Profiles

SIADS 696 Milestone II. Team: **Orko Mookerjee, Che-Yu Liu, Nikhil Jain**.

We use 8.5 million FDA Adverse Event Reporting System (FAERS) cases (2020Q1–2026Q2) to

- **Part A (supervised):** predict whether a newly received case involves **hospitalization or death**, from
  information available at intake (patient, report source, suspect drugs), for report triage;
- **Part B (unsupervised):** group the 500 most-reported suspect ingredients by the reactions reported with them,
  to find recurring **drug safety-profile clusters**, then check the groups against outcomes and time;
- tie both into one **scoring pipeline** that scores a new quarter and tags each case with its drug clusters.

The written report is [`reports/FAERS_Milestone2_Report.pdf`](reports/FAERS_Milestone2_Report.pdf) (editable version:
[`reports/FAERS_Milestone2_Report.docx`](reports/FAERS_Milestone2_Report.docx)). Main text 14 pages; references and appendix follow.
Google Doc Version: https://docs.google.com/document/d/15e-l-7EQZ2BKFnk2cSwN0TVec9CHYV7W/edit

## Results at a glance

**Part A (test year 2025Q3–2026Q2, 1.47M cases, never used for fitting or tuning):**

| Model | Avg. precision (PR-AUC) | ROC AUC | 5-fold CV AP (mean ± sd) |
|---|---|---|---|
| Prior (base rate) | 0.262 | 0.500 | 0.258 ± 0.000 |
| Bernoulli naive Bayes | 0.508 | 0.778 | 0.516 ± 0.003 |
| Logistic regression | 0.534 | 0.788 | 0.567 ± 0.003 |
| Random forest | 0.587 | 0.811 | 0.624 ± 0.003 |
| **Histogram gradient boosting** | **0.602** | **0.818** | **0.645 ± 0.004** |

Drug identity and report origin (US vs ex-US, reporter, report type) carry most of the signal. Performance drifts
down slowly as new drugs enter the market, and many confident false positives list reactions such as death or
sepsis, which points to mis-coded seriousness labels.

**Part B:** 500 suspect ingredients clustered by TF-IDF reaction profiles (k-means and Ward, k = 30) form
recognizable groups (injectable biologics, GLP-1 agonists, opioids, chemotherapy, inhalers, HIV antiretrovirals,
ADHD stimulants, ...). Without using outcomes, cluster seriousness ranges from 0.2% (topical acne/sunscreen) to
63% (substances of abuse); the GLP-1 cluster's share of reports tripled from 2020 to 2026.

## Repository layout

```
.
├── README.md
├── requirements.txt
├── notebooks/
│   ├── 01_data_acquisition_schema.ipynb   FAERS XML zips -> one row per case (not re-run: hours of parsing)
│   ├── 02_data_cleaning.ipynb             target rebuild, patient fields, dedup, ingredient/reaction tables
│   ├── 03_eda.ipynb                       target, patients, drugs, reactions, leakage findings
│   ├── 04_features_baselines.ipynb        population, time split, 440 features, scaling, baselines
│   ├── 05_supervised_learning.ipynb       4 model families, tuning, 5-fold CV, test, calibration,
│   │                                      importance, ablation, sensitivity, trade-offs, failure analysis
│   ├── 06_unsupervised_learning.ipynb     drug x reaction profiles, k-means vs hierarchical, k selection,
│   │                                      stability, UMAP, post-hoc seriousness and time trends, sensitivity
│   └── 07_pipeline_scoring.ipynb          score a new quarter end to end with the saved artifacts
├── data/                                  (not in git, except data/sample/; see "Data")
│   ├── eda_start/reports_level.parquet    notebook 1 output: 8,555,729 cases
│   ├── clean/                             notebook 2 output
│   ├── features/                          notebook 4 output
│   ├── unsupervised/                      notebook 6 output (drug_clusters.parquet)
│   └── sample/                            first 100 records of each table (in git)
├── models/                                notebook 5 output (scoring model, test predictions; not in git)
├── reports/
│   ├── FAERS_Milestone2_Report.pdf/.docx  written report
│   ├── figures/                           every figure in the report, written by the notebooks
│   ├── tables/                            every number in the report, as CSV, written by the notebooks
│   ├── pipeline_scored_2026Q2.parquet     notebook 7 output: scored and cluster-tagged newest quarter
│   └── build_report/                      script that builds the .docx from figures/ and tables/
```

## How to reproduce

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

1. Put `reports_level.parquet` in `data/eda_start/` (shared team drive, `eda_start.zip`), **or** download the FAERS
   quarterly XML zips (see "Data") into `FAERS/` and run notebook 1 with `REPARSE = True`.
2. Run notebooks 02 → 07 in order, from the `notebooks/` folder or the project root. Each notebook reads the
   previous one's output from `data/` and is self-contained (no shared module).

| Notebook | Runtime (Apple M-series, 10 cores) | Peak memory |
|---|---|---|
| 02 cleaning | ~6 min | ~4 GB |
| 03 EDA | < 1 min | ~3 GB |
| 04 features + baselines | ~5 min | ~6 GB |
| 05 supervised | ~2 h 45 min (tuning grid, CV, 30+ sensitivity retrains) | ~8 GB |
| 06 unsupervised | ~6 min | ~3 GB |
| 07 pipeline | < 1 min | ~3 GB |

Notebooks 02–04 also fit the 5 GB Deepnote machine; notebook 05 needs more (the tree models use a dense
1M x 440 training matrix): use a larger machine or lower the sample sizes at the top of each section.

## Data

- **Source:** U.S. FDA, FAERS Quarterly Data Extract Files, XML (ICH E2B) format:
  <https://fis.fda.gov/extensions/FPD-QDE-FAERS/FPD-QDE-FAERS.html>. One zip per quarter
  (`faers_xml_2020Q1.zip` … `faers_xml_2026q2.zip`, 26 zips, ~3.4 GB compressed).
- **Coverage:** 2020Q1–2026Q2. 2023Q3, 2024Q1 and 2024Q4 are missing: those zips use Deflate64 compression, which
  Python's `zipfile` cannot read (fix: `pip install zipfile-deflate64` and `import zipfile_deflate64` in notebook 1).
- **Size:** 8,555,729 cases after keeping the latest version of each case; 8,477,316 after cleaning.
- **In this repository:** only `data/sample/` (first 100 records of each table), because the full data is ~1 GB.

## Key design decisions

- **Target coding break at 2021Q4.** Up to 2021Q3 FAERS XML writes a seriousness flag only when it is "yes"; a blank
  means "no". From 2021Q4 a blank means "unknown". Notebook 2 detects this per quarter.
- **No leakage.** Reaction terms (`DEATH`, `HOSPITALISATION`, ...) and the `expedited` flag restate the outcome and
  are not supervised features. Legacy cases (first received before 2020) and mass reports are excluded from modeling.
- **Time split.** Train 2020Q1–2024Q3 (1M stratified sample), validation 2025Q1–Q2 (tuning, threshold, calibration),
  test 2025Q3–2026Q2 (used once).
- **Clustering evidence is weighted** by 1 / (suspect drugs on the case), so that a few templated reports listing
  dozens of drugs cannot define every drug's profile.

## Known limitations

- FAERS is spontaneous reporting: no exposure denominator, under-reporting, stimulated reporting (litigation,
  media). Outputs are triage and hypothesis-generation signals, not incidence or causality.
- Ingredient names are standardized by stripping salt words; a few names are over-stripped
  (e.g. `DIMETHYL FUMARATE` → `DIMETHYL`). An RxNorm mapping would fix this.

## Attribution

All analysis code is the team's own. Notebook 1 and the first clustering notebook: Orko Mookerjee; first
gradient-boosting notebook: Che-Yu Liu; cleaning (V2), EDA, features, final modeling, evaluation and pipeline:
Nikhil Jain (see the report's statement of work). Libraries: pandas, NumPy, PyArrow, scikit-learn, SciPy,
umap-learn, matplotlib.
