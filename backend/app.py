"""
MedIntelligence Frosted Pearl — Flask Backend
Single /api/master endpoint.
Compatible with PythonAnywhere and local development.
"""

from flask import Flask, jsonify
from flask_cors import CORS
import pandas as pd
import os
import warnings

warnings.filterwarnings("ignore")

# Serve index.html from repository root
app = Flask(__name__, static_folder="../", static_url_path="/")
CORS(app)

# Always use backend/data folder
BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def _build_master():
    data_dir = BASE_DIR

    required_files = [
        "appointments.csv",
        "billing.csv",
        "doctors.csv",
        "patients.csv",
        "treatments.csv",
    ]

    for f in required_files:
        if not os.path.exists(os.path.join(data_dir, f)):
            raise FileNotFoundError(f"Missing file: {f}")

    appts = pd.read_csv(os.path.join(data_dir, "appointments.csv"))
    billing = pd.read_csv(os.path.join(data_dir, "billing.csv"))
    doctors = pd.read_csv(os.path.join(data_dir, "doctors.csv"))
    patients = pd.read_csv(os.path.join(data_dir, "patients.csv"))
    treatments = pd.read_csv(os.path.join(data_dir, "treatments.csv"))

    # Normalize
    appts.columns = appts.columns.str.strip()
    billing.columns = billing.columns.str.strip()

    appts["status"] = appts["status"].astype(str).str.strip()
    appts["appointment_date"] = pd.to_datetime(
        appts["appointment_date"], errors="coerce"
    )

    # ================= KPIs =================
    total = len(appts)
    noshows = int((appts["status"] == "No-show").sum())
    rate = round((noshows / total * 100), 1) if total else 0
    unique_p = int(appts["patient_id"].nunique())
    cancelled = int((appts["status"] == "Cancelled").sum())
    completed = int(
        (appts["status"].isin(["Scheduled", "Completed"])).sum()
    )

    noshow_ids = appts.loc[
        appts["status"] == "No-show", "appointment_id"
    ].tolist()

    leak_tx = treatments[
        treatments["appointment_id"].isin(noshow_ids)
    ]

    leak_bill = billing[
        billing["treatment_id"].isin(leak_tx["treatment_id"].tolist())
    ]

    leakage = round(float(leak_bill["amount"].sum()), 2)
    total_billed = round(float(billing["amount"].sum()), 2)

    at_risk_grp = (
        appts[appts["status"] == "No-show"]
        .groupby("patient_id")
        .size()
        .reset_index(name="c")
    )

    at_risk_count = int((at_risk_grp["c"] >= 2).sum())

    kpis = {
        "total_appointments": total,
        "no_show_count": noshows,
        "no_show_rate": rate,
        "unique_patients": unique_p,
        "cancelled": cancelled,
        "completed": completed,
        "revenue_leakage": leakage,
        "total_billed": total_billed,
        "average_bill": round(float(billing["amount"].mean()), 2),
        "at_risk_patients": at_risk_count,
    }

    # ================= Monthly Trend =================
    ac = appts.dropna(subset=["appointment_date"]).copy()
    ac["month"] = ac["appointment_date"].dt.to_period("M").astype(str)

    trend = (
        ac.groupby("month")
        .agg(
            total=("appointment_id", "count"),
            no_shows=("status", lambda x: (x == "No-show").sum()),
            completed=(
                "status",
                lambda x: x.isin(["Scheduled", "Completed"]).sum(),
            ),
            cancelled=("status", lambda x: (x == "Cancelled").sum()),
        )
        .reset_index()
        .sort_values("month")
    )

    trend_list = trend.to_dict("records")

    # ================= Doctor Performance =================
    doc_df = appts.merge(doctors, on="doctor_id", how="left")

    doc_df["full_name"] = (
        "Dr. "
        + doc_df["first_name"].fillna("")
        + " "
        + doc_df["last_name"].fillna("")
    )

    doc_perf = (
        doc_df.groupby(["doctor_id", "full_name", "specialization"])
        .agg(
            total=("appointment_id", "count"),
            no_shows=("status", lambda x: (x == "No-show").sum()),
        )
        .reset_index()
    )

    doc_perf["no_show_rate"] = round(
        doc_perf["no_shows"] / doc_perf["total"] * 100, 1
    )

    doc_perf["attendance_rate"] = round(
        100 - doc_perf["no_show_rate"], 1
    )

    doc_perf = doc_perf.sort_values("no_show_rate", ascending=False)

    # ================= Specialization =================
    spec_df = (
        doc_df.groupby("specialization")
        .agg(
            total=("appointment_id", "count"),
            no_shows=("status", lambda x: (x == "No-show").sum()),
        )
        .reset_index()
    )

    spec_df["no_show_rate"] = round(
        spec_df["no_shows"] / spec_df["total"] * 100, 1
    )

    spec_list = spec_df.sort_values(
        "no_shows", ascending=False
    ).to_dict("records")

    # ================= Reasons =================
    reason = (
        appts[appts["status"] == "No-show"]
        .groupby("reason_for_visit")
        .size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
    )

    # ================= Billing =================
    pay_status = (
        billing.groupby("payment_status")["amount"]
        .agg(["sum", "count"])
        .reset_index()
        .rename(columns={"sum": "total_amount"})
    )

    pay_method = (
        billing.groupby("payment_method")["amount"]
        .sum()
        .reset_index()
        .rename(columns={"amount": "total"})
    )

    # ================= At-risk Patients =================
    ar = (
        appts[appts["status"] == "No-show"]
        .groupby("patient_id")
        .size()
        .reset_index(name="no_show_count")
    )

    ar = ar[ar["no_show_count"] >= 2]

    ar = ar.merge(patients, on="patient_id", how="left")

    ar["full_name"] = (
        ar["first_name"].fillna("")
        + " "
        + ar["last_name"].fillna("")
    )

    total_pp = (
        appts.groupby("patient_id")
        .size()
        .reset_index(name="total_appointments")
    )

    ar = ar.merge(total_pp, on="patient_id")

    ar["no_show_rate"] = round(
        ar["no_show_count"] / ar["total_appointments"] * 100,
        1,
    )

    ar_cols = [
        "patient_id",
        "full_name",
        "gender",
        "insurance_provider",
        "no_show_count",
        "total_appointments",
        "no_show_rate",
    ]

    ar_cols = [c for c in ar_cols if c in ar.columns]

    at_risk_list = (
        ar[ar_cols]
        .sort_values("no_show_count", ascending=False)
        .to_dict("records")
    )

    # ================= Treatment Breakdown =================
    ns_tx = treatments[
        treatments["appointment_id"].isin(noshow_ids)
    ]

    tx_break = (
        ns_tx.groupby("treatment_type")
        .size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
    )

    # ================= Appointments Grid =================
    grid = (
        appts.merge(
            doctors,
            on="doctor_id",
            how="left",
            suffixes=("", "_doc"),
        )
        .merge(
            patients,
            on="patient_id",
            how="left",
            suffixes=("", "_pat"),
        )
    )

    grid["doctor_name"] = (
        "Dr. "
        + grid["first_name"].fillna("")
        + " "
        + grid["last_name"].fillna("")
    )

    grid["patient_name"] = (
        grid["first_name_pat"].fillna("")
        + " "
        + grid["last_name_pat"].fillna("")
    )

    grid["appointment_date"] = grid[
        "appointment_date"
    ].dt.strftime("%Y-%m-%d")

    grid_cols = [
        "appointment_id",
        "appointment_date",
        "appointment_time",
        "patient_name",
        "doctor_name",
        "specialization",
        "reason_for_visit",
        "status",
    ]

    grid_cols = [c for c in grid_cols if c in grid.columns]

    grid_list = (
        grid[grid_cols]
        .sort_values("appointment_date", ascending=False)
        .to_dict("records")
    )

    # ================= Doctor List =================
    doctors["full_name"] = (
        "Dr. "
        + doctors["first_name"].fillna("")
        + " "
        + doctors["last_name"].fillna("")
    )

    doc_cols = [
        c
        for c in [
            "doctor_id",
            "full_name",
            "specialization",
            "hospital_branch",
            "years_experience",
        ]
        if c in doctors.columns
    ]

    doc_list = doctors[doc_cols].to_dict("records")

    return {
        "kpis": kpis,
        "trend": trend_list,
        "doctor_performance": doc_perf.to_dict("records"),
        "doctor_list": doc_list,
        "specialization": spec_list,
        "reason_breakdown": reason.to_dict("records"),
        "billing": {
            "payment_status_breakdown": pay_status.to_dict("records"),
            "payment_method_breakdown": pay_method.to_dict("records"),
            "revenue_leakage": leakage,
            "total_billed": total_billed,
            "average_bill": round(float(billing["amount"].mean()), 2),
        },
        "at_risk_patients": at_risk_list,
        "treatment_breakdown": tx_break.to_dict("records"),
        "appointments": grid_list,
    }


# ================= Routes =================

@app.route("/")
def index():
    return app.send_static_file("index.html")


_CACHE = None


@app.route("/api/master")
def master():
    global _CACHE
    if _CACHE is None:
        _CACHE = _build_master()
    return jsonify(_CACHE)


@app.route("/api/reload")
def reload_data():
    global _CACHE
    _CACHE = _build_master()
    return jsonify(
        {
            "status": "ok",
            "total": _CACHE["kpis"]["total_appointments"],
        }
    )


# ================= Local Run =================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)