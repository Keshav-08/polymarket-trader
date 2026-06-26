from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@db:5432/polytrader"
    redis_url: str = "redis://redis:6379"
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_paper: bool = True

    class Config:
        env_file = ".env"

settings = Settings()
