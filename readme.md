

# Prepare-Up 🚀

Prepare-Up is an AI-powered study assistant that transforms raw notes into **study guides, flashcards, and podcasts**.

---

## Tech Stack

- **Backend:** Python (FastAPI)
- **Frontend:** React (Next.js)
- **Database:** PostgreSQL
- **Migrations:** Alembic
- **Infrastructure:** Docker & Docker Compose

Everything runs inside Docker. You **do not** need to install Python, Node.js, or PostgreSQL locally.

---

## Prerequisites (One-Time)

Each developer must install:

- **Git**
- **Docker Desktop**

That’s it.

---

## Project Setup (First Time)

### 1️⃣ Clone the repository

```bash
git clone https://github.com/<your-org>/prepare-up.git
cd prepare-up
```

### 2️⃣ Create environment file

```bash
cp backend/.env.example backend/.env
```

> ⚠️ Do **not** commit `.env` files. Only `.env.example` should be tracked.

### 3️⃣ Start the entire stack

```bash
docker-compose up --build
```

This will:
- Build backend and frontend images
- Start PostgreSQL
- Start FastAPI backend at **http://localhost:8000**
- Start Next.js frontend at **http://localhost:3000**

---

## Daily Development Commands

### ▶️ Start the project

```bash
docker-compose up
```

### ⏹ Stop the project

```bash
docker-compose down
```

### 🔁 After pulling new changes

```bash
git pull
docker-compose up --build
```

---

## Database & Migrations

### Apply latest migrations

```bash
docker-compose exec backend alembic upgrade head
```

### Create a new migration (when models change)

```bash
docker-compose exec backend alembic revision --autogenerate -m "your message"
```

> ⚠️ Only **one person** should generate migrations at a time to avoid conflicts.

---

## Useful URLs

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **Health Check:** http://localhost:8000/health

---

## Project Structure (Simplified)

```
prepare-up/
├── backend/
│   ├── app/
│   ├── alembic/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── readme.md
```

---

## Team Workflow Rules

- ✅ Use Docker for everything
- ❌ Do not install PostgreSQL locally
- ❌ Do not run `pip install` or `npm install` on host
- ❌ Do not commit `.env` files
- ❌ Do not edit old Alembic migration files

---

## Status

✅ Infrastructure ready  
✅ Database schema ready  
🚧 Feature development in progress