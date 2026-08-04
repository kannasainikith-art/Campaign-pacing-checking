# 🚀 AI-Powered Campaign Pacing Optimization

An AI-assisted campaign optimization platform that integrates with **Google Ad Manager (GAM)** using the official SOAP API. The application analyzes campaign pacing, generates AI-driven optimization recommendations, and allows users to execute supported actions through a modern React dashboard.

---

# 📌 Features

- AI-powered campaign optimization recommendations
- Campaign monitoring dashboard
- Google Ad Manager SOAP API integration
- Live Read Line Item
- Live Pause Line Item
- Live Resume Line Item
- Frequency Cap update endpoint
- Delivery Rate update endpoint
- Creative Rotation update endpoint
- Approval workflow
- Action history using Supabase
- Responsive React UI

---

# 🏗️ System Architecture

```
React + Vite Frontend
          │
          ▼
 Flask REST API (Python)
          │
          ▼
 Google Ad Manager SOAP API
          │
          ▼
      Supabase Database
```

---

# 🛠️ Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend | React + Vite |
| Backend | Python Flask |
| Database | Supabase |
| API | Google Ad Manager SOAP API |
| SDK | Google Ads Python SDK |
| Deployment | GitHub Pages |
| Version Control | Git & GitHub |

---

# 📂 Project Structure

```
Campaign-pacing-checking/
│
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── App.jsx
│   └── main.jsx
│
├── python-api/
│   ├── app.py
│   ├── requirements.txt
│   └── googleads.yaml
│
├── package.json
├── vite.config.js
└── README.md
```

---

# ⚙️ Prerequisites

- Node.js 18+
- npm
- Python 3.10+
- Google Ad Manager Test/Production Network
- Google Ads Python SDK
- Supabase Project

---

# 🔧 Frontend Setup

```bash
npm install
npm run dev
```

Production Build

```bash
npm run build
```

Deploy

```bash
npm run deploy
```

---

# 🔧 Backend Setup

Navigate to backend folder

```bash
cd python-api
```

Install dependencies

```bash
pip install -r requirements.txt
```

Run Flask

```bash
python app.py
```

Backend URL

```
http://127.0.0.1:5000
```

---

# 🔑 Configuration

## 1. Google Ad Manager

Create a file named:

```
python-api/googleads.yaml
```

Example structure:

```yaml
ad_manager:
  application_name: YOUR_APPLICATION_NAME
  network_code: YOUR_NETWORK_CODE

api_version: v202602

oauth2:
  client_id: YOUR_CLIENT_ID
  client_secret: YOUR_CLIENT_SECRET
  refresh_token: YOUR_REFRESH_TOKEN
```

> **Do not commit real credentials to GitHub.** Keep `googleads.yaml` out of version control or use placeholders like the example above.

---

## 2. Supabase

Create a `.env` file in the frontend:

```env
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

---

# 🔌 API Endpoints

## Health Check

```
GET /
```

---

## Read Line Item

```
GET /line-item/{lineItemId}
```

---

## Pause Line Item

```
POST /pause
```

Body

```json
{
  "lineItemId": 7381858737
}
```

---

## Resume Line Item

```
POST /resume
```

Body

```json
{
  "lineItemId": 7381858737
}
```

---

## Update Line Item

```
POST /update-line-item
```

Body

```json
{
  "lineItemId": 7381858737,
  "field": "frequency_cap",
  "value": 5
}
```

Supported fields

- delivery_rate
- creative_rotation
- frequency_cap

---

# 🤖 AI Recommendation Workflow

1. Read campaign data from Google Ad Manager.
2. Analyze pacing and delivery metrics.
3. Generate AI recommendations.
4. Display recommendations in the dashboard.
5. User approves the recommendation.
6. Flask backend calls the appropriate Google Ad Manager SOAP API.
7. Store action history in Supabase.

---

# ✅ Successfully Implemented

- Google Ad Manager Authentication
- SOAP API Integration
- Read Line Item
- Pause Line Item
- Resume Line Item
- React Dashboard
- Flask REST API
- Supabase Logging
- GitHub Pages Deployment

---

# ⚠️ Known Limitation

The Google Ad Manager **test network** may reject certain update operations with:

```
ForecastingError.NO_FORECAST_YET
```

This is a sandbox limitation caused by unavailable forecast data for test inventory. Read, Pause, and Resume operations function correctly.

---

# 🚀 Future Enhancements

- Machine Learning recommendations
- Predictive pacing analytics
- Production GAM deployment
- Email & Slack notifications
- Role-based access control
- Automated optimization rules

---

# 👨‍💻 Authors

Hackathon Project

AI-Powered Campaign Pacing Optimization using Google Ad Manager SOAP API

---

# 📄 License

This project is intended for educational and hackathon demonstration purposes.