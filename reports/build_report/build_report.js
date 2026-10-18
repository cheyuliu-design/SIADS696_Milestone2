// Builds reports/FAERS_Milestone2_Report.docx from reports/figures/*.png and report_data.json.
// Run: python collect_results.py && node build_report.js   (NODE_PATH must reach the `docx` package)
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat, Footer, PageNumber, PageBreak,
} = require("docx");
const { labels, P, bullet, H1, H2, H3, figure, table, FONT, BODY } = require("./lib");
const JSZip = require("jszip");
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "report_data.json"), "utf8"));
const partA = require("./part_a");

const pct = (x) => `${(100 * x).toFixed(1)}%`;

// ---------------------------------------------------------------- front matter
const front = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: "Triage and Safety-Profile Discovery in FDA Adverse Event Reports:", font: FONT, bold: true, size: 32 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new TextRun({ text: "Predicting Serious Outcomes and Clustering Drugs by Reported Reactions", font: FONT, bold: true, size: 28 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
    children: [new TextRun({ text: "Orko Mookerjee, Che-Yu Liu, Nikhil Jain", font: FONT, size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: [new TextRun({ text: "SIADS 696 Milestone II, University of Michigan School of Information", font: FONT, italics: true, size: BODY })] }),
];

// ---------------------------------------------------------------- 1 introduction
const intro = () => [
  H1("1. Introduction"),
  P("The FDA Adverse Event Reporting System (FAERS) receives roughly 1.5 million case reports a year from manufacturers, clinicians, pharmacists, consumers and lawyers. Each report names one or more suspect drugs and the reactions the reporter observed. Safety reviewers face two recurring problems. First, **triage**: serious cases (those involving hospitalization or death) must be found quickly among a large majority of non-serious ones. Second, **pattern discovery**: reviewers want to know which drugs are reported with similar reactions, so that a new report or a new drug can be read against a known safety profile."),
  P("We address both with one reproducible pipeline built on 8.5 million FAERS cases from 2020 to mid-2026. In **Part A (supervised)** we predict whether a case involves hospitalization or death using only information available when the report arrives: patient demographics, who reported it and from where, and which drugs are suspected. We deliberately exclude the reaction terms, because terms such as `DEATH` or `HOSPITALISATION` restate the outcome. We compare four model families (logistic regression, Bernoulli naive Bayes, random forest and histogram gradient boosting) under a strict time split: we train on 2020-2024, tune on early 2025 and test once on the following four quarters. In **Part B (unsupervised)** we describe each of the 500 most-reported suspect ingredients by the reactions reported with it, and cluster those profiles with k-means and with hierarchical (Ward) clustering. Seriousness is compared across clusters only after they are fixed. A final notebook scores a new quarter end to end and tags every case with the clusters of its drugs."),
  P("The motivation is practical. Seriousness drives regulatory reporting timelines (15-day expedited reports), yet in spontaneous reports it is coded inconsistently, and manual review does not scale. A ranked queue with calibrated probabilities lets reviewers read the most likely serious cases first. Clusters of drugs with similar reaction profiles give context for hypothesis generation. Neither output is causal: FAERS has no denominator of exposed patients, so we treat both as decision support."),
  P(`**Main findings.** (A) ${partA.headline(D)} (B) With each report's evidence split among its suspect drugs, TF-IDF reaction profiles form clinically recognizable groups: injectable biologics, GLP-1 agonists, opioids, cytotoxic chemotherapy, inhaled respiratory drugs, HIV antiretrovirals, ADHD stimulants and others. k-means and Ward clustering agree moderately (ARI 0.56). Although no outcome was used in fitting, the clusters separate the serious-outcome rate from 0.2% (topical acne and sunscreen products) to 63% (substances of abuse). Over time, the GLP-1 cluster's share of reports tripled. **Novel contributions** relative to prior FAERS work: an explicit audit for target leakage and for a target-coding change at 2021Q4; time-based validation with a held-out future year; and a case-weighting fix that keeps a few thousand templated reports from defining the profiles of common drugs.`),

];

// ---------------------------------------------------------------- 2 related work
const related = () => [
  H1("2. Related Work"),
  P("**Seriousness prediction.** Zhao et al. (2023) built GCAP, a graph-based multi-task deep network that predicts whether a drug-reaction pair leads to a serious outcome and which of seven outcome classes it falls into, using drug structures and reaction semantics. Routray et al. (2020) trained neural classifiers on a manufacturer's case reports to decide seriousness and its category from report text, reaching 83-93% accuracy. Both use the **reaction** or narrative as input. Our task is different and harder: we predict the outcome *without* the reactions, which would leak it, so that the model can rank cases at intake. We also validate on later quarters rather than on a random split, and we calibrate the probabilities."),
  P("**Disproportionality and data mining in FAERS.** The proportional reporting ratio (PRR; Evans et al., 2001) and its Bayesian relatives are the standard signal-detection tools. Sakaeda et al. (2013) show how to mine the public FAERS files with these statistics, and Harpaz et al. (2012) review data-mining methods for adverse drug events. These methods score one drug-reaction pair at a time. Our PPMI representation borrows the PRR idea, but we use whole profiles to group drugs."),
  P("**Drugs grouped by side effects.** Campillos et al. (2008) showed that drugs with similar side-effect profiles (from package inserts) tend to share protein targets. Tatonetti et al. (2012) mined FAERS for drug effects and interactions, correcting for confounding, and released the OFFSIDES and TWOSIDES resources. We cluster **post-marketing reporting profiles** rather than labels, compare two clustering methods, measure stability, and check the clusters against outcomes and time afterwards. This project is new work and does not extend a Milestone I project."),
];

// ---------------------------------------------------------------- 3 data
const data = () => [
  H1("3. Data Source"),
  P("**Source and format.** We used the FDA FAERS Quarterly Data Extract Files in XML (ICH E2B) format, downloaded from the FDA website (U.S. FDA, 2026) as one zip per quarter: 26 zips from 2020Q1 to 2026Q2, about 3.4 GB compressed. Each XML `safetyreport` element holds report fields (report id and version, receipt dates, report type, reporter qualification, country, seriousness flags), patient fields (age with unit, age group, sex, weight) and repeated `drug` (role, product, active ingredient) and `reaction` (MedDRA preferred term) elements."),
  P("**Records and coverage.** Notebook 1 streams each XML file and keeps one row per case, the latest `safetyreportversion`, and drops FDA's deleted cases: **8,555,729 cases** from 23 quarters. Three quarters (2023Q3, 2024Q1, 2024Q4) could not be read because their zips use Deflate64 compression, which Python's `zipfile` does not support. We document this as a known gap. After cleaning (Section 4), 8,477,316 cases remain. They carry 14.0 million case-ingredient rows (7,183 distinct ingredients) and 25.4 million case-reaction rows (21,654 distinct MedDRA terms)."),
  P("**Important variables.** The supervised target `y_hosp_or_death` is true when the case records death or hospitalization (26.1% of the 98.9% of cases with a known target). Inputs are age, sex, weight, reporter qualification, report type, occurrence country, the number of drugs and suspect ingredients, and the suspect ingredients themselves. Part B uses the suspect ingredients and reaction terms. Age is missing for 43.6% of cases, sex for 15.4% and weight for 83.5%."),
];

// ---------------------------------------------------------------- 4 feature engineering
const features = () => [
  H1("4. Feature Engineering and Preprocessing"),
  H3("Cleaning (notebook 2)"),
  bullet("**Target rebuilt from raw codes.** FAERS codes seriousness flags as 1 = yes, 2 = no. Up to 2021Q3 the XML writes only \"1\", so a blank means *no*. From 2021Q4 both codes are written and a blank means *unknown*. Notebook 2 detects the yes-only quarters from the data (2020Q1-2021Q3). The earlier team version had turned every blank into \"no\", which made the target artificially rarer after 2021Q4. Unknown targets (1.2%) are dropped from modeling."),
  bullet("**Patient fields.** Sex code 0 becomes missing. Age is converted to years from its unit, and age group (neonate to elderly, ICH E2B bands) comes from age or else from the reporter's code. Weights outside 0.3-350 kg, or above 40 kg under age 2, are set to missing (1,229 values)."),
  bullet("**Cases with no suspect drug** are dropped (24,814)."),
  bullet("**Duplicates.** Cases identical on sex, age, weight, country, receipt month and the exact drug and reaction lists are grouped. Groups of 2-5 with at least two reactions are duplicates and the newest is kept (53,599 dropped). Groups larger than 5 are flagged as *mass reports* (114,860 cases; templated litigation or program reports)."),
  bullet("**Ingredients standardized.** Combination products are split (`DOLUTEGRAVIR SODIUM\\LAMIVUDINE` gives two ingredients), and trailing salt words are removed (`RANITIDINE HYDROCHLORIDE` becomes `RANITIDINE`) unless only a mineral would remain."),
  H3("Modeling population and split (notebooks 3-4)"),
  P("The EDA (notebook 3) produced 15 findings that drive the feature decisions. Four of them concern leakage. (1) Reaction terms restate the target: `DEATH` cases are 99% positive and `HOSPITALISATION` 96%. (2) The `expedited` (15-day) flag is assigned *because* a case is serious (44% vs 4% positive). (3) Legacy cases first received before 2020 are 42% positive, because serious cases attract follow-up versions. (4) The mass-report flag is computed over all years, so it would carry future information. All four are excluded. The modeling population is cases with a known target, received from 2020 on, and not mass reports (8,012,423 cases). It is split by FAERS quarter (Table TAB_SPLIT)."),
  ...table("Modeling population and time-based split (notebook 4).", [
    ["Split", "Quarters", "Cases", "Positive rate", "Use"],
    ["Train", "2020Q1-2024Q3", "5,914,363", "0.258", "1,000,000-row stratified sample used for fitting"],
    ["Validation", "2025Q1-2025Q2", "626,361", "0.260", "tuning, threshold choice, calibration"],
    ["Test", "2025Q3-2026Q2", "1,471,699", "0.262", "evaluated once, at the end"],
  ], [1.1, 1.4, 1.1, 1.1, 3.3], "TAB_SPLIT"),
  H3("Final features (440 columns)"),
  P("All levels, vocabularies and scalers are learned from training data only. **Patient:** age in years (median-imputed, standardized), age group (one-hot, including *missing*), sex (one-hot, including *missing*), weight in kg (median-imputed, standardized), and age-missing and weight-missing indicators. Missingness carries signal: cases with missing age are 18% positive vs 32% with age present. **Report:** reporter qualification, report type, and occurrence country (the 10 most common training countries, else OTHER, one-hot), plus an is-US flag. **Drug counts:** `log1p` of the number of drugs, suspect ingredients and suspect ingredients outside the drug vocabulary, standardized. **Drug identity:** 400 binary flags for the most frequent training-period suspect ingredients, which cover 80% of mentions and appear on 88% of training cases, 82% of validation cases and 76% of test cases. Categories with fewer than 1,000 training cases are merged into an *infrequent* level. The complete list is in Appendix A."),
  H3("Part B representation (notebook 6)"),
  P("For clustering, each of the 500 most-reported suspect ingredients (85% of ingredient mentions) is described by its evidence across the 1,000 most-reported reaction terms (85% of reaction mentions). The outcome terms `DEATH` and `HOSPITALISATION` and all mass reports are removed. A plain count of co-reported pairs is dominated by a few very large reports: 1% of cases (more than 10 suspect drugs or 30 reactions) produce 40% of all pairs, and about 4,600 templated Canadian reports (median 27 drugs and 49 reactions) produce 13% alone. We therefore **weight each pair by 1 / (number of suspect ingredients on the case)**, which splits a case's evidence among its drugs. From this 500 x 1,000 matrix we build three representations. **Share:** each row divided by its total (the original team notebook's choice). **TF-IDF:** log(1 + evidence) times inverse document frequency across drugs, rows scaled to unit length. **PPMI:** positive pointwise mutual information, log(observed / expected), which is the disproportionality idea behind the PRR. Each is reduced to 50 dimensions with truncated SVD and scaled to unit length."),
];

// ---------------------------------------------------------------- Part B
const cl = D.clusters;
const clusterHeader = ["Cluster (our name)", "Drugs", "Most-reported members", "Characteristic reactions", "Serious", "Share 2020 → 2026"];
const clusterRow = (r) => [r.name, String(r.n_drugs), r.drugs, r.reactions, pct(r.serious), `${pct(r.share_first)} → ${pct(r.share_last)}`];
const largest = [...cl].sort((a, b) => b.share_first + b.share_last - a.share_first - a.share_last).slice(0, 10);
const clusterRows = [clusterHeader, ...cl.filter((r) => largest.includes(r)).map(clusterRow)];
const allClusterRows = [clusterHeader, ...cl.map(clusterRow)];
const sens = D.unsup_sensitivity;
const meanAri = (exp) => { const v = sens.filter((r) => r.experiment === exp).map((r) => r.ari_vs_main); return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2); };

const partB = () => [
  H1("6. Part B: Unsupervised Learning"),
  H2("6.1 Methods"),
  P("**Workflow.** We count drug-reaction evidence, build three representations, cluster each with two methods for k = 4 to 30, choose k with a fixed rule, compare all six combinations, describe and visualize the chosen solution, and only then attach outcomes and time trends (notebook 6)."),
  P("**Methods and justification.** We chose two algorithms with different mechanisms. **k-means** partitions drugs around k centroids by minimizing within-cluster squared distance. On unit-length SVD vectors this approximates cosine similarity. It is fast, and its centroids can assign a new or changed drug profile without refitting, which the pipeline needs. **Agglomerative (hierarchical) clustering** starts from single drugs and repeatedly merges the closest pair of groups. It is deterministic, needs no random start, and its tree shows nested structure. Because the unit of analysis is 500 drugs rather than millions of reports, both run on the full data, so no subsample is needed. The proposal planned report-level clustering, but drug-level profiles turned out more interpretable and directly comparable with pharmacology."),
  P("**Hyperparameters.** For agglomerative clustering we compared average, complete and Ward linkage. Average linkage chains (95% of drugs in one cluster at k = 8), complete linkage leaves a quarter to a half of the drugs in one cluster, and Ward gives balanced clusters with the best silhouette from k = 8 up, so we use Ward. For both methods we scanned k from 4 to 30 (k-means with 20 random starts each). **Rule for k:** among solutions whose largest cluster holds at most 25% of the drugs and whose bootstrap stability ARI is at least 0.5, take the highest silhouette. Silhouette keeps rising slowly up to k = 30 for every representation (Figure UNSUP_FIG_K), and the Ward tree is nested, so there is no single natural k. We cap k at 30 (about 17 drugs per cluster, roughly a therapeutic class) for readability and test k = 26-34 in the sensitivity analysis."),
  H2("6.2 Evaluation"),
  P("**Metrics.** With no ground truth we use four internal criteria. **Silhouette** (cosine; is a drug closer to its own cluster than to the next?) and **Davies-Bouldin** (average similarity of each cluster to its nearest neighbor; lower is better) measure cohesion and separation. **Largest-cluster share** catches degenerate solutions that score well while putting most drugs in one cluster. **Bootstrap stability** is the mean adjusted Rand index (ARI; Hubert & Arabie, 1985) between the full-data clustering and clusterings refit on 20 random 80% subsets: 1 means identical and 0 means chance agreement. Silhouette is not comparable across representations, so it chooses k *within* a representation. Stability and balance are comparable across all of them. Finally, we check **external meaning** after fitting: the serious-outcome rate of each cluster, and how its share of reports changes over time."),
  ...table("Best solution per representation and method at the chosen k, with the original notebook's setting for reference. Silhouette is comparable only within a representation.", [
    ["Representation", "Method", "k", "Silhouette", "Davies-Bouldin", "Largest cluster", "Stability (ARI)"],
    ...D.unsup_method_rows,
  ], [2.2, 1.4, 0.5, 1.0, 1.1, 1.1, 1.1], "UNSUP_TAB_METHODS"),
  P("Table UNSUP_TAB_METHODS summarizes the six combinations. Once evidence is weighted, all of them keep the largest cluster near 10% of drugs. The original notebook's result, with 380 of 400 drugs in one cluster at k = 4, came from plain counts on uncleaned lists. On TF-IDF, Ward clustering is the most stable solution overall (ARI 0.72), while k-means is the least stable (0.57). On PPMI both methods reach about 0.67-0.69. We keep **TF-IDF** as the main representation because its weights explain each cluster directly, and **k-means** as the main method because of its centroids. Ward clustering serves as the check that the groups are not an artifact of one algorithm. The two agree moderately (ARI 0.56; Figure UNSUP_FIG_TREE)."),
  ...figure("unsup_k_selection.png", "Choosing k for the TF-IDF representation: silhouette (left), bootstrap stability (center) and largest-cluster share (right) for k-means and Ward clustering. Dotted lines mark the chosen k = 30. Silhouette and balance improve slowly with k while k-means stability declines, so there is no single natural k.", 6.5, "UNSUP_FIG_K"),
  ...figure("unsup_umap_clusters.png", "UMAP projection of the 500 drug profiles (for display only), colored by k-means (left) and Ward clusters (right). Point size grows with the number of reports. The same regions (biologics top center, oncology lower left, opioids and psychiatric drugs right, topical and device products at the edges) appear under both methods.", 6.5),
  P("**What the clusters are.** Table UNSUP_TAB_CLUSTERS lists the 10 largest k-means clusters (all 30 are in Table UNSUP_TAB_ALLCLUSTERS, Appendix B), named by us from their members, with their most characteristic reactions (highest average TF-IDF weight; heatmap in Figure UNSUP_FIG_HEAT, Appendix B) and the outcome rate measured afterwards. Most clusters correspond to recognizable therapeutic classes even though no drug class was supplied: cytotoxic chemotherapy with febrile neutropenia and myelosuppression; opioids with dependence and neonatal withdrawal; psychiatric and antiepileptic drugs with intentional overdose; inhalers with wrong device technique; contraceptive implants and IUDs with device expulsion; ADHD stimulants with product substitution and changed therapeutic response; older HIV regimens (tenofovir disoproxil, efavirenz) with bone loss. Some clusters capture **reporting behavior** rather than pharmacology: device-delivered injectables (somatropin, pegfilgrastim, epinephrine) group by device malfunctions, and one cluster (cetirizine, folic acid, alendronate) exists because those products are listed on the templated Canadian rheumatoid-arthritis reports and inherit their reactions."),
  ...table("The 10 largest k-means clusters (TF-IDF, k = 30), sorted by the share of their cases involving hospitalization or death. The outcome was not used for clustering. Share = the cluster's share of all cases, mean of the first four vs the last four quarters.", clusterRows, [2.0, 0.6, 2.8, 2.9, 0.8, 1.3], "UNSUP_TAB_CLUSTERS"),
  ...figure("unsup_agglomerative_tree_overlap.png", "Ward clustering: dendrogram of the last 40 merges with the cut at k = 30 (left), and the overlap between Ward and k-means clusters (right; darker = more shared drugs). Large, distinctive groups map one-to-one, while the general clusters split differently.", 6.5, "UNSUP_FIG_TREE"),
  ...figure("unsup_seriousness_time.png", "After clustering: share of cases with hospitalization or death per k-means cluster (left; dashed line = all cases), and the clusters whose share of quarterly reports changed most (right).", 6.5),
  P("**External check.** Although the outcome was never used, cluster seriousness ranges from 0.2% (topical acne and sunscreen products) and 5% (contraceptive devices) to 52-54% (cytotoxic chemotherapy, hospital antibiotics) and 63% (substances of abuse). This shows the profiles carry clinically meaningful severity information. Over time, the GLP-1 and insulin cluster (tirzepatide, semaglutide) grew from 2.6% to 9.4% of all cases, and injectable biologics from 16% to 23%. The ranitidine-led cardiometabolic cluster fell from 10% to 5% as litigation-driven reports faded, and the topical acne and sunscreen cluster fell from 3.9% to 0.2% after a short-lived reporting wave."),
  H2("6.3 Sensitivity analysis"),
  P(`We re-ran k-means on TF-IDF while changing one choice at a time and measured agreement with the main solution by ARI (Appendix Figure UNSUP_FIG_SENS). Other random seeds give a mean ARI of ${meanAri("random seed")}, which is the noise floor. Nearby k values (26-34) give ${meanAri("k")} and the SVD dimension (10-100, or none) gives ${meanAri("SVD dimensions")}: both are as close as a re-seed, so these choices matter little. Vocabulary size (300-800 drugs, 500-2,000 reactions) gives ${meanAri("vocabulary")}, slightly below the seed level. The largest effect is the **case weighting**: plain counts agree with the weighted solution at only ARI ${meanAri("case weighting")}, which confirms that the templated reports reshape the clusters. Overall, the distinctive clusters (chemotherapy, opioids, inhalers, contraceptive devices, ADHD stimulants, HIV) reappear under every setting, while the general \"drug ineffective / off label use\" clusters exchange members.`),
];

// ---------------------------------------------------------------- 7 discussion
const discussion = () => [
  H1("7. Discussion"),
  H2("7.1 Part A"),
  ...partA.discussion(D),
  H2("7.2 Part B"),
  P("**Surprises.** The biggest was how much a few thousand templated reports distorted the first clustering: they define a \"rheumatoid arthritis\" profile for acetaminophen, ranitidine and oxycodone. A one-line weighting fixed it. We were also surprised that 30 clusters built only from reported reactions line up with therapeutic classes, and that their outcome rates span 0.2% to 63% without the outcome ever being used."),
  P("**Challenges.** (1) Choosing k: silhouette rose slowly with k and never peaked, so we made the cap an explicit readability choice and tested the neighborhood rather than claiming a natural k. (2) Algorithm stability: k-means on TF-IDF is only moderately stable (ARI 0.57). We report this honestly, use Ward clustering as a cross-check, and note that the unstable part is concentrated in the general clusters. (3) Computation: an earlier run spent most of its time in thread contention on a tiny 500 x 50 problem. Limiting k-means to one thread made the whole scan take minutes."),
  P("**With more time** we would map ingredients to RxNorm and ATC classes to measure agreement with pharmacology directly, fix over-stripped names (`DIMETHYL FUMARATE` becomes `DIMETHYL`), cluster at the report level as the proposal planned (TF-IDF on each report's reactions with mini-batch k-means), and track cluster membership quarter by quarter to flag drugs whose profile moves."),
];

// ---------------------------------------------------------------- 8 ethics, 9 statement of work
const ethics = () => [
  H1("8. Ethical Considerations"),
  P("**Part A.** A triage model decides which reports a human reads first, so its errors have consequences. False negatives, meaning serious cases ranked low, delay review; our failure analysis shows they concentrate in reports with unfamiliar drugs and sparse demographics, often from consumers. Performance also differs by country and reporter, so a single threshold treats groups differently. We address this by (a) using the model only to **order** a queue, never to discard reports, so every report is still reviewed within regulatory timelines; (b) reporting performance by segment and by quarter and monitoring drift, since the model ages as new drugs appear; (c) calibrating probabilities so displayed risks are honest; and (d) excluding features that could encode a reporter's identity. Sex and age are used as clinical risk factors. Their effect should be audited before deployment so the model does not deprioritize, for example, women's reports because of reporting patterns."),
  P("**Part B.** Cluster labels can be misread as causal claims (\"drug X causes reaction Y\") or as rankings of drug safety. Our cluster seriousness rates reflect who reports and why: litigation, media attention, novelty and reporting programs all inflate counts, and FAERS has no exposure denominator. Publishing such groupings without that context could unfairly harm manufacturers or frighten patients into stopping needed treatment. We present clusters only as hypothesis-generating summaries, show their reporting artifacts (templated reports, device complaints), and recommend confirmation with disproportionality statistics and clinical review. Both parts use public, de-identified FAERS data. We publish only aggregates and a 100-record sample, and make no attempt to re-identify patients."),
  H1("9. Statement of Work"),
  P("**Orko Mookerjee:** data acquisition (notebook 1: streaming XML parser, case-version handling), the first data-review notebook, and the first drug-reaction clustering notebook that Part B extends; domain framing. **Che-Yu Liu:** literature review and the first gradient-boosting notebook that Part A extends; supervised modeling. **Nikhil Jain:** data cleaning V2 (target-coding fix, deduplication, ingredient standardization), EDA and leakage audit, feature engineering and baselines, final supervised and unsupervised pipelines, evaluation, the scoring pipeline, the repository and the report. All members reviewed code and results and edited the report. *(Team to confirm before submission.)*"),
  P("**Use of AI tools.** An AI assistant (Anthropic's Claude) was used to review and refactor notebook code, run the notebooks, and draft parts of this report. All results come from the team's notebooks and were checked by the team. *(Adjust to the course's AI-use policy.)*"),
];

// ---------------------------------------------------------------- references
const refs = [
  "Campillos, M., Kuhn, M., Gavin, A.-C., Jensen, L. J., & Bork, P. (2008). Drug target identification using side-effect similarity. Science, 321(5886), 263-266. https://doi.org/10.1126/science.1158140",
  "Evans, S. J. W., Waller, P. C., & Davis, S. (2001). Use of proportional reporting ratios (PRRs) for signal generation from spontaneous adverse drug reaction reports. Pharmacoepidemiology and Drug Safety, 10(6), 483-486. https://doi.org/10.1002/pds.677",
  "Harpaz, R., DuMouchel, W., Shah, N. H., Madigan, D., Ryan, P., & Friedman, C. (2012). Novel data-mining methodologies for adverse drug event discovery and analysis. Clinical Pharmacology & Therapeutics, 91(6), 1010-1021. https://doi.org/10.1038/clpt.2012.50",
  "Hubert, L., & Arabie, P. (1985). Comparing partitions. Journal of Classification, 2(1), 193-218. https://doi.org/10.1007/BF01908075",
  "Ke, G., Meng, Q., Finley, T., Wang, T., Chen, W., Ma, W., Ye, Q., & Liu, T.-Y. (2017). LightGBM: A highly efficient gradient boosting decision tree. Advances in Neural Information Processing Systems, 30.",
  "McInnes, L., Healy, J., & Melville, J. (2018). UMAP: Uniform manifold approximation and projection for dimension reduction. arXiv:1802.03426.",
  "Pedregosa, F., Varoquaux, G., Gramfort, A., et al. (2011). Scikit-learn: Machine learning in Python. Journal of Machine Learning Research, 12, 2825-2830.",
  "Rousseeuw, P. J. (1987). Silhouettes: A graphical aid to the interpretation and validation of cluster analysis. Journal of Computational and Applied Mathematics, 20, 53-65. https://doi.org/10.1016/0377-0427(87)90125-7",
  "Routray, R., Tetarenko, N., Abu-Assal, C., et al. (2020). Application of augmented intelligence for pharmacovigilance case seriousness determination. Drug Safety, 43(1), 57-66. https://doi.org/10.1007/s40264-019-00869-4",
  "Saito, T., & Rehmsmeier, M. (2015). The precision-recall plot is more informative than the ROC plot when evaluating binary classifiers on imbalanced datasets. PLoS ONE, 10(3), e0118432. https://doi.org/10.1371/journal.pone.0118432",
  "Sakaeda, T., Tamon, A., Kadoyama, K., & Okuno, Y. (2013). Data mining of the public version of the FDA Adverse Event Reporting System. International Journal of Medical Sciences, 10(7), 796-803. https://doi.org/10.7150/ijms.6048",
  "Tatonetti, N. P., Ye, P. P., Daneshjou, R., & Altman, R. B. (2012). Data-driven prediction of drug effects and interactions. Science Translational Medicine, 4(125), 125ra31. https://doi.org/10.1126/scitranslmed.3003377",
  "U.S. Food and Drug Administration. (2026). FDA Adverse Event Reporting System (FAERS) quarterly data extract files [Data set]. https://fis.fda.gov/extensions/FPD-QDE-FAERS/FPD-QDE-FAERS.html",
  "Zhao, H., Ni, P., Zhao, Q., Liang, X., Ai, D., Erhardt, S., Wang, J., Li, Y., & Wang, J. (2023). Identifying the serious clinical outcomes of adverse reactions to drugs by a multi-task deep learning framework. Communications Biology, 6, 870. https://doi.org/10.1038/s42003-023-05243-w",
];
const references = () => [
  new Paragraph({ children: [new PageBreak()] }),
  H1("References"),
  ...refs.map((r) => new Paragraph({ children: [new TextRun({ text: r, font: FONT, size: BODY })], indent: { left: 360, hanging: 360 }, spacing: { after: 80 } })),
];

// ---------------------------------------------------------------- appendix
const featureList = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "features", "feature_names.json"), "utf8"));
const nonDrug = featureList.filter((f) => !f.startsWith("drug="));
const drugs = featureList.filter((f) => f.startsWith("drug=")).map((f) => f.slice(5).toLowerCase());
const appendix = () => [
  new Paragraph({ children: [new PageBreak()] }),
  H1("Appendix A. Complete Feature List (Part A)"),
  P(`**${nonDrug.length} patient, report and count columns** (prefix = transform: num = median-imputed and standardized; count = log1p and standardized; flag = 0/1; cat = one-hot, \"infrequent_sklearn\" = levels with fewer than 1,000 training cases): ${nonDrug.join(", ")}.`, { size: 20 }),
  P(`**${drugs.length} drug flags** (1 if the ingredient is a suspect on the case), in order of training-period frequency: ${drugs.join(", ")}.`, { size: 20 }),
  H1("Appendix B. Supplementary Results"),
  ...partA.appendix(D),
  ...table("All 30 k-means clusters (TF-IDF, k = 30), sorted by the share of their cases involving hospitalization or death (measured after clustering).", allClusterRows, [2.0, 0.6, 2.8, 2.9, 0.8, 1.3], "UNSUP_TAB_ALLCLUSTERS"),
  ...figure("unsup_kmeans_heatmap.png", "Cluster-by-reaction heatmap (k-means): mean TF-IDF weight of each cluster's three most characteristic reactions. Most clusters own a distinct block of reactions, while a few general clusters share \"drug ineffective\", \"fatigue\" and \"off label use\".", 6.0, "UNSUP_FIG_HEAT"),
  ...table("Linkage comparison for agglomerative clustering (TF-IDF). Tiny = clusters with fewer than 3 drugs.", [
    ["Linkage", "k", "Silhouette", "Largest cluster", "Tiny clusters"], ...D.linkage_rows,
  ], [1.5, 0.8, 1.2, 1.4, 1.2]),
  ...figure("unsup_sensitivity.png", "Sensitivity of the k-means clusters: ARI with the main solution when one setting changes. The dashed line is the mean over 10 other random seeds.", 4.6, "UNSUP_FIG_SENS"),
  H1("Appendix C. Reproducibility"),
  P("Code: notebooks 01-07 in the GitHub repository (see README). Notebook 01 parses the raw XML (hours; not re-run for this report). Notebooks 02-07 regenerate every table (`reports/tables/*.csv`) and figure (`reports/figures/*.png`) used here; `reports/build_report/` rebuilds this document from them. Random seeds are fixed (42 for Part A, 0 for Part B). Environment: Python 3.10, pandas 2.3, scikit-learn 1.7, pyarrow 25, umap-learn 0.5."),
];

