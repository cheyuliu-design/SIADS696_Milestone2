// Part A (supervised) sections of the report. Numbers come from report_data.json (notebook 5 tables).
const { P, H1, H2, H3, bullet, figure, table } = require("./lib");

const num = (x, d = 3) => Number(x).toFixed(d);
const pct = (x, d = 1) => `${(100 * Number(x)).toFixed(d)}%`;
const NICE = { "drug flags (top 400)": "the drug flags (as a block)", is_us: "US vs non-US origin", reporter: "reporter type",
  report_type: "report type", n_drugs: "number of drugs", country: "country", age_years: "age", n_suspect_ingredients: "number of suspect ingredients",
  age_missing: "missing age", sex: "sex", age_group: "age group", weight_missing: "missing weight", weight_kg: "weight", n_other_ingredients: "ingredients outside the vocabulary" };
const nice = (f) => NICE[f] || f;
const sens = (D, exp) => D.sensitivity.filter((r) => r.experiment === exp);

function headline(D) {
  const gb = D.final_test["gradient boosting"], lr = D.final_test["logistic regression"];
  return `Histogram gradient boosting is the best family. On the held-out test year it reaches an average precision (PR-AUC) of ${num(gb.avg_precision)} and ROC AUC of ${num(gb.roc_auc)}, against ${num(lr.avg_precision)} / ${num(lr.roc_auc)} for logistic regression and a ${num(D.final_test.prior.avg_precision)} floor. Drug identity and report origin carry most of the signal. Performance drifts down as new drugs appear, and the remaining errors are mostly reports with too little information, outcomes that are serious by other criteria, or inconsistent labels.`;
}

