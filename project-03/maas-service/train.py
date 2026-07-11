"""
Trening / validacija / test klasifikatora vremenskog uslova (scikit-learn).

Tok (kao u tutorial-ima "Deploy ML model as a service"):
  1) generiši dataset (weather_gen)
  2) podeli 60/20/20 na train/val/test (stratifikovano)
  3) treniraj RandomForestClassifier
  4) izmeri accuracy/macro-F1/confusion matrix na test skupu
  5) serijalizuj model (joblib) + metrike (JSON) koje MaaS servira na /info
"""

import json

import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split

from weather_gen import CONDITIONS, FEATURES, generate_dataset

MODEL_PATH = "model.joblib"
METRICS_PATH = "metrics.json"


def main() -> None:
    df = generate_dataset()
    X = df[FEATURES].values
    y = df["summary"].values

    # 60% train, 20% val, 20% test (stratifikovano po klasi).
    X_train, X_tmp, y_train, y_tmp = train_test_split(
        X, y, test_size=0.4, random_state=42, stratify=y
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_tmp, y_tmp, test_size=0.5, random_state=42, stratify=y_tmp
    )

    clf = RandomForestClassifier(
        n_estimators=200, max_depth=12, random_state=42, n_jobs=-1
    )
    clf.fit(X_train, y_train)

    # Validacija (uvid u generalizaciju) i finalne metrike na test skupu.
    val_acc = accuracy_score(y_val, clf.predict(X_val))
    y_pred = clf.predict(X_test)
    test_acc = accuracy_score(y_test, y_pred)
    test_f1 = f1_score(y_test, y_pred, average="macro")
    cm = confusion_matrix(y_test, y_pred, labels=CONDITIONS).tolist()
    report = classification_report(
        y_test, y_pred, labels=CONDITIONS, output_dict=True, zero_division=0
    )

    metrics = {
        "model": "RandomForestClassifier",
        "features": FEATURES,
        "classes": CONDITIONS,
        "n_samples": int(len(df)),
        "split": {
            "train": int(len(X_train)),
            "val": int(len(X_val)),
            "test": int(len(X_test)),
        },
        "validation_accuracy": round(float(val_acc), 4),
        "test_accuracy": round(float(test_acc), 4),
        "test_macro_f1": round(float(test_f1), 4),
        "confusion_matrix": {"labels": CONDITIONS, "matrix": cm},
        "per_class": {
            c: {
                "precision": round(report[c]["precision"], 4),
                "recall": round(report[c]["recall"], 4),
                "f1": round(report[c]["f1-score"], 4),
            }
            for c in CONDITIONS
        },
    }

    joblib.dump(clf, MODEL_PATH)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    print("=== MaaS trening gotov ===")
    print(f"Uzoraka: {len(df)}  (train={len(X_train)}, val={len(X_val)}, test={len(X_test)})")
    print(f"Validaciona tačnost: {val_acc:.4f}")
    print(f"Test tačnost:        {test_acc:.4f}   macro-F1: {test_f1:.4f}")
    print(f"Confusion matrix (labels={CONDITIONS}):")
    for row in cm:
        print("  ", row)
    print(classification_report(y_test, y_pred, labels=CONDITIONS, zero_division=0))
    print(f"Snimljeno: {MODEL_PATH}, {METRICS_PATH}")


if __name__ == "__main__":
    main()
