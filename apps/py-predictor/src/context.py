"""Context for the Python predictor service."""

from dataclasses import dataclass
from pathlib import Path

from pydantic import Field
from service_framework import (
    DefaultEnv,
    DiagnosticContext,
    MetricsContext,
    ProcessLifecycleContext,
)
from service_framework.diagnostics import Logger


def get_monorepo_root_dir(*paths: str) -> str:
    current_file = Path(__file__)
    app_root = current_file.parent.parent
    monorepo_root = app_root.parent.parent
    return str(monorepo_root.joinpath(*paths))


class PredictorEnv(DefaultEnv):
    PORT: int = Field(default=8080, description="HTTP server port")
    PROCESS_NAME: str = Field(
        default="py-predictor", min_length=1, description="Name of the process"
    )
    STORAGE_BASE_DIR_BINANCE_TRADES: str = Field(
        default=get_monorepo_root_dir("storage", "internal-bridge", "binance", "unified", "trade"),
        description="Base directory for storing fetched data",
    )
    STORAGE_BASE_DIR_BINANCE_ORDER_BOOKS: str = Field(
        default=get_monorepo_root_dir(
            "storage", "internal-bridge", "binance", "unified", "order_book"
        ),
        description="Base directory for order book data",
    )
    BINANCE_SYMBOLS: str = Field(
        default="",
        # default="btc_usdt,eth_usdt,sol_usdt,trump_usdt,xrp_usdt",
        description="Comma-separated list of symbols",
    )
    KRAKEN_SYMBOLS: str = Field(
        default="eth_usdt",
        # default="btc_usdt,eth_usdt,sol_usdt,trump_usdt,xrp_usdt",
        description="Comma-separated list of symbols",
    )

    @property
    def binance_symbols_list(self) -> list[str]:
        return [symbol.strip() for symbol in self.BINANCE_SYMBOLS.split(",")]

    @property
    def kraken_symbols_list(self) -> list[str]:
        return [symbol.strip() for symbol in self.KRAKEN_SYMBOLS.split(",")]


@dataclass
class PredictorMetrics:
    pass


@dataclass
class PredictorContext:
    env: PredictorEnv
    diagnostic: DiagnosticContext
    process: ProcessLifecycleContext
    metrics_context: MetricsContext
    metrics: PredictorMetrics

    @property
    def logger(self) -> Logger:
        return self.diagnostic.logger
