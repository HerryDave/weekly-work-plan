from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, groups, users, projects, members, plans, efforts, alerts, notifications, dashboard, manpower, variance, operations, project_weekly_plan

# Configure logging
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting WWP API...")
    yield
    logger.info("Shutting down WWP API...")


app = FastAPI(
    title="WWP API",
    description="Weekly Work Plan Management Platform API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5175", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(groups.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(members.router, prefix="/api/v1")
app.include_router(members.members_router, prefix="/api/v1")
app.include_router(plans.router, prefix="/api/v1")
app.include_router(efforts.router, prefix="/api/v1")
app.include_router(manpower.router, prefix="/api/v1")
app.include_router(variance.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(operations.router, prefix="/api/v1")
app.include_router(project_weekly_plan.router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"message": "WWP API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