function sections(D) {
  const T = D.final_test, V = D.final_val;
  const gb = T["gradient boosting"];
  const cal = D.calibration;
  const calKeys = Object.keys(cal);
  const ablation = Object.fromEntries(D.ablation_rows.map((r) => [r[0], r]));
  const lrRounds = sens(D, "learning rate x rounds");
  const vocab = sens(D, "drug vocabulary");
  const sizes = sens(D, "training size");
  const seed = sens(D, "random seed (5 seeds)")[0];
  const leaves = sens(D, "tree size");
  const apRange = (rows) => `${num(Math.min(...rows.map((r) => r.val_avg_precision)))}-${num(Math.max(...rows.map((r) => r.val_avg_precision)))}`;
  const drift = D.drift;
  const firstQ = drift[0], lastQ = drift[drift.length - 1];
  const ex = D.failure_examples;
  const noise = D.label_noise;
  const top = D.perm_rows.slice(0, 5).map((r) => `${nice(r[0])} (${num(r[1])})`);

  return [
    H1("5. Part A: Supervised Learning"),
    H2("5.1 Methods"),
    P("**Workflow.** Notebook 4 builds the 440-column matrices and fits the scaler and encoders on the training sample only. Notebook 5 then (1) tunes each model family on a 300,000-row training subsample, scoring candidates on the validation quarters; (2) compares the tuned families with 5-fold cross-validation inside the training period; (3) refits each family on the full 1,000,000-row training sample, chooses a decision threshold on validation and evaluates once on test; and (4) runs calibration, feature importance, ablation, sensitivity, trade-off and failure analyses on the best model. The final model, its calibrator and threshold are saved and reused by the scoring pipeline (notebook 7)."),
    P("**Model families and justification.** We compare four families with different mechanisms (Table SUP_TAB_FAMILIES). **Logistic regression** is linear and discriminative: the log-odds are a weighted sum of the features, so each coefficient reads directly as a drug, country or reporter effect. It is the interpretable baseline from the proposal. **Bernoulli naive Bayes** is a generative probabilistic model that assumes features are independent given the class. It is very fast and tests whether the presence or absence of drugs and categories alone is enough; scaled numeric columns are binarized at the training mean. A **random forest** averages deep trees grown on bootstrap samples with random feature subsets, and captures interactions such as drug x age without careful tuning. **Histogram gradient boosting** (scikit-learn's LightGBM-style implementation; Ke et al., 2017) adds shallow trees one at a time, each fitting the previous errors, and is usually the strongest learner on mixed tabular data. All four use the same 440 features, so differences come from the learner, not the representation. Trees are unaffected by the standardization the linear models need."),
    P("**Hyperparameter tuning.** For each family we searched a small grid (Appendix Table SUP_TAB_TUNING) and kept the setting with the highest validation average precision: the regularization strength C for logistic regression, the smoothing alpha for naive Bayes, the features per split and minimum leaf size for the random forest (200 trees, half-sample bootstraps), and the learning rate, leaves per tree and number of boosting rounds for gradient boosting. Tuning on later quarters rather than a random fold selects settings that hold up over time."),
    ...table("Model families, tuned settings and validation average precision (AP) of the tuning run (300,000 training rows).", [
      ["Family", "Mechanism", "Tuned setting", "Validation AP"],
      ["Logistic regression", "linear, discriminative", D.tuning_best["logistic regression"].params.replace(/'/g, ""), D.tuning_best["logistic regression"].val_ap],
      ["Naive Bayes (Bernoulli)", "generative, probabilistic", D.tuning_best["naive Bayes"].params.replace(/'/g, ""), D.tuning_best["naive Bayes"].val_ap],
      ["Random forest", "bagged trees", D.tuning_best["random forest"].params.replace(/'/g, ""), D.tuning_best["random forest"].val_ap],
      ["Gradient boosting (histogram)", "boosted trees", D.tuning_best["gradient boosting"].params.replace(/'/g, ""), D.tuning_best["gradient boosting"].val_ap],
    ], [1.8, 1.6, 3.6, 1.0], "SUP_TAB_FAMILIES"),

    H2("5.2 Evaluation"),
    H3("Metrics"),
    P(`Positives are 26% of cases, and a reviewer reads a ranked queue from the top. Our **primary metric is average precision** (AP, the area under the precision-recall curve), which rewards purity at the top of the ranking and whose chance level equals the positive rate (Saito & Rehmsmeier, 2015). We also report **ROC AUC** for comparison with the literature, the **Brier score** (the mean squared error of the probabilities, a calibration check), and, at a decision threshold, **precision, recall and F1**. The threshold maximizes F1 on validation and is then applied unchanged to test.`),
    H3("Overall results"),
    P(`Table SUP_TAB_CV compares the families with 5-fold stratified cross-validation (250,000 training-period rows; mean ± standard deviation over folds). The ranking is clear and the fold-to-fold spread (at most 0.004 AP) is an order of magnitude smaller than the gaps between families. Table SUP_TAB_TEST gives each family refit on 1,000,000 rows and evaluated on the **test year** (2025Q3-2026Q2, ${Number(gb.tp) + Number(gb.fp) + Number(gb.fn) + Number(gb.tn)} cases). Gradient boosting leads on every metric: AP ${num(gb.avg_precision)} vs ${num(T["random forest"].avg_precision)} (random forest), ${num(T["logistic regression"].avg_precision)} (logistic regression) and ${num(T["naive Bayes"].avg_precision)} (naive Bayes). At its validation-chosen threshold it flags ${pct(gb.alert_rate)} of cases with precision ${num(gb.precision)} and recall ${num(gb.recall)}. Every family scores slightly lower on test than on validation (gradient boosting validation AP ${V["gradient boosting"].ap}), the first sign of the drift discussed below.`),
    ...table("5-fold cross-validation on the training period (mean ± standard deviation over folds). Fit time is per fold on 200,000 rows.", [
      ["Family", "Average precision", "ROC AUC", "Brier score", "Fit (s)"], ...D.cv_rows,
    ], [2.0, 1.6, 1.6, 1.6, 0.8], "SUP_TAB_CV"),
    ...table("Best model of each family, trained on 1,000,000 rows, evaluated once on the test year. Threshold = F1-optimal on validation. Alerts = share of cases flagged.", [
      ["Family", "AP", "ROC AUC", "Brier", "Thresh.", "Precision", "Recall", "F1", "Alerts", "Fit (s)"], ...D.final_rows,
    ], [2.1, 0.8, 0.9, 0.8, 0.8, 0.9, 0.8, 0.7, 0.8, 0.7], "SUP_TAB_TEST"),
    ...figure("sup_pr_roc_test.png", "Precision-recall (left) and ROC (right) curves on the test year for the four families. The dashed line in the left panel is the positive rate (the AP of a random ranking).", 6.3, "SUP_FIG_CURVES"),
    P(`**Calibration.** Gradient boosting's raw probabilities are already close to the diagonal (test Brier ${num(cal[calKeys[0]].brier, 4)}; Figure SUP_FIG_CAL). Isotonic regression fitted on validation barely changes the Brier score (${num(cal[calKeys[1]].brier, 4)}), and because its step function ties many scores it slightly lowers AP (${num(cal[calKeys[1]].avg_precision)} vs ${num(cal[calKeys[0]].avg_precision)}). The pipeline therefore **ranks by the raw score** and shows the calibrated value only as the displayed probability. Naive Bayes is badly over-confident, as its independence assumption predicts, and logistic regression is slightly under-confident at the top.`),
    ...figure("sup_calibration.png", "Calibration on the test year: observed share of serious cases against mean predicted probability, in 15 equal-size bins.", 3.0, "SUP_FIG_CAL"),

    H3("Feature importance and ablation (gradient boosting)"),
    P(`We measured **permutation importance** on 150,000 validation cases: each original feature (all its one-hot columns together) is shuffled and the drop in AP recorded, over three repeats. We also ran an **ablation**: the model is retrained (500,000 rows) without each feature group, and on each group alone (Figure SUP_FIG_IMP). The most important single features are ${top.slice(0, 3).join(", ")}, followed by ${top.slice(3).join(" and ")}. In the ablation, removing the drug flags costs the most (AP ${ablation["without drug identity"][3]}), followed by the report group (${ablation["without report"][3]}); removing the patient group (${ablation["without patient"][3]}) or the drug counts (${ablation["without drug counts"][3]}) costs less, because the remaining features partly stand in for them. Alone, drug identity reaches AP ${ablation["only drug identity"][2]} and report origin ${ablation["only report"][2]}. The model needs both *what was taken* and *who reported it from where*: ex-US reports reaching the FDA are mostly serious ones forwarded by manufacturers, while US consumer and lawyer reports are mostly not. Among individual drugs, the largest AP drops come from ${D.drug_perm_top.slice(0, 5).map((r) => r[0].toLowerCase()).join(", ")}.`),
    ...figure("sup_importance_ablation.png", "Gradient boosting: permutation importance of the original features (left) and of individual drug flags (center), measured as the drop in validation AP; ablation by feature group, retrained without (red) or with only (purple) each group (right).", 6.5, "SUP_FIG_IMP"),

    H3("Sensitivity analysis"),
    P(`We varied one choice at a time, retraining on 500,000 rows and scoring on validation (Figure SUP_FIG_SENS). **Hyperparameters:** across learning rates 0.03-0.3 and 100-600 rounds, AP ranges over ${apRange(lrRounds)}; only a low learning rate with few rounds (underfitting) or a high rate with many rounds (overfitting) falls off the plateau. Tree size (15-255 leaves) spans ${apRange(leaves)}. **Drug vocabulary:** AP rises from ${num(vocab[0].val_avg_precision)} with no drug flags to ${num(vocab[vocab.length - 1].val_avg_precision)} with 400, gaining about 0.01 AP per doubling of the vocabulary and still rising at 400, so a larger vocabulary (or drug classes) would help. **Training size:** AP grows from ${num(sizes[0].val_avg_precision)} with 10,000 rows to ${num(sizes[sizes.length - 1].val_avg_precision)} with 1,000,000, still rising by about 0.01 per tripling of the data, so the 1,000,000-row sample costs little accuracy compared with all 5.9 million training cases. **Random seed:** five seeds give ${num(seed.val_avg_precision)} ± ${num(seed.std, 4)}, so the differences above are real.`),
    ...figure("sup_sensitivity.png", "Sensitivity of gradient boosting (validation AP): learning rate x boosting rounds (left), number of drug flags kept (center), training-set size (right).", 6.5, "SUP_FIG_SENS"),

    H3("Trade-offs"),
    P(`**Precision vs recall.** Table SUP_TAB_OPS turns the calibrated model into operating points: each row targets a recall on validation and reports what happens on test. Catching 80% of serious cases means reviewing about ${D.ops_rows[2][5]} of every 1,000 reports at ${num(D.ops_rows[2][2] / 1, 2)} precision. Pushing recall to 95% raises the load by half again (${D.ops_rows[4][5]} per 1,000) while precision falls to ${num(D.ops_rows[4][2] / 1, 2)}. Where to operate is a staffing decision; the model makes the cost of each choice explicit. **Speed vs accuracy.** Naive Bayes trains in ${num(T["naive Bayes"].fit_seconds, 0)} s but loses ${num(gb.avg_precision - T["naive Bayes"].avg_precision, 2)} AP; logistic regression takes ${num(T["logistic regression"].fit_seconds, 0)} s, the random forest ${num(T["random forest"].fit_seconds, 0)} s and gradient boosting ${num(gb.fit_seconds, 0)} s on 1,000,000 rows for the best accuracy (Figure SUP_FIG_TRADE, center). Scoring a full quarter takes under a minute for any family, so training cost is the only real constraint. **Accuracy vs interpretability.** Logistic regression gives readable coefficients at a cost of about ${num(gb.avg_precision - T["logistic regression"].avg_precision, 2)} AP. **Stability over time.** AP falls from ${num(firstQ["ap_gradient boosting"])} in ${firstQ.quarter} to ${num(lastQ["ap_gradient boosting"])} in ${lastQ.quarter} (Figure SUP_FIG_TRADE, right), with logistic regression degrading in parallel. Notebook 4 shows why: the share of cases with at least one top-400 training drug falls from 88% (train) to 76% (test) as new drugs enter the market. Retraining each quarter would be part of any deployment.`),
    ...table("Operating points of the calibrated gradient boosting model. The threshold is chosen on validation to reach the target recall, then applied to test.", [
      ["Target recall (val)", "Threshold", "Precision (test)", "Recall (test)", "Flagged", "Reviews per 1,000"], ...D.ops_rows,
    ], [1.4, 1.0, 1.2, 1.2, 1.0, 1.4], "SUP_TAB_OPS"),
    ...figure("sup_tradeoffs.png", "Trade-offs: precision and recall at the operating points of Table SUP_TAB_OPS (left); training time vs test AP per family (center); AP by quarter over validation and test, with the positive rate as the floor (right).", 6.5, "SUP_FIG_TRADE"),

    H3("Failure analysis"),
    P(`Errors on the test year at the F1 threshold concentrate in identifiable segments (Table SUP_TAB_SEG). Cases with **neither age nor sex** (FNR ${D.segment_rows[2][4]}), **consumer** reports (${D.segment_rows[3][4]}) and **lawyer** reports (${D.segment_rows[4][4]}) miss the most serious cases, and cases with **no top-400 drug** have low AP (${D.segment_rows[1][3]}). In the other direction, ex-US reports from health professionals are flagged almost always (FPR ${D.segment_rows[5][5]}), because most of them are serious. We then picked five failures by rule rather than by hand (Appendix Table SUP_TAB_EX) and read their full ingredient and reaction lists. Those lists are not model inputs; we use them only to understand the errors. Three kinds of failure stand out:`),
    bullet(`**Reports with too little (or contradictory) information: examples A, B, D.** All three are US consumer reports with no age or sex and one or two drugs. Example A lists ${ex[0].suspect_ingredients.toLowerCase()}, a rare drug outside the vocabulary, and the case is coded as hospitalized while its only reaction is "${ex[0].reactions.toLowerCase()}". ${ex[1].suspect_ingredients.toLowerCase()} (B) is a common, mostly non-serious drug whose only listed reaction is "${ex[1].reactions.toLowerCase()}". Example D lists ${ex[3].suspect_ingredients.toLowerCase()} (a nasal spray and eye drops) with a reported death and a device complaint. The features describe a low-risk report, and nothing available at intake contradicts that. *Fix:* treat sparse reports as their own queue (or flag them for follow-up) rather than trusting a low score; add drug-class or Part B cluster features so an unseen drug like A inherits a class risk.`),
    bullet(`**Serious, but not by our definition: example C.** The most confident false positive (p = ${num(ex[2].p_serious)}) is a ${ex[2].n_drugs}-drug report from a health professional in ${ex[2].country}, one of the templated Canadian reports, describing a **congenital anomaly** after exposure via breast milk. A congenital anomaly is itself an FDA seriousness criterion, but not hospitalization or death, so the label is negative. Every feature (ex-US, health professional, many drugs) points to "serious", and in the regulatory sense the model is right. *Fix:* predict the full seriousness flag, or the seriousness criteria as a multi-label target, as Zhao et al. (2023) do.`),
    bullet(`**Label noise: example E.** A ${ex[4].sex} ${num(ex[4].age, 0)}-year-old's report from a ${ex[4].reporter} lists ${ex[4].suspect_ingredients.toLowerCase()} with ${ex[4].reactions.toLowerCase().split(" | ").slice(0, 5).join(", ")}, yet it is coded as neither hospitalization nor death (p = ${num(ex[4].p_serious)}). Across all confident false positives, ${pct(noise[0].share_listing_a_severe_reaction)} list a reaction that is almost always serious (death, sepsis, cardiac arrest, respiratory failure...), against ${pct(noise[1].share_listing_a_severe_reaction)} of true negatives: four times as often. Label noise explains only part of the false positives, but it caps the precision any model can reach. *Fix:* audit labels with reaction-based rules and train with noise-robust losses.`),
    P("**End-to-end pipeline.** Notebook 7 applies the saved preprocessing, model and calibrator to the most recent quarter (2026Q2, 416,272 cases) without refitting anything. It flags 38.7% of cases for review with precision 0.477 and recall 0.748 (AP 0.580), the mean calibrated probability is 0.266 against an observed rate of 0.246, and 85% of cases are tagged with at least one Part B drug cluster, so a reviewer sees both a risk score and the safety-profile group of each suspect drug."),
    ...table("Error rates by segment on the test year (gradient boosting, F1 threshold). FNR = share of serious cases missed; FPR = share of non-serious cases flagged.", [
      ["Segment", "Share of test", "Positive rate", "AP", "FNR", "FPR"], ...D.segment_rows,
    ], [3.0, 1.1, 1.1, 0.9, 0.9, 0.9], "SUP_TAB_SEG"),
  ];
}

function discussion(D) {
  const T = D.final_test;
  return [
    P(`**Surprises.** First, how much of the signal sits in *where a report comes from* rather than *who the patient is*: country and reporter type rival the drugs themselves, which reflects FAERS's reporting rules (manufacturers must forward serious foreign cases) more than biology. Second, how easy it is to leak the outcome: our first feature lists included the expedited flag and report version, each of which made the model look far better than it could be at intake. Third, how often the "errors" were really label problems: the most confident false positive is a congenital anomaly (serious, but not by our definition), and confident false positives list nearly-always-serious reactions four times as often as true negatives.`),
    P(`**Challenges.** (1) Leakage was everywhere: reaction terms, the expedited flag, legacy follow-ups and the mass-report flag each looked like strong predictors, and each had to be removed after we traced why (notebook 3). (2) Scale: 8 million cases do not fit most learners on a 5 GB Deepnote machine, so we trained on a stratified 1,000,000-row sample and showed in the sensitivity analysis what more data would buy. (3) Time: a random split would have overstated performance; the time split exposed drift, which we quantified per quarter.`),
    P(`**With more time** we would map ingredients to RxNorm and ATC classes so that unseen drugs inherit a class-level risk; feed the Part B cluster of each drug as a feature, which is already wired into the pipeline; add a second-stage model that uses the narrative once a case is opened; retrain quarterly with a monitored drift alarm; and recover the three missing quarters with a Deflate64 reader.`),
  ];
}

function appendix(D) {
  const ex = D.failure_examples;
  return [
    ...table("Failure examples chosen by rule from the test year. Reactions and the full ingredient list were not model inputs.", [
      ["Example", "Case id", "p(serious)", "Label", "Reporter, country, drugs", "Suspect ingredients (first 6)", "Reactions (first 8)"],
      ...ex.map((e) => [e.example, String(e.safetyreportid), num(e.p_serious), e.label, `${e.reporter}, ${e.country}, ${e.n_drugs}`, e.suspect_ingredients.toLowerCase(), e.reactions.toLowerCase()]),
    ], [1.7, 1.0, 0.8, 0.9, 1.3, 1.8, 2.5], "SUP_TAB_EX"),
    ...table("Full hyperparameter search for Part A (300,000 training rows, scored on validation).", [
      ["Family", "Setting", "Validation AP", "ROC AUC", "Fit (s)"], ...D.tuning_rows,
    ], [1.6, 3.6, 1.0, 0.9, 0.7], "SUP_TAB_TUNING"),
    ...table("Ablation by feature group (gradient boosting retrained on 500,000 rows, validation AP).", [
      ["Variant", "Columns", "Validation AP", "Change vs all"], ...D.ablation_rows,
    ], [2.6, 1.0, 1.2, 1.2]),
  ];
}

module.exports = { headline, sections, discussion, appendix };