// ---------------------------------------------------------------- assemble
// Sections are built in document order so figure and table numbers follow the page order.
let body = [...front, ...intro(), ...related(), ...data(), ...features()];
body.push(...partA.sections(D));
body.push(...partB(), ...discussion(), ...ethics(), ...references(), ...appendix());

const doc = new Document({
  creator: "Orko Mookerjee, Che-Yu Liu, Nikhil Jain",
  title: "Triage and Safety-Profile Discovery in FDA Adverse Event Reports",
  styles: {
    default: { document: { run: { font: FONT, size: BODY, color: "000000" } } },
    // black headings (course rule: black text on white); the builder's defaults are blue
    paragraphStyles: [["Heading1", "Heading 1", 26], ["Heading2", "Heading 2", 23], ["Heading3", "Heading 3", BODY]].map(([id, name, size]) => ({
      id, name, basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size, bold: true, color: "000000" },
      paragraph: { outlineLevel: Number(id.slice(-1)) - 1 } })),
  },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] }) },
    children: body,
  }],
});

// Figure/table numbers are assigned in order of appearance; the text cites them by label (e.g. "Figure UNSUP_FIG_K").
Packer.toBuffer(doc).then(async (buf) => {
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file("word/document.xml").async("string");
  for (const [label, n] of Object.entries(labels).sort((a, b) => b[0].length - a[0].length)) xml = xml.split(label).join(String(n));
  const left = xml.match(/\b(?:SUP|UNSUP|TAB|FIG)_[A-Z_]+\b/g);
  if (left) throw new Error("unresolved labels: " + [...new Set(left)].join(", "));
  zip.file("word/document.xml", xml);
  const out = path.join(__dirname, "..", "FAERS_Milestone2_Report.docx");
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("wrote", out, labels);
});
