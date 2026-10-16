# Developer Onboarding Guide for Team Members (Ayaz & Samir)

Welcome to the **NeuroScope-3D** engineering team! This guide will walk you through setting up your local environment, understanding the codebase architecture, and collaborating smoothly without merge conflicts during the hackathon.

---

## 1. Project Overview & Your Role

We are building a **Brain MRI Tumor Segmentation and 3D Visualization Platform** for the Kurukshetra 24-Hour Hackathon. The platform takes 4 co-registered MRI sequences (T1, T1Gd, T2, FLAIR), runs a pretrained MONAI 3D deep-learning model to segment Whole Tumor (WT), Tumor Core (TC), and Enhancing Tumor (ET), outputs standard BraTS 2021 labels (`0, 1, 2, 4`), and visualizes the results on an interactive web viewer with volume calculations (mL).

---

## 2. Cloning the Repository

Once Sarthak has added your GitHub account as a collaborator on `sarthakkharade903-tech/NeuroScope-3D`:

```bash
# Clone the repository
git clone https://github.com/sarthakkharade903-tech/NeuroScope-3D.git
cd NeuroScope-3D

# Confirm you are on main and up to date
git checkout main
git pull origin main
```

---

## 3. Environment Setup

### Prerequisites
- **Git**
- **Python 3.11** (CRITICAL: Do not use Python 3.14 for ML dependencies)
- **Node.js 18+ or 20+** and **npm**

### A. Backend Setup (Python 3.11)
```bash
# Windows (PowerShell):
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1

# Linux / macOS:
python3.11 -m venv .venv
source .venv/bin/activate

# Upgrade pip
python -m pip install --upgrade pip

# Install dependencies (once backend/requirements.txt is added)
pip install -r backend/requirements.txt
```

### B. Frontend Setup (React + Vite)
```bash
cd frontend
npm install
npm run dev
```

---

## 4. Daily Collaboration Workflow

### Step 1: Sync with Main
Always start from the latest stable `main`:
```bash
git checkout main
git pull origin main
```

### Step 2: Create a Feature Branch
Use descriptive branch names with your name:
```bash
# Examples:
git checkout -b feature/ayaz-niivue-viewer
git checkout -b feature/samir-volume-metrics
git checkout -b fix/sarthak-affine-resample
```

### Step 3: Work & Test Locally
- Adhere strictly to [docs/UI_DESIGN_RULES.md](file:///d:/Visual%20Studio%20Code/Medical%20Brain/docs/UI_DESIGN_RULES.md).
- Follow the API contracts in [docs/ARCHITECTURE.md](file:///d:/Visual%20Studio%20Code/Medical%20Brain/docs/ARCHITECTURE.md).
- Do not commit scans, model binaries, or `.env` files (check with `git status`).

### Step 4: Commit with Semantic Messages
```bash
git add <specific-files>
git commit -m "feat: integrate synchronized crosshair in axial viewport"
```

### Step 5: Push and Open a Pull Request
```bash
git push -u origin feature/ayaz-niivue-viewer
```
Go to the GitHub repository, open a Pull Request against `main`, and tag a teammate for review.

---

## 5. Files Requiring Team Communication Before Modification

To prevent integration collisions, **always communicate in team chat before modifying**:
1. `backend/requirements.txt` or `frontend/package.json`
2. `docs/ARCHITECTURE.md` (API routes and payload schemas)
3. `docs/UI_DESIGN_RULES.md` (Color tokens, layout grids, or font rules)
4. Central routers (e.g. `main.py` or `App.jsx`)

---

## 6. Where to Find What

- **Project Requirements & BraTS Labels**: [docs/PROJECT_CONTEXT.md](file:///d:/Visual%20Studio%20Code/Medical%20Brain/docs/PROJECT_CONTEXT.md)
- **System Architecture & Data Flow**: [docs/ARCHITECTURE.md](file:///d:/Visual%20Studio%20Code/Medical%20Brain/docs/ARCHITECTURE.md)
- **UI Guidelines & Colors**: [docs/UI_DESIGN_RULES.md](file:///d:/Visual%20Studio%20Code/Medical%20Brain/docs/UI_DESIGN_RULES.md)
- **Git Branching Rules**: [docs/TEAM_WORKFLOW.md](file:///d:/Visual%20Studio%20Code/Medical%20Brain/docs/TEAM_WORKFLOW.md)
- **ADR Decisions**: [docs/DECISIONS.md](file:///d:/Visual%20Studio%20Code/Medical%20Brain/docs/DECISIONS.md)
- **Task Backlog**: [docs/TASK_BOARD.md](file:///d:/Visual%20Studio%20Code/Medical%20Brain/docs/TASK_BOARD.md)
