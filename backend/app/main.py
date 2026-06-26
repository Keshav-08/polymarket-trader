from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import health, markets, portfolio, rules, trades, history, backtest, pnl, settings, watchlist
from app.core.database import create_tables

app = FastAPI(title="Polymarket Trader API", version="0.8.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    create_tables()
    print("✅ Database tables ready")


app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(markets.router, prefix="/api", tags=["markets"])
app.include_router(portfolio.router, prefix="/api", tags=["portfolio"])
app.include_router(rules.router, prefix="/api", tags=["rules"])
app.include_router(trades.router, prefix="/api", tags=["trades"])
app.include_router(history.router, prefix="/api", tags=["history"])
app.include_router(backtest.router, prefix="/api", tags=["backtest"])
app.include_router(pnl.router, prefix="/api", tags=["pnl"])
app.include_router(settings.router, prefix="/api", tags=["settings"])
app.include_router(watchlist.router, prefix="/api", tags=["watchlist"])


@app.get("/")
def root():
    return {"message": "Polymarket Trader API v0.8.0 running"}