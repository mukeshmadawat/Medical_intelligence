"""
MedIntelligence Frosted Pearl — Flask Backend
Single /api/master endpoint. Reads CSVs from the archive directory on every request.
"""
from flask import Flask, jsonify
from flask_cors import CORS
import pandas as pd, numpy as np, os, warnings
warnings.filterwarnings('ignore')

app = Flask(__name__, static_folder='../frontend', static_url_path='/')
CORS(app)

BASE_DIR = r"C:\Users\mukes\Downloads\archive"
LOCAL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

def _build_master():
    # Detect which directory to use (external vs local fallback)
    data_dir = BASE_DIR
    if not os.path.exists(data_dir) or not os.path.exists(os.path.join(data_dir, 'appointments.csv')):
        data_dir = LOCAL_DIR

    appts      = pd.read_csv(os.path.join(data_dir, 'appointments.csv'))
    billing    = pd.read_csv(os.path.join(data_dir, 'billing.csv'))
    doctors    = pd.read_csv(os.path.join(data_dir, 'doctors.csv'))
    patients   = pd.read_csv(os.path.join(data_dir, 'patients.csv'))
    treatments = pd.read_csv(os.path.join(data_dir, 'treatments.csv'))

    # Normalise
    appts.columns  = appts.columns.str.strip()
    billing.columns = billing.columns.str.strip()
    appts['status'] = appts['status'].str.strip()
    appts['appointment_date'] = pd.to_datetime(appts['appointment_date'], errors='coerce')

    # ── KPIs ─────────────────────────────────────────────────────────────────
    total     = len(appts)
    noshows   = int((appts['status'] == 'No-show').sum())
    rate      = round(noshows / total * 100, 1)
    unique_p  = int(appts['patient_id'].nunique())
    cancelled = int((appts['status'] == 'Cancelled').sum())
    completed = int((appts['status'].isin(['Scheduled','Completed'])).sum())

    noshow_ids = appts[appts['status'] == 'No-show']['appointment_id'].tolist()
    leak_tx    = treatments[treatments['appointment_id'].isin(noshow_ids)]
    leak_bill  = billing[billing['treatment_id'].isin(leak_tx['treatment_id'].tolist())]
    leakage    = round(float(leak_bill['amount'].sum()), 2)
    total_billed = round(float(billing['amount'].sum()), 2)

    at_risk_grp   = appts[appts['status']=='No-show'].groupby('patient_id').size().reset_index(name='c')
    at_risk_count = int((at_risk_grp['c'] >= 2).sum())

    kpis = {
        'total_appointments': total,
        'no_show_count':      noshows,
        'no_show_rate':       rate,
        'unique_patients':    unique_p,
        'cancelled':          cancelled,
        'completed':          completed,
        'revenue_leakage':    leakage,
        'total_billed':       total_billed,
        'average_bill':       round(float(billing['amount'].mean()), 2),
        'at_risk_patients':   at_risk_count,
    }

    # ── Trend ─────────────────────────────────────────────────────────────────
    ac = appts.dropna(subset=['appointment_date']).copy()
    ac['month'] = ac['appointment_date'].dt.to_period('M').astype(str)
    trend = (ac.groupby('month')
               .agg(total=('appointment_id','count'),
                    no_shows=('status', lambda x:(x=='No-show').sum()),
                    completed=('status', lambda x:(x.isin(['Scheduled','Completed'])).sum()),
                    cancelled=('status', lambda x:(x=='Cancelled').sum()))
               .reset_index().sort_values('month'))
    trend_list = trend.to_dict(orient='records')

    # ── Doctor performance ────────────────────────────────────────────────────
    doc_df = appts.merge(doctors, on='doctor_id', how='left')
    doc_df['full_name'] = 'Dr. ' + doc_df['first_name'].fillna('') + ' ' + doc_df['last_name'].fillna('')
    doc_perf = (doc_df.groupby(['doctor_id','full_name','specialization'])
                .agg(total=('appointment_id','count'),
                     no_shows=('status', lambda x:(x=='No-show').sum()))
                .reset_index())
    doc_perf['no_show_rate']    = round(doc_perf['no_shows'] / doc_perf['total'] * 100, 1)
    doc_perf['attendance_rate'] = round(100 - doc_perf['no_show_rate'], 1)
    doc_perf = doc_perf.sort_values('no_show_rate', ascending=False)

    # ── Specialization breakdown ──────────────────────────────────────────────
    spec_df = (doc_df.groupby('specialization')
               .agg(total=('appointment_id','count'),
                    no_shows=('status', lambda x:(x=='No-show').sum()))
               .reset_index())
    spec_df['no_show_rate'] = round(spec_df['no_shows'] / spec_df['total'] * 100, 1)
    spec_list = spec_df.sort_values('no_shows', ascending=False).to_dict(orient='records')

    # ── Reason breakdown ──────────────────────────────────────────────────────
    reason = (appts[appts['status']=='No-show']
              .groupby('reason_for_visit').size()
              .reset_index(name='count')
              .sort_values('count', ascending=False))

    # ── Billing summary ───────────────────────────────────────────────────────
    pay_status = (billing.groupby('payment_status')['amount']
                  .agg(['sum','count']).reset_index()
                  .rename(columns={'sum':'total_amount','count':'count'}))
    pay_method = (billing.groupby('payment_method')['amount'].sum()
                  .reset_index().rename(columns={'amount':'total'}))

    # ── At-risk patients ──────────────────────────────────────────────────────
    ar = (appts[appts['status']=='No-show']
          .groupby('patient_id').size().reset_index(name='no_show_count'))
    ar = ar[ar['no_show_count'] >= 2].merge(patients, on='patient_id', how='left')
    ar['full_name'] = ar['first_name'].fillna('') + ' ' + ar['last_name'].fillna('')
    total_pp = appts.groupby('patient_id').size().reset_index(name='total_appointments')
    ar = ar.merge(total_pp, on='patient_id', how='left')
    ar['no_show_rate'] = round(ar['no_show_count'] / ar['total_appointments'] * 100, 1)
    ar_cols = ['patient_id','full_name','gender','insurance_provider',
               'no_show_count','total_appointments','no_show_rate']
    # only keep columns that exist
    ar_cols = [c for c in ar_cols if c in ar.columns]
    at_risk_list = ar[ar_cols].sort_values('no_show_count', ascending=False).to_dict(orient='records')

    # ── Treatment breakdown ───────────────────────────────────────────────────
    ns_tx = treatments[treatments['appointment_id'].isin(noshow_ids)]
    tx_break = (ns_tx.groupby('treatment_type').size()
                .reset_index(name='count').sort_values('count', ascending=False))

    # ── Full appointments grid ────────────────────────────────────────────────
    grid = (appts
            .merge(doctors,  on='doctor_id',  how='left', suffixes=('','_doc'))
            .merge(patients, on='patient_id', how='left', suffixes=('','_pat')))
    grid['doctor_name']  = 'Dr. ' + grid['first_name'].fillna('') + ' ' + grid['last_name'].fillna('')
    grid['patient_name'] = grid['first_name_pat'].fillna('') + ' ' + grid['last_name_pat'].fillna('')
    grid['appointment_date'] = grid['appointment_date'].dt.strftime('%Y-%m-%d')
    grid_cols = ['appointment_id','appointment_date','appointment_time',
                 'patient_name','doctor_name','specialization','reason_for_visit','status']
    grid_cols = [c for c in grid_cols if c in grid.columns]
    grid_list = grid[grid_cols].sort_values('appointment_date', ascending=False).to_dict(orient='records')

    # ── Doctor list ───────────────────────────────────────────────────────────
    doctors['full_name'] = 'Dr. ' + doctors['first_name'].fillna('') + ' ' + doctors['last_name'].fillna('')
    doc_cols = [c for c in ['doctor_id','full_name','specialization','hospital_branch','years_experience'] if c in doctors.columns]
    doc_list = doctors[doc_cols].to_dict(orient='records')

    return {
        'kpis':               kpis,
        'trend':              trend_list,
        'doctor_performance': doc_perf.to_dict(orient='records'),
        'doctor_list':        doc_list,
        'specialization':     spec_list,
        'reason_breakdown':   reason.to_dict(orient='records'),
        'billing': {
            'payment_status_breakdown': pay_status.to_dict(orient='records'),
            'payment_method_breakdown': pay_method.to_dict(orient='records'),
            'revenue_leakage':          leakage,
            'total_billed':             total_billed,
            'average_bill':             round(float(billing['amount'].mean()), 2),
        },
        'at_risk_patients':    at_risk_list,
        'treatment_breakdown': tx_break.to_dict(orient='records'),
        'appointments':        grid_list,
    }

@app.route('/')
def index():
    return app.send_static_file('index.html')

_CACHE = None

@app.route('/api/master')
def master():
    global _CACHE
    if _CACHE is None:
        try:
            _CACHE = _build_master()
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    return jsonify(_CACHE)

@app.route('/api/reload')
def reload_data():
    """Call this endpoint to re-read CSVs after uploading new data."""
    global _CACHE
    try:
        _CACHE = _build_master()
        return jsonify({'status': 'ok', 'total': _CACHE['kpis']['total_appointments']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, port=8080, use_reloader=False)
import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)