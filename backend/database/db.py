from redis.asyncio import Redis
from sqlalchemy import URL
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from config import config

pg_config = config["postgres"]

database_url = URL.create(
    "postgresql+psycopg",
    username=pg_config["user"],
    password=pg_config["password"],
    host=pg_config["host"],
    port=int(pg_config["port"]),
    database=pg_config["database"],
)
engine = create_async_engine(
    database_url,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
)
async_session = async_sessionmaker(engine, expire_on_commit=False)


rd_config = config["redis"]
rd_client: Redis = Redis(host=rd_config["host"], port=int(rd_config["port"]), decode_responses=True)
