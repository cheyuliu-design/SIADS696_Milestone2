"""Read the CSVs written by notebooks 5 and 6 and write report_data.json for build_report.js.

Every number in the report's tables comes from here, so re-running the notebooks and then this script
(and `node build_report.js`) refreshes the report.
"""
import json
from pathlib import Path

import pandas as pd

TABLES = Path(__file__).resolve().parents[1] / "tables"
OUT = Path(__file__).resolve().parent / "report_data.json"


def f3(x):
    return f"{x:.3f}"


def pm(mean, std):
    return f"{mean:.3f} ± {std:.3f}"


data = {}

# ---------- supervised ----------
if (TABLES / "supervised_final_results.csv").exists():
    tuning = pd.read_csv(TABLES / "supervised_tuning.csv")
    best = tuning.loc[tuning.groupby("family")["avg_precision"].idxmax()].set_index("family")
    data["tuning_best"] = {f: {"params": r["params"], "val_ap": f3(r["avg_precision"])} for f, r in best.iterrows()}
    data["tuning_rows"] = [[r["family"], r["params"].replace("'", ""), f3(r["avg_precision"]), f3(r["roc_auc"]),
                            f"{r['fit_seconds']:.0f}"] for _, r in tuning.iterrows()]

    cv = pd.read_csv(TABLES / "supervised_cv_summary.csv", header=[0, 1], index_col=0)
    data["cv_rows"] = [[fam, pm(r[("avg_precision", "mean")], r[("avg_precision", "std")]),
                        pm(r[("roc_auc", "mean")], r[("roc_auc", "std")]), pm(r[("brier", "mean")], r[("brier", "std")]),
                        f"{r[('fit_seconds', 'mean')]:.1f}"] for fam, r in cv.iterrows()]

    final = pd.read_csv(TABLES / "supervised_final_results.csv")
    data["final_rows"] = [[r["family"], f3(r["avg_precision"]), f3(r["roc_auc"]), f3(r["brier"]), f3(r["threshold"]),
                           f3(r["precision"]), f3(r["recall"]), f3(r["f1"]), f"{r['alert_rate']:.1%}", f"{r['fit_seconds']:.0f}"]
                          for _, r in final.query("split == 'test'").iterrows()]
    data["final_val"] = {r["family"]: {"ap": f3(r["avg_precision"]), "auc": f3(r["roc_auc"])}
                         for _, r in final.query("split == 'val'").iterrows()}
    data["final_test"] = {r["family"]: {k: (f3(r[k]) if isinstance(r[k], float) else str(r[k])) for k in
                          ["avg_precision", "roc_auc", "brier", "threshold", "precision", "recall", "f1", "alert_rate", "fit_seconds", "tp", "fp", "fn", "tn"]}
                          for _, r in final.query("split == 'test'").iterrows()}

    data["calibration"] = pd.read_csv(TABLES / "supervised_calibration.csv", index_col=0).round(4).to_dict("index")
    perm = pd.read_csv(TABLES / "supervised_permutation_importance.csv")
    data["perm_rows"] = [[r["feature"], f"{r['ap_drop_mean']:.4f}", f"{r['ap_drop_std']:.4f}"] for _, r in perm.iterrows()]
    drug_perm = pd.read_csv(TABLES / "supervised_permutation_importance_drugs.csv")
    data["drug_perm_top"] = [[r["drug"], f"{r['ap_drop_mean']:.4f}"] for _, r in drug_perm.head(10).iterrows()]
    abl = pd.read_csv(TABLES / "supervised_ablation.csv")
    data["ablation_rows"] = [[r["variant"], str(r["n_columns"]), f3(r["val_avg_precision"]), f"{r['change_vs_all']:+.3f}"]
                             for _, r in abl.iterrows()]
    sens = pd.read_csv(TABLES / "supervised_sensitivity.csv")
    data["sensitivity"] = json.loads(sens.round(4).to_json(orient="records"))
    ops = pd.read_csv(TABLES / "supervised_operating_points.csv")
    data["ops_rows"] = [[f"{r['target_recall_on_val']:.2f}", f3(r["threshold"]), f3(r["precision"]), f3(r["recall"]),
                         f"{r['alert_rate']:.1%}", f"{r['cases_to_review_per_1000']:.0f}"] for _, r in ops.iterrows()]
    drift = pd.read_csv(TABLES / "supervised_ap_by_quarter.csv")
    data["drift"] = json.loads(drift.round(4).to_json(orient="records"))
    seg = pd.read_csv(TABLES / "supervised_error_segments.csv")
    data["segment_rows"] = [[r["segment"], f"{r['share_of_test']:.1%}", f3(r["positive_rate"]), f3(r["avg_precision"]),
                             f3(r["false_negative_rate"]), f3(r["false_positive_rate"])] for _, r in seg.iterrows()]
    data["failure_examples"] = json.loads(pd.read_csv(TABLES / "supervised_failure_examples.csv").to_json(orient="records"))
    data["label_noise"] = json.loads(pd.read_csv(TABLES / "supervised_label_noise_check.csv").round(4).to_json(orient="records"))

