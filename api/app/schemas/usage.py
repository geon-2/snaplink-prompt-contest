from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel


class UsageQuotaResponse(BaseModel):
    used_usd: Decimal
    remaining_usd: Decimal
    limit_usd: Decimal
    used_krw: Decimal
    remaining_krw: Decimal
    limit_krw: Decimal
    usd_to_krw_rate: Decimal
    exchange_rate_date: str
    quota_exceeded: bool