# ---------- unsupervised ----------
ms = pd.read_csv(TABLES / "unsup_method_summary.csv")
data["unsup_method_rows"] = [[r["representation"].replace(" (original nb, best silhouette k<=12)", " (original notebook)"),
                              r["method"], str(r["k"]), f3(r["silhouette"]), f"{r['davies_bouldin']:.2f}",
                              f"{r['largest_cluster_share']:.1%}", f3(r["stability_ari"])] for _, r in ms.iterrows()]
link = pd.read_csv(TABLES / "unsup_linkage_comparison.csv")
data["linkage_rows"] = [[r["linkage"], str(r["k"]), f3(r["silhouette"]), f"{r['largest_cluster_share']:.1%}",
                         str(r["n_tiny_clusters"])] for _, r in link.iterrows()]

NAMES = {  # short clinical names, read off each cluster's member drugs (notebook 6, section 7)
    0: "Late-line oncology", 1: "Oral and targeted oncology", 2: "RA and immunosuppressants",
    3: "Substances of abuse, sedatives", 4: "Supplements in templated RA reports", 5: "IV and dialysis fluids",
    6: "Injectables, injection-site reactions", 7: "Mixed CNS and psychiatric", 8: "Cytotoxic chemotherapy",
    9: "Inhaled respiratory (device use)", 10: "Multiple sclerosis therapies", 11: "Ophthalmics",
    12: "Older HIV regimens (bone loss)", 13: "Cardiometabolic, ranitidine", 14: "Cardiopulmonary, anticoagulants",
    15: "Cystic fibrosis, rare disease", 16: "Injectable biologics", 17: "GLP-1 agonists, insulins",
    18: "Common anti-infectives, NSAIDs", 19: "Psychiatric, antiepileptic", 20: "Contraceptive implants, IUDs",
    21: "Topical acne, sunscreen", 22: "Parkinson's disease", 23: "Opioids, acetaminophen",
    24: "Newer HIV/HCV antivirals", 25: "Device-delivered injectables", 26: "Hospital antibiotics",
    27: "Myeloma, immuno-oncology", 28: "ADHD stimulants", 29: "OTC products, COVID antiviral",
}
km = pd.read_csv(TABLES / "unsup_kmeans_clusters.csv").set_index("cluster")
ser = pd.read_csv(TABLES / "unsup_cluster_seriousness.csv").set_index("cluster")
prev = pd.read_csv(TABLES / "unsup_cluster_prevalence_by_quarter.csv", index_col=0)
first, last = prev.iloc[:4].mean(), prev.iloc[-4:].mean()
rows = []
for c, r in km.iterrows():
    drugs = " | ".join(d.title() for d in r["top_drugs"].split(" | ")[:4])
    rx = " | ".join(x.capitalize() for x in r["characteristic_reactions"].split(" | ")[:3])
    rows.append({"cluster": int(c), "name": NAMES.get(int(c), r["label"]), "n_drugs": int(r["n_drugs"]),
                 "drugs": drugs, "reactions": rx, "serious": float(ser.loc[c, "serious_rate"]),
                 "share_first": float(first[str(c)]), "share_last": float(last[str(c)])})
rows.sort(key=lambda r: -r["serious"])
data["clusters"] = rows
data["unsup_sensitivity"] = json.loads(pd.read_csv(TABLES / "unsup_sensitivity.csv").round(3).to_json(orient="records"))

OUT.write_text(json.dumps(data, indent=1))
print("wrote", OUT, "keys:", list(data))
